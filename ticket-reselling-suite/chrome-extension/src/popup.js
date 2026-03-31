document.addEventListener("DOMContentLoaded", () => {
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const content = document.getElementById("content");

  // Load data directly from local storage — works without dashboard
  chrome.storage.local.get(
    ["lastSnapshot", "snapshotCount", "connectionOk", "lastCaptureTime"],
    (data) => {
      // Connection status (informational only — extension works offline)
      if (data.connectionOk) {
        statusDot.classList.add("ok");
        statusText.textContent = "Syncing to Dashboard";
      } else {
        statusDot.classList.add("err");
        statusText.textContent = "Dashboard offline — data saved locally";
      }

      const snap = data.lastSnapshot;
      if (!snap) {
        content.textContent = "";
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Navigate to a ticket marketplace to capture data.";
        content.appendChild(empty);
        return;
      }

      content.textContent = "";

      function addHeader(text) {
        const div = document.createElement("div");
        div.className = "section-header";
        div.textContent = text;
        content.appendChild(div);
      }

      function addStatRow(label, value, extraClass) {
        const row = document.createElement("div");
        row.className = "stat-row";
        const labelSpan = document.createElement("span");
        labelSpan.className = "stat-label";
        labelSpan.textContent = label;
        const valueSpan = document.createElement("span");
        valueSpan.className = extraClass
          ? "stat-value " + extraClass
          : "stat-value";
        valueSpan.textContent = value;
        row.appendChild(labelSpan);
        row.appendChild(valueSpan);
        content.appendChild(row);
      }

      addHeader("Last Capture");
      addStatRow("Platform", snap.platform);
      addStatRow("Event", truncate(snap.eventName, 30));
      addStatRow(
        "Get-In Price",
        "$" + (snap.getInPrice?.toFixed(2) ?? "—"),
        "price"
      );
      addStatRow(
        "Median Price",
        "$" + (snap.medianPrice?.toFixed(2) ?? "—")
      );
      addStatRow("Total Listings", snap.totalListings ?? "—");
      addStatRow(
        "Max Price",
        "$" + (snap.maxPrice?.toFixed(2) ?? "—")
      );

      addHeader("Session Stats");
      addStatRow("Snapshots Captured", data.snapshotCount ?? 0);
      if (data.lastCaptureTime) {
        const ago = timeSince(new Date(data.lastCaptureTime));
        addStatRow("Last Capture", ago + " ago");
      }
    }
  );
});

function truncate(str, len) {
  if (!str) return "—";
  return str.length > len ? str.substring(0, len) + "…" : str;
}

function timeSince(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return seconds + "s";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m";
  const hours = Math.floor(minutes / 60);
  return hours + "h";
}
