const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  onExtensionMessage: (cb) => ipcRenderer.on("extension-message", (_e, msg) => cb(msg)),
  onExtensionConnected: (cb) => ipcRenderer.on("extension-connected", (_e, v) => cb(v)),
  onAuthToken: (cb) => ipcRenderer.on("ws-auth-token", (_e, token) => cb(token)),
  setRecordingState: (state) => ipcRenderer.send("recording-state", state),
});
