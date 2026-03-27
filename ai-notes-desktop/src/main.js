/**
 * Whisper transcription running in the Electron MAIN process.
 *
 * Why main process instead of worker thread?
 *   @huggingface/transformers uses onnxruntime-node which has native
 *   .node addons. Worker threads can't load addons compiled for the
 *   main thread — they crash with "Module did not self-register."
 *
 * We force the WASM backend to avoid native addon issues entirely.
 * WASM is slightly slower but works everywhere reliably.
 */

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

let mainWindow;
let wss;
let transcriber = null;
let modelLoading = false;
let modelReady = false;
let isRecording = false;

const AUTH_TOKEN = crypto.randomBytes(16).toString("hex");
const WS_PORT = 8765;

// ── Whisper Model (main process) ──

async function loadWhisperModel() {
  if (transcriber || modelLoading) return;
  modelLoading = true;

  sendToRenderer("whisper-message", { type: "progress", status: "loading", progress: 0 });

  try {
    console.log("[Whisper] Importing @huggingface/transformers...");
    const { pipeline, env } = await import("@huggingface/transformers");

    // Force WASM backend — avoids native .node addon issues
    env.backends.onnx.wasm.numThreads = 1;

    console.log("[Whisper] Loading onnx-community/whisper-tiny.en...");

    transcriber = await pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny.en",
      {
        progress_callback: (data) => {
          if (data.status === "progress") {
            sendToRenderer("whisper-message", {
              type: "progress",
              status: "loading",
              progress: Math.round(data.progress),
            });
          }
        },
      }
    );

    modelReady = true;
    modelLoading = false;
    console.log("[Whisper] Model loaded successfully");
    sendToRenderer("whisper-message", { type: "loaded" });
  } catch (err) {
    modelLoading = false;
    console.error("[Whisper] Load failed:", err.message);
    sendToRenderer("whisper-message", { type: "error", error: err.message });
  }
}

async function transcribeAudio(data) {
  if (!transcriber) {
    sendToRenderer("whisper-message", { type: "result", id: data.id, text: "", error: "Model not loaded" });
    return;
  }

  try {
    const audio = new Float32Array(data.audio);

    // Skip silence
    let maxAmp = 0;
    for (let i = 0; i < audio.length; i += 100) {
      const a = Math.abs(audio[i]);
      if (a > maxAmp) maxAmp = a;
    }
    if (maxAmp < 0.0001) {
      sendToRenderer("whisper-message", { type: "result", id: data.id, text: "" });
      return;
    }

    console.log(`[Whisper] Transcribing ${audio.length} samples (amp: ${maxAmp.toFixed(4)})...`);
    const result = await transcriber(audio, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const text = (result.text || "").trim();
    console.log(`[Whisper] Result: "${text.slice(0, 60)}"`);

    sendToRenderer("whisper-message", {
      type: "result",
      id: data.id,
      text,
      chunks: result.chunks || [],
    });
  } catch (err) {
    console.error("[Whisper] Transcription error:", err.message);
    sendToRenderer("whisper-message", { type: "result", id: data.id, text: "", error: err.message });
  }
}

// IPC handlers
ipcMain.on("whisper-transcribe", (_event, data) => transcribeAudio(data));
ipcMain.on("whisper-load", () => loadWhisperModel());
ipcMain.on("recording-state", (_event, state) => { isRecording = state; });

// ── WebSocket Server (Chrome extension bridge) ──

function startWebSocketServer() {
  try {
    wss = new WebSocketServer({ port: WS_PORT, host: "127.0.0.1" });
  } catch (err) {
    console.error("[WS] Failed to start:", err.message);
    return;
  }

  wss.on("listening", () => {
    console.log(`[WS] Server on ws://127.0.0.1:${WS_PORT}`);
    sendToRenderer("ws-auth-token", AUTH_TOKEN);
  });

  wss.on("connection", (ws) => {
    let authenticated = false;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!authenticated) {
          if (msg.type === "auth" && msg.token === AUTH_TOKEN) {
            authenticated = true;
            ws.send(JSON.stringify({ type: "auth-ok" }));
            sendToRenderer("extension-connected", true);
          } else {
            ws.close();
          }
          return;
        }
        sendToRenderer("extension-message", msg);
      } catch {}
    });

    ws.on("close", () => {
      if (authenticated) sendToRenderer("extension-connected", false);
    });
  });

  wss.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[WS] Port ${WS_PORT} in use — another instance running?`);
    }
  });
}

// ── Electron Window ──

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    minWidth: 600,
    minHeight: 500,
    title: "AI Note Taker",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.webContents.session.setPermissionRequestHandler(
    (_wc, permission, callback) => { callback(permission === "media"); }
  );

  mainWindow.on("close", (e) => {
    if (isRecording) {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: "warning",
        buttons: ["Stop Recording & Close", "Cancel"],
        defaultId: 1,
        title: "Recording in Progress",
        message: "You are currently recording. Close anyway?",
      });
      if (choice === 1) e.preventDefault();
    }
  });
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

app.whenReady().then(() => {
  createWindow();
  startWebSocketServer();
  // Start loading Whisper model immediately
  loadWhisperModel();
});

app.on("window-all-closed", () => {
  if (wss) wss.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
