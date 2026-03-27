/**
 * Microphone capture module — runs in the side panel (visible context).
 *
 * The side panel has mic permission (user grants it here), so we capture
 * audio directly instead of using the offscreen document.
 *
 * Pipeline: Mic → AudioContext → AudioWorklet (downsample 48→16kHz)
 *   → 5-second chunker → chrome.runtime.sendMessage to service worker
 */

const TARGET_SR = 16000;
const CHUNK_DURATION = 5; // seconds
const CHUNK_FRAMES = TARGET_SR * CHUNK_DURATION;

let audioContext = null;
let mediaStream = null;
let sourceNode = null;
let workletNode = null;
let active = false;

// Chunker state
let chunkBuffer = new Float32Array(CHUNK_FRAMES);
let chunkWriteIdx = 0;
let chunkIndex = 0;

function resetChunker() {
  chunkBuffer = new Float32Array(CHUNK_FRAMES);
  chunkWriteIdx = 0;
  chunkIndex = 0;
}

function onWorkletSamples(samples) {
  if (!active) return;

  let srcOffset = 0;
  const srcLen = samples.length;

  while (srcOffset < srcLen) {
    const remaining = CHUNK_FRAMES - chunkWriteIdx;
    const toCopy = Math.min(remaining, srcLen - srcOffset);
    chunkBuffer.set(samples.subarray(srcOffset, srcOffset + toCopy), chunkWriteIdx);
    chunkWriteIdx += toCopy;
    srcOffset += toCopy;

    if (chunkWriteIdx === CHUNK_FRAMES) {
      shipChunk();
    }
  }
}

function shipChunk() {
  chrome.runtime.sendMessage({
    type: "audio-chunk",
    audio: chunkBuffer.slice(0, CHUNK_FRAMES),
    chunkIndex: chunkIndex++,
  }).catch(() => {});
  chunkWriteIdx = 0;
}

function flushChunker() {
  if (chunkWriteIdx > 0) {
    chrome.runtime.sendMessage({
      type: "audio-chunk",
      audio: chunkBuffer.slice(0, chunkWriteIdx),
      chunkIndex: chunkIndex++,
    }).catch(() => {});
    chunkWriteIdx = 0;
  }
}

/**
 * Start capturing from the microphone.
 * Must be called from a visible context (side panel) so Chrome shows the permission prompt.
 */
export async function startMicCapture() {
  if (active) return;

  resetChunker();

  // Get microphone — this triggers the permission prompt in the side panel
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  audioContext = new AudioContext();
  const hardwareSR = audioContext.sampleRate;

  // Load the AudioWorklet for downsampling
  const workletUrl = chrome.runtime.getURL("audio-processor.js");
  await audioContext.audioWorklet.addModule(workletUrl);

  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  workletNode = new AudioWorkletNode(audioContext, "audio-capture-processor");

  workletNode.port.postMessage({ type: "configure", sampleRate: hardwareSR });

  workletNode.port.onmessage = (e) => {
    const { type, buffer } = e.data;
    if (type === "samples") {
      onWorkletSamples(buffer);
    }
  };

  sourceNode.connect(workletNode);
  active = true;

  console.log(`[MicCapture] Started. Hardware SR: ${hardwareSR} Hz, chunk: ${CHUNK_DURATION}s`);
}

/**
 * Stop capturing and flush remaining audio.
 */
export function stopMicCapture() {
  if (!active) return;
  active = false;

  // Flush remaining audio
  if (workletNode) {
    workletNode.port.postMessage({ type: "flush" });
  }
  flushChunker();

  // Teardown
  if (sourceNode) { try { sourceNode.disconnect(); } catch {} sourceNode = null; }
  if (workletNode) { try { workletNode.disconnect(); } catch {} workletNode = null; }
  if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }

  chrome.runtime.sendMessage({ type: "capture-stopped" }).catch(() => {});
  console.log("[MicCapture] Stopped.");
}

export function isMicActive() {
  return active;
}
