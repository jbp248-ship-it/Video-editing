/**
 * Background service worker — the brain of the extension.
 *
 * Robustness features:
 *   - Tab close detection via chrome.tabs.onRemoved
 *   - Audio silence timeout (10s of no chunks → auto-stop)
 *   - Recording state machine (prevents race conditions)
 *   - Inference queue with backpressure (max 120 chunks)
 *   - Keep-alive heartbeat via chrome.alarms
 *   - Cleanup of failed notes on startup
 *   - All message handlers return proper responses
 *   - Model retry after failure (via resetModel)
 */

import {
  loadWhisper, transcribe, isModelReady, getModelState, resetModel,
} from "../inference/whisper-pipeline.js";
import {
  createNote, appendTranscript, updateNote, getNote,
  cleanupFailedNotes,
} from "../storage/db.js";
import {
  HEARTBEAT_ALARM, HEARTBEAT_PERIOD_MIN,
  MAX_QUEUE_DEPTH, AUDIO_SILENCE_TIMEOUT_MS,
  formatTimestamp,
} from "../utils/constants.js";
import { noteToMarkdown } from "../utils/export-markdown.js";

// ══════════════════════════════════════════════════════════════════════
//  RECORDING STATE MACHINE
//
//  States: "idle" → "starting" → "recording" → "stopping" → "idle"
//
//  This prevents race conditions from rapid Start/Stop clicks or
//  concurrent message handling.
// ══════════════════════════════════════════════════════════════════════

let recordingState = "idle"; // "idle" | "starting" | "recording" | "stopping"
let currentNoteId = null;
let recordingTabId = null;
let recordingStartTime = 0;
let lastAudioChunkTime = 0; // for silence timeout detection

function canStartRecording() { return recordingState === "idle"; }
function canStopRecording() { return recordingState === "recording"; }

// ══════════════════════════════════════════════════════════════════════
//  SIDE PANEL
// ══════════════════════════════════════════════════════════════════════

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// ══════════════════════════════════════════════════════════════════════
//  KEEP-ALIVE HEARTBEAT
// ══════════════════════════════════════════════════════════════════════

function startHeartbeat() {
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_PERIOD_MIN });
}

function stopHeartbeat() {
  chrome.alarms.clear(HEARTBEAT_ALARM);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== HEARTBEAT_ALARM) return;

  if (recordingState === "recording") {
    // Check for audio silence timeout
    const elapsed = Date.now() - lastAudioChunkTime;
    if (lastAudioChunkTime > 0 && elapsed > AUDIO_SILENCE_TIMEOUT_MS) {
      console.warn(`[SW] No audio for ${Math.round(elapsed / 1000)}s — auto-stopping.`);
      handleStopRecording("silence-timeout");
      return;
    }

    console.log(
      `[SW] Heartbeat — state: ${recordingState}, queue: ${inferenceQueue.length}, ` +
      `processed: ${totalChunksProcessed}`
    );
  }
});

// ══════════════════════════════════════════════════════════════════════
//  TAB CLOSE DETECTION
//
//  If the user closes the tab being recorded, we auto-stop.
// ══════════════════════════════════════════════════════════════════════

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === recordingTabId && recordingState === "recording") {
    console.warn(`[SW] Recording tab ${tabId} was closed — auto-stopping.`);
    handleStopRecording("tab-closed");
  }
});

// Also detect tab navigation (URL change) — the stream will die
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (
    tabId === recordingTabId &&
    recordingState === "recording" &&
    changeInfo.url
  ) {
    console.warn(`[SW] Recording tab navigated — auto-stopping.`);
    handleStopRecording("tab-navigated");
  }
});

// ══════════════════════════════════════════════════════════════════════
//  MODEL PRELOAD + STARTUP CLEANUP
// ══════════════════════════════════════════════════════════════════════

