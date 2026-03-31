/**
 * TicketOps — Background Service Worker (Manifest V3)
 *
 * Responsibilities:
 * - Receive market snapshots from content scripts
 * - Forward data to the TicketOps dashboard API
 * - Queue failed sends for retry
 * - Show notifications for important alerts
 */

const DEFAULT_DASHBOARD_PORT = 3099;
let DASHBOARD_API_BASE = `http://localhost:${DEFAULT_DASHBOARD_PORT}/api`;
const RETRY_QUEUE_KEY = "ticketops_retry_queue";

// Allow users to configure the dashboard port via chrome.storage
chrome.storage.local.get("dashboardPort", (data) => {
  if (data.dashboardPort) {
    DASHBOARD_API_BASE = `http://localhost:${data.dashboardPort}/api`;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.dashboardPort) {
    const port = changes.dashboardPort.newValue ?? DEFAULT_DASHBOARD_PORT;
    DASHBOARD_API_BASE = `http://localhost:${port}/api`;
  }
});

// ─── Message Handler ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "MARKET_SNAPSHOT") {
    handleSnapshot(message.data);
    sendResponse({ status: "received" });
  }

  if (message.type === "GET_STATUS") {
    chrome.storage.local.get(
      ["lastSnapshot", "snapshotCount", "connectionOk"],
      (data) => {
        sendResponse(data);
      }
    );
    return true; // Keep channel open for async response
  }
});

// ─── Snapshot Processing ───────────────────────────────────────────────────

async function handleSnapshot(snapshot) {
  // Store latest snapshot locally for the popup
  const count =
    (await getStorageValue("snapshotCount", 0)) + 1;

  await chrome.storage.local.set({
    lastSnapshot: snapshot,
    snapshotCount: count,
    lastCaptureTime: new Date().toISOString(),
  });

  // Forward to dashboard API
  try {
    const response = await fetch(`${DASHBOARD_API_BASE}/snapshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: snapshot.eventId ?? "pending-match",
        platform: snapshot.platform,
        getInPrice: snapshot.getInPrice,
        medianPrice: snapshot.medianPrice,
        averagePrice: snapshot.averagePrice,
        maxPrice: snapshot.maxPrice,
        totalListings: snapshot.totalListings,
        totalTickets: snapshot.totalTickets,
      }),
    });

    if (response.ok) {
      await chrome.storage.local.set({ connectionOk: true });
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (err) {
    console.warn("[TicketOps] Failed to send snapshot, queuing for retry:", err);
    await chrome.storage.local.set({ connectionOk: false });
    await queueForRetry(snapshot);
  }

  // Check if this snapshot triggers any immediate alerts
  checkForAlerts(snapshot);
}

// ─── Alert Checks ──────────────────────────────────────────────────────────

function checkForAlerts(snapshot) {
  // Example: alert if get-in price drops significantly
  // In production, compare against your inventory's list prices
  if (snapshot.totalListings < 10) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "../icons/icon128.png",
      title: "Low Inventory Alert",
      message: `Only ${snapshot.totalListings} listings left for ${snapshot.eventName ?? "this event"}!`,
      priority: 2,
    });
  }
}

// ─── Retry Queue ───────────────────────────────────────────────────────────

async function queueForRetry(snapshot) {
  const queue = await getStorageValue(RETRY_QUEUE_KEY, []);
  queue.push({ snapshot, timestamp: Date.now() });

  // Keep queue bounded (max 100 entries)
  if (queue.length > 100) queue.splice(0, queue.length - 100);

  await chrome.storage.local.set({ [RETRY_QUEUE_KEY]: queue });
}

async function processRetryQueue() {
  const queue = await getStorageValue(RETRY_QUEUE_KEY, []);
  if (queue.length === 0) return;

  const remaining = [];
  for (const item of queue) {
    try {
      const response = await fetch(`${DASHBOARD_API_BASE}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.snapshot),
      });
      if (!response.ok) remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }

  await chrome.storage.local.set({ [RETRY_QUEUE_KEY]: remaining });
}

// Retry every 5 minutes
chrome.alarms.create("retry-queue", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "retry-queue") processRetryQueue();
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function getStorageValue(key, defaultValue) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (data) => {
      resolve(data[key] ?? defaultValue);
    });
  });
}
