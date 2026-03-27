const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  // Listen for messages from the Chrome extension (via WebSocket → main → renderer)
  onExtensionMessage: (callback) => {
    ipcRenderer.on("extension-message", (_event, msg) => callback(msg));
  },
  onExtensionConnected: (callback) => {
    ipcRenderer.on("extension-connected", (_event, connected) => callback(connected));
  },
});