chrome.runtime.onInstalled.addListener(() => { startupTasks(); });
chrome.runtime.onStartup.addListener(() => { startupTasks(); });

async function startupTasks() {
  // Clean up notes from previous failed recordings
  cleanupFailedNotes().catch(console.error);
  // Preload the model
  initModel();
}

async function initModel() {
  broadcast({ type: "model-status", status: "loading", progress: 0 });
  try {
    await loadWhisper((p) => {
      broadcast({ type: "model-status", status: p.status, progress: p.progress });
    });
  } catch (err) {
    console.error("[SW] Model load failed:", err.message);
    broadcast({ type: "model-status", status: "error", error: err.message, progress: 0 });
  }
}

// ══════════════════════════════════════════════════════════════════════
//  MESSAGE ROUTER
// ══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    // ── Recording controls ──
    case "start-recording":
      handleStartRecording()
        .then(() => sendResponse({ ok: true }))
        .catch((err) => {
          broadcast({
            type: "recording-error",
            noteId: currentNoteId,
            error: err.message,
          });
          sendResponse({ ok: false, error: err.message });
        });
      return true;

    case "stop-recording":
      handleStopRecording("user-requested");
      sendResponse({ ok: true });
      break;

    // ── Audio data (from offscreen) ──
    case "audio-chunk":
      handleAudioChunk(msg.audio, msg.chunkIndex);
      break;

    case "capture-stopped":
      onCaptureStopped();
      break;

    case "capture-error":
      onCaptureError(msg.error);
      break;

    // ── Queries ──
    case "get-model-status": {
      const ms = getModelState();
      sendResponse({
        status: isModelReady() ? "ready" : ms.state,
        error: ms.error,
      });
      break;
    }

    case "retry-model-load":
      resetModel();
      initModel();
      sendResponse({ ok: true });
      break;

    case "export-markdown":
      handleExportMarkdown(msg.noteId)
        .then((md) => sendResponse({ ok: true, markdown: md }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
  }
});

// ══════════════════════════════════════════════════════════════════════
//  RECORDING LIFECYCLE
// ══════════════════════════════════════════════════════════════════════

async function handleStartRecording() {
  if (!canStartRecording()) {
    throw new Error(`Cannot start recording (current state: ${recordingState})`);
  }

  recordingState = "starting";

  try {
    // 1. Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error("No active tab found");
    }
    recordingTabId = tab.id;

    // 2. Load model if needed
    if (!isModelReady()) {
      const modelState = getModelState();
      if (modelState.state === "error") {
        resetModel(); // allow retry
      }
      await loadWhisper((p) => {
        broadcast({ type: "model-status", status: p.status, progress: p.progress });
      });
    }

    // 3. Create note
    currentNoteId = await createNote({ url: tab.url, title: tab.title });
    recordingStartTime = Date.now();

    // 4. Get stream ID
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id,
    });

    // 5. Create offscreen document
    await ensureOffscreenDocument();

    // 6. Start capture
    const response = await chrome.runtime.sendMessage({
      type: "start-capture",
      streamId,
    });

    if (response && !response.ok) {
      throw new Error(response.error || "Offscreen capture failed");
    }

    // 7. Activate
    recordingState = "recording";
    lastAudioChunkTime = Date.now();
    startHeartbeat();

    // Reset inference queue
    inferenceQueue.length = 0;
    totalChunksProcessed = 0;
    inferenceRunning = false;

    broadcast({ type: "recording-started", noteId: currentNoteId });
    console.log(`[SW] Recording started — note ${currentNoteId}, tab ${tab.id}`);

  } catch (err) {
    // Roll back to idle on any failure
    recordingState = "idle";
    recordingTabId = null;

    // Mark the note as failed if it was created
    if (currentNoteId) {
      updateNote(currentNoteId, { status: "error" }).catch(console.error);
    }

    throw err;
  }
}

