/**
 * Background service worker — orchestrates:
 *   1. Tab audio capture via chrome.tabCapture + offscreen document
 *   2. Whisper model loading (WebGPU) and inference
 *   3. IndexedDB note persistence
 *   4. Message relay between offscreen doc ↔ side panel
 */

import { loadWhisper, transcribe, isModelReady } from "../inference/whisper-pipeline.js";
import { createNote, appendTranscript } from "../storage/db.js";

// ── State ──
let currentNoteId = null;
let recording = false;

// ── Side panel: open on action click ──
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// ── Preload the Whisper model on install / startup ──
chrome.runtime.onInstalled.addListener(() => initModel());
chrome.runtime.onStartup.addListener(() => initModel());

async function initModel() {
  broadcast({ type: "model-status", status: "loading", progress: 0 });
  try {
    await loadWhisper((p) => {
      broadcast({ type: "model-status", status: p.status, progress: p.progress });
    });
  } catch (err) {
    console.error("[SW] Model load failed:", err);
  }
}

// ── Message router ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "start-recording":
      handleStartRecording().then(() => sendResponse({ ok: true }));
      return true;

    case "stop-recording":
      handleStopRecording();
      sendResponse({ ok: true });
      break;

    case "audio-chunk":
      // Relayed from the offscreen document
      handleAudioChunk(msg.audio);
      break;

    case "capture-stopped":
      recording = false;
      broadcast({ type: "recording-stopped", noteId: currentNoteId });
      break;

    case "get-model-status":
      sendResponse({
        status: isModelReady() ? "ready" : "idle",
      });
      break;
  }
});

// ── Recording lifecycle ──

async function handleStartRecording() {
  if (recording) return;

  // 1. Get the active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("No active tab");

  // 2. Ensure Whisper model is loaded
  if (!isModelReady()) {
    await loadWhisper((p) => {
      broadcast({ type: "model-status", status: p.status, progress: p.progress });
    });
  }

  // 3. Create a new note in IndexedDB
  currentNoteId = await createNote({
    url: tab.url,
    title: tab.title,
  });

  // 4. Get a tab capture stream ID
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tab.id,
  });

  // 5. Create the offscreen document (if not already open)
  await ensureOffscreenDocument();

  // 6. Tell the offscreen document to start capturing
  await chrome.runtime.sendMessage({
    type: "start-capture",
    streamId,
  });

  recording = true;
  broadcast({ type: "recording-started", noteId: currentNoteId });
}

function handleStopRecording() {
  if (!recording) return;
  chrome.runtime.sendMessage({ type: "stop-capture" });
}

// ── Audio chunk → Whisper inference ──

const chunkQueue = [];
let processing = false;

async function handleAudioChunk(audioArray) {
  // Convert the regular array back to Float32Array
  const audio = new Float32Array(audioArray);
  chunkQueue.push(audio);

  if (!processing) {
    processQueue();
  }
}

async function processQueue() {
  processing = true;

  while (chunkQueue.length > 0) {
    const audio = chunkQueue.shift();

    try {
      const { text, chunks } = await transcribe(audio);

      if (text && currentNoteId) {
        // Persist to IndexedDB
        await appendTranscript(currentNoteId, text, chunks);

        // Broadcast to the side panel for live display
        broadcast({
          type: "transcript-chunk",
          noteId: currentNoteId,
          text,
        });
      }
    } catch (err) {
      console.error("[SW] Transcription error:", err);
    }
  }

  processing = false;
}

// ── Offscreen document management ──

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("src/offscreen/offscreen.html"),
    reasons: ["USER_MEDIA"],
    justification: "Tab audio capture requires AudioContext (unavailable in service workers)",
  });
}

// ── Helpers ──

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {
    // No listeners — that's fine (side panel might be closed)
  });
}

console.log("[AI Note Taker] Service worker registered.");
