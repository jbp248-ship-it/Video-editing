const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const crypto = require("crypto");
const { Worker } = require("worker_threads");
const { WebSocketServer } = require("ws");

let mainWindow;
let wss;
let whisperWorker;
let isRecording = false;

const AUTH_TOKEN = crypto.randomBytes(16).toString("hex");
const WS_PORT = 8765;

// ── Whisper Worker ──
// Runs @huggingface/transformers in a Node.js worker thread.
// The renderer sends audio chunks via IPC, the worker transcribes them.

function startWhisperWorker() {
  whisperWorker = new Worker(path.join(__dirname, "whisper-worker.js"));

  whisperWorker.on("message", (msg) => {
    // Forward all worker messages to the renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("whisper-message", msg);
    }
  });

  whisperWorker.on("error", (err) => {
    console.error("[Whisper Worker] Error:", err.message);
  });

  // Start loading the model immediately
  whisperWorker.postMessage({ type: "load" });
}

// IPC: renderer sends audio to transcribe
ipcMain.on("whisper-transcribe", (_event, data) => {
  if (whisperWorker) {
    whisperWorker.postMessage(data);
  }
});

ipcMain.on("whisper-load", () => {
  if (whisperWorker) {
    whisperWorker.postMessage({ type: "load" });
  }
});

// ── WebSocket Server (Chrome extension bridge) ──

function startWebSocketServer() {
  wss = new WebSocketServer({ port: WS_PORT, host: "127.0.0.1" });

  wss.on("listening", () => {
    console.log(`[WS] Server on ws://127.0.0.1:${WS_PORT}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("ws-auth-token", AUTH_TOKEN);
    }
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
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("extension-connected", true);
            }
          } else {
            ws.close();
          }
          return;
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("extension-message", msg);
        }
      } catch {}
    });

    ws.on("close", () => {
      if (authenticated && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("extension-connected", false);
      }
    });
  });
}

ipcMain.on("recording-state", (_event, state) => { isRecording = state; });

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
    (webContents, permission, callback) => {
      callback(permission === "media");
    }
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

app.whenReady().then(() => {
  createWindow();
  startWhisperWorker();
  startWebSocketServer();
});

app.on("window-all-closed", () => {
  if (whisperWorker) whisperWorker.terminate();
  if (wss) wss.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
