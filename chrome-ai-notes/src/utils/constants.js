/**
 * Shared constants and utilities used across service worker, side panel,
 * and export logic. Single source of truth — no duplication.
 */

// ── Audio pipeline ──
export const TARGET_SAMPLE_RATE = 16000;
export const BATCH_SIZE = 512;
// Whisper needs at least 3-5 seconds of audio to produce useful output.
// 1 second was too short — the model returned empty text for short chunks.
export const CHUNK_DURATION_SEC = 5;
export const CHUNK_FRAMES = TARGET_SAMPLE_RATE * CHUNK_DURATION_SEC; // 80,000 frames

// ── Inference queue ──
export const MAX_QUEUE_DEPTH = 120; // ~2 minutes of backlog before backpressure
export const AUDIO_SILENCE_TIMEOUT_MS = 10000; // 10s of no audio → assume stream died

// ── Model loading ──
export const MODEL_LOAD_TIMEOUT_MS = 120000; // 2 minutes max for model load
export const MODEL_ID = "onnx-community/whisper-tiny.en";

// ── Keep-alive ──
export const HEARTBEAT_ALARM = "keep-alive-heartbeat";
export const HEARTBEAT_PERIOD_MIN = 20 / 60; // 20 seconds

// ── Summary prompt ──
export const SUMMARY_SYSTEM_PROMPT = `You are an expert academic note-taker. Analyze the following lecture transcript and produce a structured summary in this exact format:

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

export const SUMMARY_MAX_WORDS = 4000;

// ── Pagination ──
export const NOTES_PAGE_SIZE = 50;

/**
 * Convert seconds to HH:MM:SS format.
 * Single source of truth — imported by service worker, UI, and export util.
 * @param {number} totalSeconds
 * @returns {string} e.g. "01:23:45"
 */
export function formatTimestamp(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}
