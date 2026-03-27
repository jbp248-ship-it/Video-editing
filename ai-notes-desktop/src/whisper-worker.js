/**
 * Whisper Worker — runs in a Node.js worker thread inside Electron.
 *
 * Loads onnx-community/whisper-tiny.en via @huggingface/transformers
 * and transcribes Float32Array audio chunks. The model downloads once
 * and is cached locally (~75 MB).
 *
 * Communication: receives messages from main process, sends back results.
 */

const { parentPort } = require("worker_threads");
let pipeline = null;
let transcriber = null;
let loading = false;

async function loadModel(progressCb) {
  if (transcriber) return;
  if (loading) return;
  loading = true;

  try {
    // Dynamic import for ESM module in CommonJS worker
    const { pipeline: createPipeline } = await import("@huggingface/transformers");

    progressCb({ status: "loading", progress: 0 });

    transcriber = await createPipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny.en",
      {
        progress_callback: (data) => {
          if (data.status === "progress") {
            progressCb({ status: "loading", progress: Math.round(data.progress) });
          }
        },
      }
    );

    progressCb({ status: "ready", progress: 100 });
    loading = false;
  } catch (err) {
    loading = false;
    throw err;
  }
}

parentPort.on("message", async (msg) => {
  if (msg.type === "load") {
    try {
      await loadModel((progress) => {
        parentPort.postMessage({ type: "progress", ...progress });
      });
      parentPort.postMessage({ type: "loaded" });
    } catch (err) {
      parentPort.postMessage({ type: "error", error: err.message });
    }
  }

  if (msg.type === "transcribe") {
    if (!transcriber) {
      parentPort.postMessage({
        type: "result",
        id: msg.id,
        text: "",
        error: "Model not loaded",
      });
      return;
    }

    try {
      // Convert plain array back to Float32Array
      const audio = new Float32Array(msg.audio);

      // Skip silence
      let maxAmp = 0;
      for (let i = 0; i < audio.length; i += 100) {
        const a = Math.abs(audio[i]);
        if (a > maxAmp) maxAmp = a;
      }
      if (maxAmp < 0.0001) {
        parentPort.postMessage({ type: "result", id: msg.id, text: "" });
        return;
      }

      const result = await transcriber(audio, {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
      });

      parentPort.postMessage({
        type: "result",
        id: msg.id,
        text: (result.text || "").trim(),
        chunks: result.chunks || [],
      });
    } catch (err) {
      parentPort.postMessage({
        type: "result",
        id: msg.id,
        text: "",
        error: err.message,
      });
    }
  }
});
