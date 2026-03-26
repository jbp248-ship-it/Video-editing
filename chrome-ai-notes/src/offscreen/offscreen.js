/**
 * Offscreen document — bridges chrome.tabCapture → AudioWorklet → Service Worker.
 *
 * Responsibilities:
 *   1. Accept a tabCapture streamId, create a MediaStreamAudioSourceNode
 *   2. Connect to the AudioWorkletNode (audio-capture-processor)
 *   3. Aggregate the 512-sample batches from the worklet into 1-second
 *      Float32Array chunks (16,000 samples at 16 kHz)
 *   4. Ship each 1-second chunk to the service worker for Whisper inference
 *
 * Why 1-second chunks?
 *   - Short enough for low-latency live transcription
 *   - Long enough that Whisper can produce coherent tokens
 *   - Aligns well with the service worker's inference queue
 *
 * Messages IN  (from service worker):
 *   { type: "start-capture", streamId: string }
 *   { type: "stop-capture" }
 *
 * Messages OUT (to service worker):
 *   { type: "audio-chunk", audio: number[], chunkIndex: number }
 *   { type: "capture-stopped" }
 *   { type: "capture-error", error: string }
 */

const TARGET_SR = 16000;
const ONE_SECOND_FRAMES = TARGET_SR; // 16,000 samples = 1 second

// ── State ──
let audioContext = null;
let mediaStream = null;
let sourceNode = null;
let workletNode = null;

// ── 1-Second Chunker ──
// Aggregates 512-sample batches from the worklet into 1-second buffers.
let chunkBuffer = new Float32Array(ONE_SECOND_FRAMES);
let chunkWriteIdx = 0;
let chunkIndex = 0; // monotonically increasing chunk ID

function resetChunker() {
  chunkBuffer = new Float32Array(ONE_SECOND_FRAMES);
  chunkWriteIdx = 0;
  chunkIndex = 0;
}

/**
 * Called for every 512-sample batch from the worklet.
 * Copies into the 1-second buffer; when full, ships to the service worker.
 */
function onWorkletSamples(samples) {
  let srcOffset = 0;
  const srcLen = samples.length;

  while (srcOffset < srcLen) {
    const remaining = ONE_SECOND_FRAMES - chunkWriteIdx;
    const toCopy = Math.min(remaining, srcLen - srcOffset);

    // Fast typed-array copy
    chunkBuffer.set(samples.subarray(srcOffset, srcOffset + toCopy), chunkWriteIdx);
    chunkWriteIdx += toCopy;
    srcOffset += toCopy;

    if (chunkWriteIdx === ONE_SECOND_FRAMES) {
      shipChunk();
    }
  }
}

/**
 * Send a full 1-second chunk to the service worker.
 * We convert to a plain Array because chrome.runtime.sendMessage uses
 * structured clone (Float32Array survives, but some Chrome versions
 * have issues; plain arrays are universally safe).
 */
function shipChunk() {
  chrome.runtime.sendMessage({
    type: "audio-chunk",
    audio: Array.from(chunkBuffer),
    chunkIndex: chunkIndex++,
  });
  // Reset for next second
  chunkWriteIdx = 0;
  // Reuse the same buffer (no allocation)
}

/**
 * Flush any partial chunk remaining (< 1 second) when recording stops.
 */
function flushChunker() {
  if (chunkWriteIdx > 0) {
    chrome.runtime.sendMessage({
      type: "audio-chunk",
      audio: Array.from(chunkBuffer.subarray(0, chunkWriteIdx)),
      chunkIndex: chunkIndex++,
    });
    chunkWriteIdx = 0;
  }
}

// ── Message handler ──

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "start-capture") {
    startCapture(msg.streamId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error("[Offscreen] Capture error:", err);
        chrome.runtime.sendMessage({
          type: "capture-error",
          error: err.message,
        });
        sendResponse({ ok: false, error: err.message });
      });
    return true; // async sendResponse
  }

  if (msg.type === "stop-capture") {
    stopCapture();
    sendResponse({ ok: true });
  }
});

// ── Capture lifecycle ──

async function startCapture(streamId) {
  // Reset chunker state for a fresh recording
  resetChunker();

  // 1. Obtain the tab's media stream
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
  });

  // 2. Create AudioContext at the system's native sample rate
  audioContext = new AudioContext();
  const hardwareSR = audioContext.sampleRate;

  // 3. Load the AudioWorklet processor
  const workletUrl = chrome.runtime.getURL("src/audio/audio-processor.js");
  await audioContext.audioWorklet.addModule(workletUrl);

  // 4. Build the audio graph: stream → source → worklet
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  workletNode = new AudioWorkletNode(audioContext, "audio-capture-processor");

  // Tell the worklet the hardware sample rate for correct downsampling
  workletNode.port.postMessage({
    type: "configure",
    sampleRate: hardwareSR,
  });

  // 5. Listen for 512-sample batches and feed them into the chunker
  workletNode.port.onmessage = (e) => {
    const { type, buffer } = e.data;
    if (type === "samples") {
      onWorkletSamples(buffer);
    } else if (type === "flushed") {
      // Worklet has flushed; now flush our own chunker
      flushChunker();
      chrome.runtime.sendMessage({ type: "capture-stopped" });
    }
  };

  sourceNode.connect(workletNode);
  // Do NOT connect to audioContext.destination — silent capture only

  console.log(
    `[Offscreen] Capture started. Hardware SR: ${hardwareSR} Hz → ` +
    `Worklet outputs 512-sample batches at ${TARGET_SR} Hz → ` +
    `Chunker ships 1-second (${ONE_SECOND_FRAMES} sample) buffers`
  );
}

function stopCapture() {
  // 1. Tell the worklet to flush its internal 512-sample buffer
  if (workletNode) {
    workletNode.port.postMessage({ type: "flush" });
    // The "flushed" response will trigger flushChunker() + "capture-stopped"
  }

  // 2. Tear down the audio graph
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  if (workletNode) {
    workletNode.disconnect();
    workletNode = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }

  console.log("[Offscreen] Capture stopped — teardown complete.");
}
