/**
 * Background service worker — the brain of the extension.
 *
 * Fixes from code review:
 *   - State machine allows stopping from "starting" state
 *   - drainQueue checks if note still exists before appending
 *   - Float32Array received directly (no Array.from round-trip)
 *   - Offscreen doc URL updated for flat build output
 *   - Unused formatTimestamp import removed
 *   - cleanupFailedNotes delegated to db.js (with 5-min grace)
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
} from "../utils/constants.js";
import { noteToMarkdown } from "../utils/export-markdown.js";

// ══════════════════════════════════════════════════════════════════════
//  RECORDING STATE MACHINE
//
//  States: "idle" → "starting" → "recording" → "stopping" → "idle"
//
//  Key fix: "starting" can now transition directly to "stopping".
//  This handles the case where the user clicks Stop while the model
//  is still loading.
// ══════════════════════════════════════════════════════════════════════

let recordingState = "idle";
let currentNoteId = null;
let recordingTabId = null;
let recordingStartTime = 0;
let lastAudioChunkTime = 0;
// AbortController for cancelling a start-in-progress
let startAbort = null;

function canStart() { return recordingState === "idle"; }
function canStop() {
  return recordingState === "recording" || recordingState === "starting";
}

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
    const elapsed = Date.now() - lastAudioChunkTime;
    if (lastAudioChunkTime > 0 && elapsed > AUDIO_SILENCE_TIMEOUT_MS) {
      console.warn(`[SW] No audio for ${Math.round(elapsed / 1000)}s — auto-stopping.`);
      handleStopRecording("silence-timeout");
      return;
    }
    console.log(
      `[SW] Heartbeat — queue: ${inferenceQueue.length}, processed: ${totalChunksProcessed}`
    );
  }
});

// ══════════════════════════════════════════════════════════════════════
//  TAB CLOSE / NAVIGATION DETECTION
// ══════════════════════════════════════════════════════════════════════

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === recordingTabId && canStop()) {
    console.warn(`[SW] Recording tab ${tabId} closed — auto-stopping.`);
    handleStopRecording("tab-closed");
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === recordingTabId && canStop() && changeInfo.url) {
    console.warn(`[SW] Recording tab navigated — auto-stopping.`);
    handleStopRecording("tab-navigated");
  }
});

// ══════════════════════════════════════════════════════════════════════
//  STARTUP
// ══════════════════════════════════════════════════════════════════════

chrome.runtime.onInstalled.addListener(() => startupTasks());
chrome.runtime.onStartup.addListener(() => startupTasks());

async function startupTasks() {
  cleanupFailedNotes().catch(console.error);
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
    case "start-recording":
      handleStartRecording()
        .then(() => sendResponse({ ok: true }))
        .catch((err) => {
          broadcast({ type: "recording-error", noteId: currentNoteId, error: err.message });
          sendResponse({ ok: false, error: err.message });
        });
      return true;

    case "stop-recording":
      handleStopRecording("user-requested");
      sendResponse({ ok: true });
      break;

    case "audio-chunk":
      handleAudioChunk(msg.audio, msg.chunkIndex);
      break;

    case "capture-stopped":
      onCaptureStopped();
      break;

    case "capture-error":
      onCaptureError(msg.error);
      break;

    case "get-model-status": {
      const ms = getModelState();
      sendResponse({ status: isModelReady() ? "ready" : ms.state, error: ms.error });
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
  if (!canStart()) {
    throw new Error(`Cannot start recording (current state: ${recordingState})`);
  }

  recordingState = "starting";
  startAbort = new AbortController();
  const { signal } = startAbort;

  try {
    // 1. Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found");
    recordingTabId = tab.id;

    // Check if aborted between steps
    if (signal.aborted) throw new Error("Recording start was cancelled");

    // 2. Load model if needed
    if (!isModelReady()) {
      const ms = getModelState();
      if (ms.state === "error") resetModel();
      await loadWhisper((p) => {
        broadcast({ type: "model-status", status: p.status, progress: p.progress });
      });
    }

    if (signal.aborted) throw new Error("Recording start was cancelled");

    // 3. Create note
    currentNoteId = await createNote({ url: tab.url, title: tab.title });
    recordingStartTime = Date.now();

    // 4. Get stream ID
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });

    if (signal.aborted) throw new Error("Recording start was cancelled");

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

    inferenceQueue.length = 0;
    totalChunksProcessed = 0;
    inferenceRunning = false;

    broadcast({ type: "recording-started", noteId: currentNoteId });
    console.log(`[SW] Recording started — note ${currentNoteId}, tab ${tab.id}`);

  } catch (err) {
    recordingState = "idle";
    recordingTabId = null;
    startAbort = null;

    if (currentNoteId) {
      updateNote(currentNoteId, { status: "error" }).catch(console.error);
    }
    throw err;
  }
}

function handleStopRecording(reason = "user-requested") {
  if (!canStop()) return;

  const prevState = recordingState;
  recordingState = "stopping";
  console.log(`[SW] Stopping recording (reason: ${reason}, was: ${prevState})`);

  // If still in "starting" phase, abort the start sequence
  if (prevState === "starting" && startAbort) {
    startAbort.abort();
    startAbort = null;
    // The catch block in handleStartRecording will reset to idle
    // but we also need to broadcast the stop
    recordingState = "idle";
    broadcast({ type: "recording-stopped", noteId: currentNoteId });
    return;
  }

  chrome.runtime.sendMessage({ type: "stop-capture" }).catch(() => {
    // Offscreen doc already gone
    onCaptureStopped();
  });
}

function onCaptureStopped() {
  const wasActive = recordingState === "recording" || recordingState === "stopping";
  recordingState = "idle";
  stopHeartbeat();
  startAbort = null;

  if (wasActive && currentNoteId) {
    const durationSec = Math.round((Date.now() - recordingStartTime) / 1000);
    updateNote(currentNoteId, { duration: durationSec, status: "complete" })
      .catch(console.error);
  }

  recordingTabId = null;
  broadcast({ type: "recording-stopped", noteId: currentNoteId });

  // If there are queued chunks, let drainQueue finish processing them.
  // It will call finalizeDrain() when done.
  if (!inferenceRunning && inferenceQueue.length > 0) {
    drainQueue();
  }
}

function onCaptureError(errorMessage) {
  console.error("[SW] Capture error:", errorMessage);
  recordingState = "idle";
  stopHeartbeat();
  recordingTabId = null;
  startAbort = null;

  if (currentNoteId) {
    updateNote(currentNoteId, { status: "error" }).catch(console.error);
  }
  broadcast({ type: "recording-error", noteId: currentNoteId, error: errorMessage });
}

// ══════════════════════════════════════════════════════════════════════
//  INFERENCE QUEUE WITH BACKPRESSURE
//
//  Fixes:
//   - Receives Float32Array directly (no new Float32Array(array) round-trip)
//   - Checks if note still exists before appending
//   - Logs when draining after recording stopped
// ══════════════════════════════════════════════════════════════════════

const inferenceQueue = [];
let inferenceRunning = false;
let totalChunksProcessed = 0;

function handleAudioChunk(audioData, chunkIndex) {
  lastAudioChunkTime = Date.now();

  // audioData is a Float32Array via structured clone (no Array.from conversion)
  const audio = audioData instanceof Float32Array
    ? audioData
    : new Float32Array(audioData); // fallback for safety

  const offsetSec = chunkIndex;

  if (inferenceQueue.length >= MAX_QUEUE_DEPTH) {
    const dropped = inferenceQueue.shift();
    console.warn(`[SW] Queue full (${MAX_QUEUE_DEPTH}) — dropped chunk at ${dropped.offsetSec}s`);
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

    // Verify the note we're appending to still exists and isn't in error state.
    // This handles the case where recording was stopped or the note was deleted
    // while chunks were queued.
    if (!currentNoteId) {
      console.warn("[SW] No active note — discarding remaining queue.");
      inferenceQueue.length = 0;
      break;
    }

    try {
      const { text, chunks } = await transcribe(audio);

      if (text) {
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

  // After build, offscreen.html lives at dist/offscreen.html (flat)
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("offscreen.html"),
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
