/**
 * Whisper inference pipeline — loads onnx-community/whisper-tiny.en
 * using @huggingface/transformers (successor to @xenova/transformers).
 *
 * Key change: @xenova/transformers v2 had "Unsupported model type: whisper"
 * because its pipeline API didn't fully support the whisper config format.
 * @huggingface/transformers v3 has native Whisper support.
 */

import { pipeline, env } from "@huggingface/transformers";
import { MODEL_ID, MODEL_LOAD_TIMEOUT_MS } from "../utils/constants.js";

// Force local model loading — no CDN fallback.
env.localModelPath = chrome.runtime.getURL("models/");
env.allowRemoteModels = true; // Allow first-time download from HuggingFace
// After first load, models are cached in browser storage by transformers.js

let whisperPipeline = null;
let loadState = "idle"; // "idle" | "loading" | "ready" | "error"
let loadError = null;
let loadPromise = null;

/**
 * Load the Whisper model. Safe to call multiple times.
 *
 * @param {(progress: {status: string, progress?: number}) => void} [onProgress]
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<object>} the Transformers.js ASR pipeline
 */
export async function loadWhisper(onProgress, options = {}) {
  const { signal } = options;

  if (whisperPipeline) return whisperPipeline;

  if (loadState === "error") {
    throw new Error(`Model previously failed to load: ${loadError}. Call resetModel() to retry.`);
  }

  if (loadState === "loading" && loadPromise) {
    return withTimeout(
      abortable(loadPromise, signal),
      MODEL_LOAD_TIMEOUT_MS,
      "Model load timed out (waiting for concurrent load)"
    );
  }

  loadState = "loading";
  loadError = null;
  onProgress?.({ status: "loading", progress: 0 });

  loadPromise = _doLoad(onProgress, signal);

  try {
    const result = await withTimeout(
      abortable(loadPromise, signal),
      MODEL_LOAD_TIMEOUT_MS,
      "Model load timed out"
    );
    return result;
  } catch (err) {
    if (signal?.aborted) {
      loadState = "idle";
      loadPromise = null;
      throw new Error("Model load was cancelled");
    }
    loadState = "error";
    loadError = err.message;
    loadPromise = null;
    throw err;
  }
}

async function _doLoad(onProgress, signal) {
  const progressCb = (data) => {
    if (signal?.aborted) return;
    if (data.status === "progress") {
      onProgress?.({ status: "loading", progress: Math.round(data.progress) });
    }
  };

  // @huggingface/transformers v3: try WASM first (most reliable in extensions),
  // then WebGPU. The v3 API uses `device` option differently.
  try {
    checkAbort(signal);
    const result = await pipeline("automatic-speech-recognition", MODEL_ID, {
      progress_callback: progressCb,
      // v3 defaults to WASM which works in all Chrome extension contexts
    });
    checkAbort(signal);
    whisperPipeline = result;
    loadState = "ready";
    onProgress?.({ status: "ready", progress: 100 });
    return whisperPipeline;
  } catch (err) {
    if (signal?.aborted) throw new Error("Model load was cancelled");
    whisperPipeline = null;
    loadState = "error";
    loadError = err.message;
    throw new Error(`Model load failed: ${err.message}`);
  }
}

/**
 * Transcribe a 16 kHz mono PCM chunk.
 */
export async function transcribe(audio) {
  if (!whisperPipeline) {
    throw new Error("Whisper model not loaded. Call loadWhisper() first.");
  }

  if (!(audio instanceof Float32Array) || audio.length === 0) {
    return { text: "", chunks: [] };
  }

  // Skip silence — use a very low threshold so we don't accidentally
  // filter out quiet speech from a microphone across the room
  if (isSilent(audio, 0.0001)) {
    return { text: "", chunks: [] };
  }

  console.log(`[Whisper] Transcribing ${audio.length} samples (${(audio.length / 16000).toFixed(1)}s)...`);

  const result = await whisperPipeline(audio, {
    language: "en",
    task: "transcribe",
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  return {
    text: (result.text || "").trim(),
    chunks: result.chunks || [],
  };
}

export function isModelReady() {
  return loadState === "ready" && whisperPipeline !== null;
}

export function getModelState() {
  return { state: loadState, error: loadError };
}

export function resetModel() {
  whisperPipeline = null;
  loadState = "idle";
  loadError = null;
  loadPromise = null;
}

export function isSilent(audio, threshold = 0.001) {
  if (!(audio instanceof Float32Array) || audio.length === 0) return true;
  for (let i = 0; i < audio.length; i += 100) {
    if (Math.abs(audio[i]) >= threshold) return false;
  }
  return true;
}

// ── Helpers ──

function checkAbort(signal) {
  if (signal?.aborted) throw new Error("Model load was cancelled");
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error("Aborted"));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error("Model load was cancelled"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (val) => { signal.removeEventListener("abort", onAbort); resolve(val); },
      (err) => { signal.removeEventListener("abort", onAbort); reject(err); }
    );
  });
}
