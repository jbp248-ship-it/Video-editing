/**
 * Whisper Worker — runs in a Node.js worker thread inside Electron.
 */

const { parentPort } = require("worker_threads");
let transcriber = null;
let loading = false;

console.log("[Whisper Worker] Started");

async function loadModel(progressCb) {
  if (transcriber) return;
  if (loading) return;
  loading = true;

  try {
    console.log("[Whisper Worker] Importing @huggingface/transformers...");
    const mod = await import("@huggingface/transformers");
    const createPipeline = mod.pipeline;
    console.log("[Whisper Worker] Import successful, loading model...");

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

    console.log("[Whisper Worker] Model loaded successfully");
    progressCb({ status: "ready", progress: 100 });
    loading = false;
  } catch (err) {
    loading = false;
    console.error("[Whisper Worker] Load error:", err);
    throw err;
  }
}

parentPort.on("message", async (msg) => {
  console.log("[Whisper Worker] Received:", msg.type);

  if (msg.type === "load") {
    try {
      await loadModel((progress) => {
        parentPort.postMessage({ type: "progress", ...progress });
      });
      parentPort.postMessage({ type: "loaded" });
    } catch (err) {
      console.error("[Whisper Worker] Load failed:", err.message);
      parentPort.postMessage({ type: "error", error: err.message });
    }
  }

  if (msg.type === "transcribe") {
    if (!transcriber) {
      console.warn("[Whisper Worker] Transcribe called but model not loaded");
      parentPort.postMessage({ type: "result", id: msg.id, text: "", error: "Model not loaded" });
      return;
    }

    try {
      const audio = new Float32Array(msg.audio);
      console.log(`[Whisper Worker] Transcribing ${audio.length} samples...`);

      // Skip silence
      let maxAmp = 0;
      for (let i = 0; i < audio.length; i += 100) {
        const a = Math.abs(audio[i]);
        if (a > maxAmp) maxAmp = a;
      }

      if (maxAmp < 0.0001) {
        console.log("[Whisper Worker] Silence detected, skipping");
        parentPort.postMessage({ type: "result", id: msg.id, text: "" });
        return;
      }

      console.log(`[Whisper Worker] Max amplitude: ${maxAmp.toFixed(4)}, running inference...`);
      const result = await transcriber(audio, {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
      });

      const text = (result.text || "").trim();
      console.log(`[Whisper Worker] Result: "${text.slice(0, 80)}"`);

      parentPort.postMessage({
        type: "result",
        id: msg.id,
        text,
        chunks: result.chunks || [],
      });
    } catch (err) {
      console.error("[Whisper Worker] Transcription error:", err.message);
      parentPort.postMessage({ type: "result", id: msg.id, text: "", error: err.message });
    }
  }
});
