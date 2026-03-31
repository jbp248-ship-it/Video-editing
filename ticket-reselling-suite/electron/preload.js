const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ticketOps", {
  navigate: (url) => ipcRenderer.invoke("browser-navigate", url),
  back: () => ipcRenderer.invoke("browser-back"),
  forward: () => ipcRenderer.invoke("browser-forward"),
  refresh: () => ipcRenderer.invoke("browser-refresh"),
  closeBrowser: () => ipcRenderer.invoke("browser-close"),
  getData: () => ipcRenderer.invoke("browser-get-data"),
  setSidebarWidth: (w) => ipcRenderer.invoke("browser-set-sidebar-width", w),

  // Returns unsubscribe function to prevent listener stacking
  onUrlChanged: (cb) => {
    const handler = (_, url) => cb(url);
    ipcRenderer.on("browser-url-changed", handler);
    return () => ipcRenderer.off("browser-url-changed", handler);
  },
  onLoadingChanged: (cb) => {
    const handler = (_, loading) => cb(loading);
    ipcRenderer.on("browser-loading", handler);
    return () => ipcRenderer.off("browser-loading", handler);
  },
});
