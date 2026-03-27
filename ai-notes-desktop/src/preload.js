const { contextBridge } = require("electron");

// Expose minimal API to the renderer
contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
});
