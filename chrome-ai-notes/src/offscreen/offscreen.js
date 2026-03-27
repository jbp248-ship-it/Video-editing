/**
 * Offscreen document — captures audio and pipes it through AudioWorklet.
 *
 * Supports two modes:
 *   - "microphone": records from the user's mic (for in-person lectures)
 *   - "tab": records from a browser tab (for online videos/meetings)
 */

const TARGET_SR = 16000;
// 5 seconds of audio per chunk — Whisper needs this much to produce useful output
const CHUNK_FRAMES = TARGET_SR * 5;

// ── State ──
let audioContext = null;
let mediaStream = null;
let sourceNode = null;
let workletNode = null;
let capturing = false;
let flushing = false;
let flushGeneration = 0;

// ── 1-Second Chunker ──
let chunkBuffer = new Float32Array(CHUNK_FRAMES);
let chunkWriteIdx = 0;
let chunkIndex = 0;

function resetChunker() {
  chunkBuffer = new Float32Array(CHUNK_FRAMES);
  chunkWriteIdx = 0;
  chunkIndex = 0;
}

function onWorkletSamples(samples) {
  if (!capturing && !flushing) return;

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
  safeSend({
    type: "audio-chunk",
    audio: chunkBuffer.slice(0, CHUNK_FRAMES),
    chunkIndex: chunkIndex++,
  });
  chunkWriteIdx = 0;
}

function flushChunker() {
  if (chunkWriteIdx > 0) {
    safeSend({
      type: "audio-chunk",
      audio: chunkBuffer.slice(0, chunkWriteIdx),
      chunkIndex: chunkIndex++,
    });
    chunkWriteIdx = 0;
  }
}

// ── Message handler ──

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "start-capture") {
    // mode: "microphone" (default) or "tab"
    const mode = msg.mode || "microphone";
    startCapture(mode, msg.streamId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error("[Offscreen] Capture error:", err);
        safeSend({ type: "capture-error", error: err.message });
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  if (msg.type === "stop-capture") {
    initiateStop("user-requested");
    sendResponse({ ok: true });
  }
});

// ── Capture lifecycle ──

async function startCapture(mode, streamId) {
  if (capturing || flushing) {
    teardown();
    flushing = false;
  }

  resetChunker();

  // 1. Get audio stream based on mode
  try {
    if (mode === "tab" && streamId) {
      // Tab audio capture
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: streamId,
          },
        },
      });
    } else {
      // Microphone capture (default for in-person lectures)
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    }
  } catch (err) {
    throw new Error(`Failed to get audio: ${err.message}. Make sure your microphone is connected and allowed.`);
  }

  // 2. Detect stream death
  for (const track of mediaStream.getAudioTracks()) {
    track.onended = () => {
      console.warn("[Offscreen] Audio track ended.");
      initiateStop("stream-ended");
    };
  }
  mediaStream.oninactive = () => {
    console.warn("[Offscreen] MediaStream inactive.");
    initiateStop("stream-inactive");
  };

  // 3. Create AudioContext
  try {
    audioContext = new AudioContext();
  } catch (err) {
    teardown();
    throw new Error(`Failed to create AudioContext: ${err.message}`);
  }

  const hardwareSR = audioContext.sampleRate;

  // 4. Load AudioWorklet
  try {
    const workletUrl = chrome.runtime.getURL("audio-processor.js");
    await audioContext.audioWorklet.addModule(workletUrl);
  } catch (err) {
    teardown();
    throw new Error(`Failed to load audio worklet: ${err.message}`);
  }

  // 5. Build audio graph
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  workletNode = new AudioWorkletNode(audioContext, "audio-capture-processor");

  workletNode.port.postMessage({ type: "configure", sampleRate: hardwareSR });

  workletNode.port.onmessage = (e) => {
    const { type, buffer } = e.data;
    if (type === "samples") {
      onWorkletSamples(buffer);
    } else if (type === "flushed") {
      flushChunker();
      safeSend({ type: "capture-stopped" });
      flushing = false;
      teardown();
    }
  };

  sourceNode.connect(workletNode);
  capturing = true;

  console.log(`[Offscreen] Capture started (${mode}). Hardware SR: ${hardwareSR} Hz, chunk size: ${CHUNK_FRAMES} samples (${CHUNK_FRAMES / TARGET_SR}s)`);
}

function initiateStop(reason) {
  if (!capturing && !flushing) return;
  if (flushing) return;

  console.log(`[Offscreen] Stopping (reason: ${reason})`);
  flushing = true;
  capturing = false;
  const gen = ++flushGeneration;

  if (workletNode) {
    workletNode.port.postMessage({ type: "flush" });
    setTimeout(() => {
      if (flushing && flushGeneration === gen) {
        console.warn("[Offscreen] Flush timeout — forcing teardown.");
        flushChunker();
        safeSend({ type: "capture-stopped" });
        flushing = false;
        teardown();
      }
    }, 2000);
  } else {
    flushChunker();
    safeSend({ type: "capture-stopped" });
    flushing = false;
    teardown();
  }
}

function teardown() {
  if (sourceNode) { try { sourceNode.disconnect(); } catch {} sourceNode = null; }
  if (workletNode) { try { workletNode.disconnect(); } catch {} workletNode = null; }
  if (audioContext && audioContext.state !== "closed") { audioContext.close().catch(() => {}); audioContext = null; }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    mediaStream.oninactive = null;
    mediaStream = null;
  }
  capturing = false;
}

function safeSend(msg) {
  chrome.runtime.sendMessage(msg).catch((err) => {
    console.warn("[Offscreen] Failed to send:", msg.type, err.message);
  });
}
