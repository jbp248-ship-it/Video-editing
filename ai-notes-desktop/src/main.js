const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

let mainWindow;
let wss;
let httpServer;
let isRecording = false;

const AUTH_TOKEN = crypto.randomBytes(16).toString("hex");
const WS_PORT = 8765;
const HTTP_PORT = 8766;

// ── Local HTTP server ──
// Serves the app UI on localhost so that Chrome's Web Speech API works.
// Electron's file:// protocol breaks the speech API in newer versions.
function startHttpServer() {
  const srcDir = path.join(__dirname);
  const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".png": "image/png",
  };

  httpServer = http.createServer((req, res) => {
    let filePath = path.join(srcDir, req.url === "/" ? "index.html" : req.url);
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    });
  });

  httpServer.listen(HTTP_PORT, "127.0.0.1", () => {
    console.log(`[HTTP] Serving UI at http://127.0.0.1:${HTTP_PORT}`);
  });
}

// ── WebSocket Server ──
function startWebSocketServer() {
  wss = new WebSocketServer({ port: WS_PORT, host: "127.0.0.1" });

  wss.on("listening", () => {
    console.log(`[WS] Server listening on ws://127.0.0.1:${WS_PORT}`);
    console.log(`[WS] Auth token: ${AUTH_TOKEN}`);
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
            ws.send(JSON.stringify({ type: "auth-failed" }));
            ws.close();
          }
          return;
        }
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
    });
  });

  wss.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[WS] Port ${WS_PORT} in use`);
    }
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

  // Load from local HTTP server instead of file://
  // This makes Web Speech API work properly
  mainWindow.loadURL(`http://127.0.0.1:${HTTP_PORT}`);

  // Auto-grant microphone for localhost
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
        message: "You are currently recording a lecture. Close anyway?",
      });
      if (choice === 1) e.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  startHttpServer();
  createWindow();
  startWebSocketServer();
});

app.on("window-all-closed", () => {
  if (wss) wss.close();
  if (httpServer) httpServer.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
