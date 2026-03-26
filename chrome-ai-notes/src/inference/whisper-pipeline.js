/**
 * Whisper inference pipeline — loads Xenova/whisper-tiny.en with WebGPU
 * acceleration and transcribes 16 kHz mono PCM chunks.
 *
 * Robustness features:
 *   - Timeout on model load (2 minutes)
 *   - WebGPU → WASM fallback with proper error propagation
 *   - Concurrent load protection with timeout (no infinite hang)
 *   - Reset capability after permanent failure
 *   - Validates audio input before inference
 */

import { pipeline, env } from "@xenova/transformers";
import { MODEL_ID, MODEL_LOAD_TIMEOUT_MS } from "../utils/constants.js";

// Force local model loading — no CDN fallback.
env.localModelPath = chrome.runtime.getURL("models/");
env.allowRemoteModels = false;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("wasm/");

let whisperPipeline = null;
let loadState = "idle"; // "idle" | "loading" | "ready" | "error"
let loadError = null;
let loadPromise = null;

/**
 * Load the Whisper model. Safe to call multiple times.
 *
 * - Returns cached pipeline if already loaded.
 * - If another call is loading, waits for it (with timeout).
 * - On failure, enters "error" state. Call resetModel() to retry.
 *
 * @param {(progress: {status: string, progress?: number}) => void} [onProgress]
 * @returns {Promise<object>} the Transformers.js ASR pipeline
 */
export async function loadWhisper(onProgress) {
  if (whisperPipeline) return whisperPipeline;

  // If a previous load failed permanently, don't silently retry
  if (loadState === "error") {
    throw new Error(`Model previously failed to load: ${loadError}. Call resetModel() to retry.`);
  }

  // If another caller is loading, wait for that same promise (with timeout)
  if (loadState === "loading" && loadPromise) {
    return withTimeout(loadPromise, MODEL_LOAD_TIMEOUT_MS, "Model load timed out (waiting for concurrent load)");
  }

  loadState = "loading";
  loadError = null;
  onProgress?.({ status: "loading", progress: 0 });

  loadPromise = _doLoad(onProgress);

  try {
    const result = await withTimeout(loadPromise, MODEL_LOAD_TIMEOUT_MS, "Model load timed out");
    return result;
  } catch (err) {
    loadState = "error";
    loadError = err.message;
    loadPromise = null;
    throw err;
  }
}

async function _doLoad(onProgress) {
  const progressCb = (data) => {
    if (data.status === "progress") {
      onProgress?.({ status: "loading", progress: Math.round(data.progress) });
    }
  };

  // Try WebGPU first
  try {
    whisperPipeline = await pipeline("automatic-speech-recognition", MODEL_ID, {
      device: "webgpu",
      progress_callback: progressCb,
    });
    loadState = "ready";
    onProgress?.({ status: "ready", progress: 100 });
    return whisperPipeline;
  } catch (webgpuErr) {
    console.warn("[Whisper] WebGPU failed, falling back to WASM:", webgpuErr.message);
    onProgress?.({ status: "loading-wasm-fallback", progress: 0 });
  }

  // Fallback to WASM
  try {
    whisperPipeline = await pipeline("automatic-speech-recognition", MODEL_ID, {
      device: "wasm",
      progress_callback: progressCb,
    });
    loadState = "ready";
    onProgress?.({ status: "ready", progress: 100 });
    return whisperPipeline;
  } catch (wasmErr) {
    whisperPipeline = null;
    loadState = "error";
    loadError = wasmErr.message;
    throw new Error(`Both WebGPU and WASM backends failed: ${wasmErr.message}`);
  }
}

/**
 * Transcribe a 16 kHz mono PCM chunk.
 * Validates input before inference.
 *
 * @param {Float32Array} audio – 16 kHz mono PCM samples
 * @returns {Promise<{ text: string, chunks: Array }>}
 */
export async function transcribe(audio) {
  if (!whisperPipeline) {
    throw new Error("Whisper model not loaded. Call loadWhisper() first.");
  }

  // Validate audio input
  if (!(audio instanceof Float32Array) || audio.length === 0) {
    return { text: "", chunks: [] };
  }

  // Skip silence (all near-zero samples) — saves inference time
  let maxAmp = 0;
  for (let i = 0; i < audio.length; i += 100) {
    const abs = Math.abs(audio[i]);
    if (abs > maxAmp) maxAmp = abs;
  }
  if (maxAmp < 0.001) {
    return { text: "", chunks: [] };
  }

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

/**
 * Check if the model is loaded and ready for inference.
 */
export function isModelReady() {
  return loadState === "ready" && whisperPipeline !== null;
}

/**
 * Get the current load state for UI display.
 * @returns {{ state: string, error: string|null }}
 */
export function getModelState() {
  return { state: loadState, error: loadError };
}

/**
 * Reset after a permanent failure so loadWhisper() can be retried.
 */
export function resetModel() {
  whisperPipeline = null;
  loadState = "idle";
  loadError = null;
  loadPromise = null;
}

// ── Helpers ──

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}
