/**
 * Desktop Bridge — connects the Chrome extension to the desktop app
 * via WebSocket on localhost:8765.
 *
 * When the desktop app is running, transcript chunks from the extension
 * are forwarded there so everything is in one place.
 */

const WS_URL = "ws://localhost:8765";
const RECONNECT_INTERVAL = 5000;

let ws = null;
let connected = false;
let reconnectTimer = null;

/**
 * Connect to the desktop app. Auto-reconnects on failure.
 */
export function connectToDesktop() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      connected = true;
      console.log("[Bridge] Connected to desktop app");
      clearReconnect();
    };

    ws.onclose = () => {
      connected = false;
      console.log("[Bridge] Disconnected from desktop app");
      scheduleReconnect();
    };

    ws.onerror = () => {
      // Silently fail — desktop app might not be running
      connected = false;
    };
  } catch {
    connected = false;
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToDesktop();
  }, RECONNECT_INTERVAL);
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/**
 * Send a message to the desktop app (if connected).
 */
export function sendToDesktop(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

/**
 * Check if the desktop app is connected.
 */
export function isDesktopConnected() {
  return connected;
}

// Start connecting immediately
connectToDesktop();
