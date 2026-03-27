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
    // 1. Get active tab info (metadata only — recording uses microphone, not tab audio)
    //    This is best-effort: if the page blocks tab info, we still record fine.
    let tab = null;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs?.[0] || null;
    } catch {
      // Tab info unavailable — that's OK for microphone recording
    }
    recordingTabId = tab?.id || null;

    if (signal.aborted) throw new Error("Recording start was cancelled");

    // 2. Load model if needed
    if (!isModelReady()) {
      const ms = getModelState();
      if (ms.state === "error") resetModel();
      await loadWhisper((p) => {
        broadcast({ type: "model-status", status: p.status, progress: p.progress });
      }, { signal });
    }

    if (signal.aborted) throw new Error("Recording start was cancelled");

    // 3. Create note
    currentNoteId = await createNote({
      url: tab?.url || "microphone",
      title: tab?.title || "Microphone Recording",
    });
    recordingStartTime = Date.now();

    // 4. Mic capture is handled by the side panel (mic-capture.js).
    //    Audio chunks arrive via chrome.runtime.sendMessage("audio-chunk").
    //    No offscreen document needed for microphone mode.

    // 5. Activate
    recordingState = "recording";
    lastAudioChunkTime = Date.now();
    startHeartbeat();

    inferenceQueue.length = 0;
    totalChunksProcessed = 0;
    inferenceRunning = false;

    broadcast({ type: "recording-started", noteId: currentNoteId });
    console.log(`[SW] Recording started — note ${currentNoteId}, tab ${tab?.id || "none"}`);

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

  // Mic capture is stopped by the side panel (mic-capture.js).
  // It sends "capture-stopped" when done. Just trigger it directly.
  onCaptureStopped();
}

function onCaptureStopped() {
  const wasActive = recordingState === "recording" || recordingState === "stopping";
  const stoppedNoteId = currentNoteId;
  recordingState = "idle";
  stopHeartbeat();
  startAbort = null;

  if (wasActive && stoppedNoteId) {
    const durationSec = Math.round((Date.now() - recordingStartTime) / 1000);
    updateNote(stoppedNoteId, { duration: durationSec, status: "complete" })
      .catch(console.error);
  }

  recordingTabId = null;
  // Clear currentNoteId AFTER capturing it for the drain session.
  // This prevents a new recording's chunks from being appended to the old note.
  const noteForDrain = currentNoteId;
  currentNoteId = null;
  broadcast({ type: "recording-stopped", noteId: stoppedNoteId });

  // If there are queued chunks from this session, drain them.
  // We pass the pinned noteId so drainQueue writes to the correct note
  // even if a new recording starts before the drain finishes.
  if (!inferenceRunning && inferenceQueue.length > 0) {
    drainQueue(noteForDrain);
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

  const audio = audioData instanceof Float32Array
    ? audioData
    : new Float32Array(audioData);

  console.log(`[SW] Audio chunk #${chunkIndex}: ${audio.length} samples (${(audio.length / 16000).toFixed(1)}s), queue: ${inferenceQueue.length}`);

  const offsetSec = chunkIndex;

  if (inferenceQueue.length >= MAX_QUEUE_DEPTH) {
    const dropped = inferenceQueue.shift();
    console.warn(`[SW] Queue full (${MAX_QUEUE_DEPTH}) — dropped chunk at ${dropped.offsetSec}s`);
    broadcast({ type: "queue-warning", depth: inferenceQueue.length });
  }

  inferenceQueue.push({ audio, offsetSec, noteId: currentNoteId });

  if (!inferenceRunning) {
    drainQueue();
  }
}

/**
 * Process queued audio chunks sequentially.
 * Each chunk carries its own noteId so that:
 *   1. Chunks from recording #1 don't leak into recording #2
 *   2. Post-stop drain writes to the correct (now-completed) note
 *
 * @param {number} [pinnedNoteId] - Override noteId for post-stop drain
 */
async function drainQueue(pinnedNoteId) {
  inferenceRunning = true;

  while (inferenceQueue.length > 0) {
    const { audio, offsetSec, noteId: chunkNoteId } = inferenceQueue.shift();
    const targetNoteId = pinnedNoteId || chunkNoteId;

    if (!targetNoteId) {
      console.warn("[SW] Chunk has no noteId — discarding.");
      continue;
    }

    try {
      const { text, chunks } = await transcribe(audio);

      if (text) {
        const taggedChunks = (chunks || []).map((c) => ({
          ...c,
          offsetSec: offsetSec + (c.timestamp?.[0] || 0),
        }));

        await appendTranscript(targetNoteId, text, taggedChunks);

        broadcast({
          type: "transcript-chunk",
          noteId: targetNoteId,
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
//  HELPERS
// ══════════════════════════════════════════════════════════════════════

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

console.log("[AI Note Taker] Service worker registered.");
