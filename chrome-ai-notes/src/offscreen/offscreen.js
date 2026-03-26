/**
 * Offscreen document — bridges chrome.tabCapture → AudioWorklet → Service Worker.
 *
 * Robustness features:
 *   - MediaStream.onended / oninactive detection (tab close, navigation)
 *   - Race-safe flush: defers teardown until worklet flush completes
 *   - All chrome.runtime.sendMessage calls wrapped with .catch()
 *   - Guard against messages arriving after teardown
 *   - AudioContext creation failure handling
 */

import { ONE_SECOND_FRAMES, TARGET_SAMPLE_RATE } from "../utils/constants.js";

// ── State ──
let audioContext = null;
let mediaStream = null;
let sourceNode = null;
let workletNode = null;
let capturing = false; // true while audio graph is active
let flushing = false;  // true during the flush → teardown sequence

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
  // Guard: ignore samples after teardown started
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

function shipChunk() {
  safeSend({
    type: "audio-chunk",
    audio: Array.from(chunkBuffer),
    chunkIndex: chunkIndex++,
  });
  chunkWriteIdx = 0;
}

function flushChunker() {
  if (chunkWriteIdx > 0) {
    safeSend({
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
  if (capturing) {
    teardown();
  }

  resetChunker();
  flushing = false;

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

  // 2. Detect stream death (tab closed, navigated away, etc.)
  for (const track of mediaStream.getAudioTracks()) {
    track.onended = () => {
      console.warn("[Offscreen] Audio track ended (tab closed or navigated).");
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
    const workletUrl = chrome.runtime.getURL("src/audio/audio-processor.js");
    await audioContext.audioWorklet.addModule(workletUrl);
  } catch (err) {
    teardown();
    throw new Error(`Failed to load audio worklet: ${err.message}`);
  }

  // 5. Build audio graph
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  workletNode = new AudioWorkletNode(audioContext, "audio-capture-processor");

  workletNode.port.postMessage({
    type: "configure",
    sampleRate: hardwareSR,
  });

  workletNode.port.onmessage = (e) => {
    const { type, buffer } = e.data;
    if (type === "samples") {
      onWorkletSamples(buffer);
    } else if (type === "flushed") {
      // Worklet flush complete → flush our chunker → signal SW → teardown
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
 * Initiate a graceful stop. Flushes the worklet buffer before tearing down.
 * @param {string} reason - Why we're stopping (for logging)
 */
function initiateStop(reason) {
  if (!capturing || flushing) return;

  console.log(`[Offscreen] Stopping capture (reason: ${reason})`);
  flushing = true;
  capturing = false;

  if (workletNode) {
    // Request flush — the "flushed" response will trigger teardown
    workletNode.port.postMessage({ type: "flush" });

    // Safety: if the worklet never responds (already disconnected), force teardown
    setTimeout(() => {
      if (flushing) {
        console.warn("[Offscreen] Flush timeout — forcing teardown.");
        flushChunker();
        safeSend({ type: "capture-stopped" });
        flushing = false;
        teardown();
      }
    }, 2000);
  } else {
    // No worklet — just flush and signal
    flushChunker();
    safeSend({ type: "capture-stopped" });
    flushing = false;
    teardown();
  }
}

/**
 * Tear down all audio resources. Safe to call multiple times.
 */
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

/**
 * Send a message to the service worker, swallowing errors
 * (the SW might be dead or restarting).
 */
function safeSend(msg) {
  chrome.runtime.sendMessage(msg).catch((err) => {
    console.warn("[Offscreen] Failed to send message:", msg.type, err.message);
  });
}
