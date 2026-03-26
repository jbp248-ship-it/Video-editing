/**
 * Offscreen document — bridges chrome.tabCapture → AudioWorklet → Service Worker.
 *
 * Fixes from code review:
 *   - Zero-copy: sends Float32Array directly (structured clone), not Array.from()
 *   - Race-safe flush: tracks a flushGeneration to prevent stale timeout teardowns
 *   - MediaStream.onended / oninactive for stream death detection
 *   - Guards against samples arriving after teardown
 *   - All chrome.runtime.sendMessage wrapped with .catch()
 */

const TARGET_SR = 16000;
const ONE_SECOND_FRAMES = TARGET_SR;

// ── State ──
let audioContext = null;
let mediaStream = null;
let sourceNode = null;
let workletNode = null;
let capturing = false;
let flushing = false;
// Incremented every time initiateStop is called. The flush timeout checks
// this to avoid tearing down a NEW session that started during the window.
let flushGeneration = 0;

// ── 1-Second Chunker ──
let chunkBuffer = new Float32Array(ONE_SECOND_FRAMES);
let chunkWriteIdx = 0;
let chunkIndex = 0;

function resetChunker() {
  chunkBuffer = new Float32Array(ONE_SECOND_FRAMES);
  chunkWriteIdx = 0;
  chunkIndex = 0;
}

function onWorkletSamples(samples) {
  if (!capturing && !flushing) return;

  let srcOffset = 0;
  const srcLen = samples.length;

  while (srcOffset < srcLen) {
    const remaining = ONE_SECOND_FRAMES - chunkWriteIdx;
    const toCopy = Math.min(remaining, srcLen - srcOffset);

    chunkBuffer.set(samples.subarray(srcOffset, srcOffset + toCopy), chunkWriteIdx);
    chunkWriteIdx += toCopy;
    srcOffset += toCopy;

    if (chunkWriteIdx === ONE_SECOND_FRAMES) {
      shipChunk();
    }
  }
}

/**
 * Ship a 1-second chunk to the service worker.
 * Sends Float32Array directly — structured clone handles typed arrays
 * efficiently without boxing into Number objects. This eliminates the
 * ~690MB of GC pressure over a 90-minute lecture that Array.from() caused.
 */
function shipChunk() {
  // .slice() creates a copy since chunkBuffer is reused
  safeSend({
    type: "audio-chunk",
    audio: chunkBuffer.slice(0, ONE_SECOND_FRAMES),
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
    startCapture(msg.streamId)
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

async function startCapture(streamId) {
  // Tear down any previous session
  if (capturing || flushing) {
    teardown();
    flushing = false;
  }

  resetChunker();

  // 1. Obtain the tab's media stream
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
    });
  } catch (err) {
    throw new Error(`Failed to get media stream: ${err.message}`);
  }

  // 2. Detect stream death (tab closed, navigated away)
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
  // After build, the worklet lives at dist/audio-processor.js (flat)
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

  console.log(`[Offscreen] Capture started. Hardware SR: ${hardwareSR} Hz`);
}

/**
 * Initiate graceful stop. Flushes the worklet before tearing down.
 * Uses flushGeneration to prevent a stale timeout from killing a new session.
 */
function initiateStop(reason) {
  if (!capturing && !flushing) return;
  // Prevent re-entry while already flushing
  if (flushing) return;

  console.log(`[Offscreen] Stopping (reason: ${reason})`);
  flushing = true;
  capturing = false;
  const gen = ++flushGeneration;

  if (workletNode) {
    workletNode.port.postMessage({ type: "flush" });

    // Safety timeout — only fires if this generation is still current.
    // If a new startCapture() was called in the meantime, gen !== flushGeneration
    // and the timeout is a no-op.
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
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch {}
    sourceNode = null;
  }
  if (workletNode) {
    try { workletNode.disconnect(); } catch {}
    workletNode = null;
  }
  if (audioContext && audioContext.state !== "closed") {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
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