function handleStopRecording(reason = "user-requested") {
  if (!canStopRecording()) return;

  recordingState = "stopping";
  console.log(`[SW] Stopping recording (reason: ${reason})`);

  chrome.runtime.sendMessage({ type: "stop-capture" }).catch(() => {
    // Offscreen doc might already be gone (e.g., tab close)
    onCaptureStopped();
  });
}

function onCaptureStopped() {
  const wasActive = recordingState === "recording" || recordingState === "stopping";
  recordingState = "idle";
  stopHeartbeat();

  if (wasActive && currentNoteId) {
    const durationSec = Math.round((Date.now() - recordingStartTime) / 1000);
    updateNote(currentNoteId, {
      duration: durationSec,
      status: "complete",
    }).catch(console.error);
  }

  recordingTabId = null;
  broadcast({ type: "recording-stopped", noteId: currentNoteId });
  console.log("[SW] Recording stopped.");
}

function onCaptureError(errorMessage) {
  console.error("[SW] Capture error:", errorMessage);

  recordingState = "idle";
  stopHeartbeat();
  recordingTabId = null;

  if (currentNoteId) {
    updateNote(currentNoteId, { status: "error" }).catch(console.error);
  }

  broadcast({
    type: "recording-error",
    noteId: currentNoteId,
    error: errorMessage,
  });
}

// ══════════════════════════════════════════════════════════════════════
//  INFERENCE QUEUE WITH BACKPRESSURE
// ══════════════════════════════════════════════════════════════════════

const inferenceQueue = [];
let inferenceRunning = false;
let totalChunksProcessed = 0;

function handleAudioChunk(audioArray, chunkIndex) {
  lastAudioChunkTime = Date.now();

  const audio = new Float32Array(audioArray);
  const offsetSec = chunkIndex;

  // Backpressure: if queue is too deep, drop the oldest chunk
  // (better to lose old audio than overflow memory)
  if (inferenceQueue.length >= MAX_QUEUE_DEPTH) {
    const dropped = inferenceQueue.shift();
    console.warn(
      `[SW] Queue full (${MAX_QUEUE_DEPTH}) — dropped chunk at ${dropped.offsetSec}s`
    );
    broadcast({ type: "queue-warning", depth: inferenceQueue.length });
  }

  inferenceQueue.push({ audio, offsetSec });

  if (!inferenceRunning) {
    drainQueue();
  }
}

async function drainQueue() {
  inferenceRunning = true;

  while (inferenceQueue.length > 0) {
    const { audio, offsetSec } = inferenceQueue.shift();

    try {
      const { text, chunks } = await transcribe(audio);

      if (text && currentNoteId) {
        const taggedChunks = (chunks || []).map((c) => ({
          ...c,
          offsetSec: offsetSec + (c.timestamp?.[0] || 0),
        }));

        await appendTranscript(currentNoteId, text, taggedChunks);

        broadcast({
          type: "transcript-chunk",
          noteId: currentNoteId,
          text,
          offsetSec,
          queueDepth: inferenceQueue.length,
        });

        totalChunksProcessed++;
      }
    } catch (err) {
      console.error("[SW] Transcription error:", err.message);
      // Continue processing — don't let one bad chunk kill the session
    }
  }

  inferenceRunning = false;
}

// ══════════════════════════════════════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════════════════════════════════════

async function handleExportMarkdown(noteId) {
  const note = await getNote(noteId);
  if (!note) throw new Error(`Note ${noteId} not found`);
  return noteToMarkdown(note);
}

// ══════════════════════════════════════════════════════════════════════
//  OFFSCREEN DOCUMENT
// ══════════════════════════════════════════════════════════════════════

async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });

  if (contexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("src/offscreen/offscreen.html"),
    reasons: ["USER_MEDIA"],
    justification: "Tab audio capture requires AudioContext (unavailable in service workers)",
  });
}

// ══════════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════════

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

console.log("[AI Note Taker] Service worker registered.");
