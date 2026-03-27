const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

let mainWindow;
let wss;
let isRecording = false;

// ── Auth token — prevents random processes from injecting data ──
// Generated once per session. The Chrome extension must send this
// token in its first message to be accepted.
const AUTH_TOKEN = crypto.randomBytes(16).toString("hex");

const WS_PORT = 8765;

function startWebSocketServer() {
  wss = new WebSocketServer({ port: WS_PORT, host: "127.0.0.1" });

  wss.on("listening", () => {
    console.log(`[WS] Server listening on ws://127.0.0.1:${WS_PORT}`);
    console.log(`[WS] Auth token: ${AUTH_TOKEN}`);
    // Send auth token to renderer so it can display for the user
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("ws-auth-token", AUTH_TOKEN);
    }
  });

  wss.on("connection", (ws, req) => {
    let authenticated = false;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // First message must be auth
        if (!authenticated) {
          if (msg.type === "auth" && msg.token === AUTH_TOKEN) {
            authenticated = true;
            ws.send(JSON.stringify({ type: "auth-ok" }));
            console.log("[WS] Extension authenticated");
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("extension-connected", true);
            }
          } else {
            ws.send(JSON.stringify({ type: "auth-failed" }));
            ws.close();
          }
          return;
        }

        // Authenticated — forward to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("extension-message", msg);
        }
      } catch (err) {
        console.error("[WS] Bad message:", err.message);
      }
    });

    ws.on("close", () => {
      if (authenticated && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("extension-connected", false);
      }
      console.log("[WS] Connection closed");
    });
  });

  wss.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[WS] Port ${WS_PORT} already in use — another instance running?`);
    } else {
      console.error("[WS] Server error:", err.message);
    }
  });
}

// ── Track recording state from renderer ──
ipcMain.on("recording-state", (_event, state) => {
  isRecording = state;
});

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

  // Auto-grant microphone
  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(permission === "media");
    }
  );

  // Prevent accidental close during recording
  mainWindow.on("close", (e) => {
    if (isRecording) {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: "warning",
        buttons: ["Stop Recording & Close", "Cancel"],
        defaultId: 1,
        title: "Recording in Progress",
        message: "You are currently recording a lecture. Close anyway?",
      });
      if (choice === 1) {
        e.preventDefault();
      }
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  startWebSocketServer();
});

app.on("window-all-closed", () => {
  if (wss) wss.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
