/**
 * TicketOps Desktop — Preload Script
 *
 * Runs in the renderer process before web content loads.
 * Context isolation is enabled, so this bridges the gap between
 * the Node.js world and the sandboxed renderer via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ticketops', {
  // App lifecycle
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  quit: () => ipcRenderer.send('app:quit'),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('app:check-updates'),

  // Notifications from main process
  onBackendStatus: (callback) => {
    ipcRenderer.on('backend:status', (_event, status) => callback(status));
  },
  onBackendError: (callback) => {
    ipcRenderer.on('backend:error', (_event, message) => callback(message));
  },

  // Clean up listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
