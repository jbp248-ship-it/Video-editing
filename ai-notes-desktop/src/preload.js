const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,

  // Whisper transcription via worker thread
  onWhisperMessage: (cb) => ipcRenderer.on("whisper-message", (_e, msg) => cb(msg)),
  whisperTranscribe: (data) => ipcRenderer.send("whisper-transcribe", data),
  whisperLoad: () => ipcRenderer.send("whisper-load"),

  // Chrome extension bridge
  onExtensionMessage: (cb) => ipcRenderer.on("extension-message", (_e, msg) => cb(msg)),
  onExtensionConnected: (cb) => ipcRenderer.on("extension-connected", (_e, v) => cb(v)),
  onAuthToken: (cb) => ipcRenderer.on("ws-auth-token", (_e, token) => cb(token)),

  // Recording state for close confirmation
  setRecordingState: (state) => ipcRenderer.send("recording-state", state),
});
