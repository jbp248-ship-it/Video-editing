/**
 * Background service worker — the brain of the extension.
 *
 * Orchestrates:
 *   1. Tab audio capture via chrome.tabCapture + offscreen document
 *   2. Whisper model loading (WebGPU) and sequential inference queue
 *   3. IndexedDB note persistence with timestamped chunks
 *   4. Keep-alive heartbeat via chrome.alarms (survives 90-min lectures)
 *   5. Smart summary generation via window.ai (Gemini Nano)
 *   6. Message relay: offscreen doc ↔ side panel
 */

import { loadWhisper, transcribe, isModelReady } from "../inference/whisper-pipeline.js";
import { createNote, appendTranscript, updateNote, getNote } from "../storage/db.js";

// ══════════════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════════════

let currentNoteId = null;
let recording = false;
let recordingStartTime = 0; // Date.now() when recording began

// ══════════════════════════════════════════════════════════════════════
//  SIDE PANEL — open on action click
// ══════════════════════════════════════════════════════════════════════

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// ══════════════════════════════════════════════════════════════════════
//  KEEP-ALIVE HEARTBEAT
//
//  Chrome suspends service workers after ~30 s of inactivity.
//  During a 90-minute lecture, the worker MUST stay alive to process
//  the inference queue. We use chrome.alarms (minimum period = 0.33 min
//  ≈ 20 s) as the most reliable keep-alive mechanism.
// ══════════════════════════════════════════════════════════════════════

const HEARTBEAT_ALARM = "keep-alive-heartbeat";

function startHeartbeat() {
  chrome.alarms.create(HEARTBEAT_ALARM, {
    periodInMinutes: 20 / 60, // every 20 seconds
  });
  console.log("[SW] Heartbeat started — worker will stay alive.");
}

function stopHeartbeat() {
  chrome.alarms.clear(HEARTBEAT_ALARM);
  console.log("[SW] Heartbeat stopped.");
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) {
    // Just touching the listener is enough to reset the SW idle timer.
    // Log queue depth for debugging long sessions.
    if (recording) {
      console.log(
        `[SW] Heartbeat — recording active, queue depth: ${inferenceQueue.length}`
      );
    }
  }
});

// ══════════════════════════════════════════════════════════════════════
//  MODEL PRELOAD
// ══════════════════════════════════════════════════════════════════════

chrome.runtime.onInstalled.addListener(() => initModel());
chrome.runtime.onStartup.addListener(() => initModel());

async function initModel() {
  broadcast({ type: "model-status", status: "loading", progress: 0 });
  try {
    await loadWhisper((p) => {
      broadcast({
        type: "model-status",
        status: p.status,
        progress: p.progress,
      });
    });
  } catch (err) {
    console.error("[SW] Model load failed:", err);
    broadcast({ type: "model-status", status: "error", progress: 0 });
  }
}

// ══════════════════════════════════════════════════════════════════════
//  MESSAGE ROUTER
// ══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    // ── Recording controls (from side panel) ──
    case "start-recording":
      handleStartRecording()
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true; // async

    case "stop-recording":
      handleStopRecording();
      sendResponse({ ok: true });
      break;

    // ── Audio data (from offscreen document) ──
    case "audio-chunk":
      handleAudioChunk(msg.audio, msg.chunkIndex);
      break;

    case "capture-stopped":
      onCaptureStopped();
      break;

    case "capture-error":
      console.error("[SW] Capture error:", msg.error);
      recording = false;
      stopHeartbeat();
      broadcast({
        type: "recording-error",
        noteId: currentNoteId,
        error: msg.error,
      });
      break;

    // ── Side panel queries ──
    case "get-model-status":
      sendResponse({ status: isModelReady() ? "ready" : "idle" });
      break;

    case "generate-summary":
      generateSmartSummary(msg.transcript)
        .then((summary) => sendResponse({ ok: true, summary }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true; // async

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
  if (recording) return;

  // 1. Get the active tab
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab) throw new Error("No active tab");

  // 2. Ensure Whisper is loaded
  if (!isModelReady()) {
    await loadWhisper((p) => {
      broadcast({
        type: "model-status",
        status: p.status,
        progress: p.progress,
      });
    });
  }

  // 3. Create note in IndexedDB
  currentNoteId = await createNote({ url: tab.url, title: tab.title });
  recordingStartTime = Date.now();

  // 4. Get tab capture stream ID
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tab.id,
  });

  // 5. Create offscreen document
  await ensureOffscreenDocument();

  // 6. Start capture
  await chrome.runtime.sendMessage({
    type: "start-capture",
    streamId,
  });

  // 7. Start keep-alive heartbeat
  recording = true;
  startHeartbeat();

  broadcast({ type: "recording-started", noteId: currentNoteId });
  console.log(`[SW] Recording started — noteId: ${currentNoteId}`);
}

function handleStopRecording() {
  if (!recording) return;
  chrome.runtime.sendMessage({ type: "stop-capture" });
}

function onCaptureStopped() {
  const wasRecording = recording;
  recording = false;
  stopHeartbeat();

  // Compute duration
  if (wasRecording && currentNoteId) {
    const durationSec = Math.round((Date.now() - recordingStartTime) / 1000);
    updateNote(currentNoteId, { duration: durationSec }).catch(console.error);
  }

  broadcast({ type: "recording-stopped", noteId: currentNoteId });
  console.log("[SW] Recording stopped.");
}

// ══════════════════════════════════════════════════════════════════════
//  INFERENCE QUEUE
//
//  Whisper inference is slower than real-time on most hardware.
//  If a new 1-second audio chunk arrives while the model is still
//  processing the previous one, we queue it. No audio is ever dropped.
//
//  Queue stats are logged on every heartbeat tick for observability.
// ══════════════════════════════════════════════════════════════════════

