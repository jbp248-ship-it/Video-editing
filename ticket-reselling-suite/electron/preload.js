const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ticketOps", {
  // Browser controls
  navigate: (url) => ipcRenderer.invoke("browser-navigate", url),
  back: () => ipcRenderer.invoke("browser-back"),
  forward: () => ipcRenderer.invoke("browser-forward"),
  refresh: () => ipcRenderer.invoke("browser-refresh"),
  closeBrowser: () => ipcRenderer.invoke("browser-close"),
  getData: () => ipcRenderer.invoke("browser-get-data"),

  // Events from main process
  onUrlChanged: (cb) => {
    ipcRenderer.on("browser-url-changed", (_, url) => cb(url));
  },
  onLoadingChanged: (cb) => {
    ipcRenderer.on("browser-loading", (_, loading) => cb(loading));
  },
  onTitleChanged: (cb) => {
    ipcRenderer.on("browser-title-changed", (_, title) => cb(title));
  },
});
