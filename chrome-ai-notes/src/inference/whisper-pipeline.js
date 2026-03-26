/**
 * Whisper inference pipeline — loads Xenova/whisper-tiny.en with WebGPU
 * acceleration and transcribes 16 kHz mono PCM chunks.
 *
 * Robustness features:
 *   - Timeout on model load (2 minutes)
 *   - AbortSignal support: cancels loading if the user stops early
 *   - WebGPU → WASM fallback with proper error propagation
 *   - Concurrent load protection with timeout (no infinite hang)
 *   - Reset capability after permanent failure
 *   - Validates audio input before inference
 *   - Safe assignment: local var first, then module state
 */

import { pipeline, env } from "@xenova/transformers";
import { MODEL_ID, MODEL_LOAD_TIMEOUT_MS } from "../utils/constants.js";

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
 * @param {(progress: {status: string, progress?: number}) => void} [onProgress]
 * @param {{ signal?: AbortSignal }} [options] - Pass an AbortSignal to cancel mid-load
 * @returns {Promise<object>} the Transformers.js ASR pipeline
 */
export async function loadWhisper(onProgress, options = {}) {
  const { signal } = options;

  if (whisperPipeline) return whisperPipeline;

  if (loadState === "error") {
    throw new Error(`Model previously failed to load: ${loadError}. Call resetModel() to retry.`);
  }

  // If another caller is already loading, wait for that promise
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
    // If aborted, reset to idle (not error) so a fresh load can happen
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

  // Try WebGPU first
  try {
    checkAbort(signal);
    const result = await pipeline("automatic-speech-recognition", MODEL_ID, {
      device: "webgpu",
      progress_callback: progressCb,
    });
    checkAbort(signal);
    whisperPipeline = result;
    loadState = "ready";
    onProgress?.({ status: "ready", progress: 100 });
    return whisperPipeline;
  } catch (webgpuErr) {
    if (signal?.aborted) throw new Error("Model load was cancelled");
    console.warn("[Whisper] WebGPU failed, falling back to WASM:", webgpuErr.message);
    onProgress?.({ status: "loading-wasm-fallback", progress: 0 });
  }

  // Fallback to WASM
  try {
    checkAbort(signal);
    const result = await pipeline("automatic-speech-recognition", MODEL_ID, {
      device: "wasm",
      progress_callback: progressCb,
    });
    checkAbort(signal);
    whisperPipeline = result;
    loadState = "ready";
    onProgress?.({ status: "ready", progress: 100 });
    return whisperPipeline;
  } catch (wasmErr) {
    if (signal?.aborted) throw new Error("Model load was cancelled");
    whisperPipeline = null;
    loadState = "error";
    loadError = wasmErr.message;
    throw new Error(`Both WebGPU and WASM backends failed: ${wasmErr.message}`);
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

  // Skip silence — sample every 100th element for speed
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

// ── Silence detection (exported for testing) ──

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

/** Wrap a promise so it rejects when a signal fires. */
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
