const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { WebSocketServer } = require("ws");

let mainWindow;
let wss;

// ── WebSocket Server ──
// The Chrome extension connects to ws://localhost:8765 and sends
// transcript data. The desktop app receives it and stores it alongside
// local mic recordings. Everything in one place.

const WS_PORT = 8765;

function startWebSocketServer() {
  wss = new WebSocketServer({ port: WS_PORT });

  wss.on("listening", () => {
    console.log(`[WS] Server listening on ws://localhost:${WS_PORT}`);
  });

  wss.on("connection", (ws) => {
    console.log("[WS] Chrome extension connected");

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        // Forward to the renderer process
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("extension-message", msg);
        }
      } catch (err) {
        console.error("[WS] Bad message:", err);
      }
    });

    ws.on("close", () => {
      console.log("[WS] Chrome extension disconnected");
    });

    // Send current connection status to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("extension-connected", true);
    }
  });

  wss.on("error", (err) => {
    console.error("[WS] Server error:", err.message);
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

  // Auto-grant microphone
  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(permission === "media");
    }
  );
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
