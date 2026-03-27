/**
 * Desktop Bridge — connects Chrome extension to desktop app
 * via authenticated WebSocket on localhost:8765.
 *
 * Security: requires an auth token (displayed in the desktop app).
 * Message queue: buffers messages during brief disconnections.
 */

const WS_URL = "ws://127.0.0.1:8765";
const RECONNECT_INTERVAL = 5000;
const MAX_QUEUE_SIZE = 100;

let ws = null;
let connected = false;
let authenticated = false;
let reconnectTimer = null;
let authToken = null;
let messageQueue = [];

/**
 * Set the auth token. Must be called before connection is useful.
 * The token is displayed in the desktop app for the user to copy.
 */
export function setAuthToken(token) {
  authToken = token;
  // If already connected but not authed, send auth now
  if (ws && ws.readyState === WebSocket.OPEN && !authenticated && authToken) {
    ws.send(JSON.stringify({ type: "auth", token: authToken }));
  }
}

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

      // Authenticate
      if (authToken) {
        ws.send(JSON.stringify({ type: "auth", token: authToken }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "auth-ok") {
          authenticated = true;
          console.log("[Bridge] Authenticated with desktop app");
          // Flush queued messages
          flushQueue();
        } else if (msg.type === "auth-failed") {
          console.error("[Bridge] Auth failed — wrong token");
          authenticated = false;
        }
      } catch {}
    };

    ws.onclose = () => {
      connected = false;
      authenticated = false;
      console.log("[Bridge] Disconnected from desktop app");
      scheduleReconnect();
    };

    ws.onerror = () => {
      connected = false;
      authenticated = false;
    };
  } catch {
    connected = false;
    authenticated = false;
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

function flushQueue() {
  while (messageQueue.length > 0 && authenticated && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(messageQueue.shift()));
  }
}

/**
 * Send a message to the desktop app.
 * If disconnected, queues the message (up to MAX_QUEUE_SIZE).
 */
export function sendToDesktop(msg) {
  if (authenticated && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }

  // Queue for later delivery
  if (messageQueue.length < MAX_QUEUE_SIZE) {
    messageQueue.push(msg);
  }
  return false;
}

export function isDesktopConnected() {
  return connected && authenticated;
}

// Start connecting immediately
connectToDesktop();