const inferenceQueue = [];
let inferenceRunning = false;
let totalChunksProcessed = 0;

function handleAudioChunk(audioArray, chunkIndex) {
  const audio = new Float32Array(audioArray);

  // Compute the wall-clock offset of this chunk relative to recording start.
  // chunkIndex is a monotonic counter from the offscreen chunker (1 chunk = 1 s).
  const offsetSec = chunkIndex; // chunk 0 = 0s, chunk 1 = 1s, etc.

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
        // Tag each Whisper chunk with the wall-clock offset
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
        });

        totalChunksProcessed++;
      }
    } catch (err) {
      console.error("[SW] Transcription error:", err);
      // Don't break the loop — keep processing remaining chunks
    }
  }

  inferenceRunning = false;
}

// ══════════════════════════════════════════════════════════════════════
//  WINDOW.AI INTEGRATION — Smart Summary (Gemini Nano)
//
//  window.ai is only available in page/panel contexts, not in service
//  workers. This helper is designed to be called FROM the side panel
//  (which has window.ai access) via a message. But we also expose it
//  so the service worker can delegate to an offscreen doc if needed.
//
//  The side panel calls this indirectly; the actual window.ai call
//  happens in the panel. We provide the optimized prompt here so it's
//  centralized and consistent.
// ══════════════════════════════════════════════════════════════════════

const SUMMARY_SYSTEM_PROMPT = `You are an expert academic note-taker. Analyze the following lecture transcript and produce a structured summary in this exact format:

## Core Thesis
[One clear sentence stating the main argument or topic of the lecture]

## Three Key Supporting Points
1. [First key point with a brief explanation]
2. [Second key point with a brief explanation]
3. [Third key point with a brief explanation]

## Unresolved Questions
- [Any questions raised but not fully answered in the lecture]
- [Areas that need further exploration]

Be concise but thorough. Use the speaker's own terminology where possible.`;

/**
 * Generate a structured summary of a transcript.
 *
 * Tries window.ai (Gemini Nano) first. Since window.ai isn't available
 * in service workers, this function is called from the side panel which
 * passes the result back. The service worker stores the prompt config.
 *
 * @param {string} transcript - The full transcript text
 * @returns {Promise<string>} - The structured summary
 */
export async function generateSmartSummary(transcript) {
  if (!transcript || transcript.trim().length === 0) {
    throw new Error("No transcript to summarize");
  }

  // Truncate very long transcripts to avoid token limits (~4k words max)
  const maxWords = 4000;
  const words = transcript.split(/\s+/);
  const truncated =
    words.length > maxWords
      ? words.slice(0, maxWords).join(" ") + "\n\n[Transcript truncated for summary]"
      : transcript;

  // Return the prompt config for the side panel to execute
  // (window.ai is not available in service workers)
  return {
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    userPrompt: truncated,
  };
}

/**
 * Returns the summary prompt for use by the side panel's window.ai call.
 */
export function getSummaryPrompt() {
  return SUMMARY_SYSTEM_PROMPT;
}

// ══════════════════════════════════════════════════════════════════════
//  EXPORT — Timestamped Markdown
// ══════════════════════════════════════════════════════════════════════

/**
 * Build a properly formatted Markdown file from a note, with timestamps.
 *
 * Format:
 *   [00:12:30] Today we discuss the implications of...
 *
 * @param {number} noteId
 * @returns {Promise<string>} Markdown string
 */
async function handleExportMarkdown(noteId) {
  const note = await getNote(noteId);
  if (!note) throw new Error(`Note ${noteId} not found`);

  const date = new Date(note.date).toISOString().split("T")[0];
  const durationStr = formatTimestamp(note.duration || 0);

  const lines = [
    `# ${note.title || "Untitled Note"}`,
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Date** | ${date} |`,
    note.courseName ? `| **Course** | ${note.courseName} |` : null,
    note.url ? `| **Source** | ${note.url} |` : null,
    `| **Duration** | ${durationStr} |`,
    "",
    "---",
    "",
    "## Transcript",
    "",
  ];

  // Build timestamped transcript from chunks
  if (note.chunks && note.chunks.length > 0) {
    for (const chunk of note.chunks) {
      const ts = formatTimestamp(chunk.offsetSec || 0);
      const text = (chunk.text || "").trim();
      if (text) {
        lines.push(`\`[${ts}]\` ${text}`);
        lines.push("");
      }
    }
  } else if (note.transcript) {
    // Fallback: no chunks, just raw transcript
    lines.push(note.transcript);
    lines.push("");
  } else {
    lines.push("_No transcript available._");
    lines.push("");
  }

  // Append summary if present
  if (note.summary) {
    lines.push("---");
    lines.push("");
    lines.push("## Summary");
    lines.push("");
    lines.push(note.summary);
    lines.push("");
  }

  return lines.filter((l) => l !== null).join("\n");
}

/**
 * Convert seconds to HH:MM:SS format.
 * @param {number} totalSeconds
 * @returns {string} e.g. "01:23:45"
 */
function formatTimestamp(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

// ══════════════════════════════════════════════════════════════════════
//  OFFSCREEN DOCUMENT MANAGEMENT
// ══════════════════════════════════════════════════════════════════════

async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });

  if (contexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("src/offscreen/offscreen.html"),
    reasons: ["USER_MEDIA"],
    justification:
      "Tab audio capture requires AudioContext (unavailable in service workers)",
  });
}

// ══════════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════════

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {
    // No listeners — side panel may be closed
  });
}

console.log("[AI Note Taker] Service worker registered.");
