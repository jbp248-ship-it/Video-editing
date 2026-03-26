/**
 * Whisper inference pipeline — loads Xenova/whisper-tiny.en with WebGPU
 * acceleration and transcribes 16 kHz mono PCM chunks.
 *
 * Usage:
 *   import { loadWhisper, transcribe } from "./whisper-pipeline.js";
 *   await loadWhisper(onProgress);          // one-time load
 *   const { text } = await transcribe(pcmFloat32Array);
 */

import { pipeline, env } from "@xenova/transformers";

// Force local model loading — no CDN fallback.
// The models are bundled into the extension's /models folder at build time.
env.localModelPath = chrome.runtime.getURL("models/");
env.allowRemoteModels = false;
// Prefer WebGPU, fall back to WASM
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("wasm/");

const MODEL_ID = "Xenova/whisper-tiny.en";

let whisperPipeline = null;
let loading = false;

/**
 * Load the Whisper model. Safe to call multiple times — returns the cached
 * pipeline after the first load.
 *
 * @param {(progress: {status: string, progress?: number}) => void} onProgress
 * @returns {Promise<object>} the Transformers.js ASR pipeline
 */
export async function loadWhisper(onProgress) {
  if (whisperPipeline) return whisperPipeline;
  if (loading) {
    // Another caller is already loading; wait for it
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (whisperPipeline) {
          clearInterval(check);
          resolve(whisperPipeline);
        }
      }, 200);
    });
  }

  loading = true;
  onProgress?.({ status: "loading", progress: 0 });

  try {
    whisperPipeline = await pipeline(
      "automatic-speech-recognition",
      MODEL_ID,
      {
        // Prefer WebGPU for speed; Transformers.js auto-detects support
        device: "webgpu",
        progress_callback: (data) => {
          if (data.status === "progress") {
            onProgress?.({
              status: "loading",
              progress: Math.round(data.progress),
            });
          }
        },
      }
    );

    onProgress?.({ status: "ready", progress: 100 });
    return whisperPipeline;
  } catch (err) {
    // If WebGPU unavailable, retry with WASM backend
    console.warn("[Whisper] WebGPU failed, falling back to WASM:", err);
    onProgress?.({ status: "loading-wasm-fallback", progress: 0 });

    whisperPipeline = await pipeline(
      "automatic-speech-recognition",
      MODEL_ID,
      {
        device: "wasm",
        progress_callback: (data) => {
          if (data.status === "progress") {
            onProgress?.({
              status: "loading",
              progress: Math.round(data.progress),
            });
          }
        },
      }
    );

    onProgress?.({ status: "ready", progress: 100 });
    return whisperPipeline;
  } finally {
    loading = false;
  }
}

/**
 * Transcribe a 16 kHz mono PCM chunk.
 *
 * @param {Float32Array} audio – 16 kHz mono PCM samples
 * @returns {Promise<{ text: string }>}
 */
export async function transcribe(audio) {
  if (!whisperPipeline) {
    throw new Error("Whisper model not loaded. Call loadWhisper() first.");
  }

  const result = await whisperPipeline(audio, {
    // whisper-tiny.en is English-only; skip language detection
    language: "en",
    task: "transcribe",
    // Return timestamps for potential future use (highlights, etc.)
    return_timestamps: true,
    // Chunk length in seconds for long audio
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  return { text: result.text.trim(), chunks: result.chunks };
}

/**
 * Check if the model is loaded and ready.
 */
export function isModelReady() {
  return whisperPipeline !== null;
}
