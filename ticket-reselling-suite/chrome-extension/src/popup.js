document.addEventListener("DOMContentLoaded", () => {
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const content = document.getElementById("content");

  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    if (!response) {
      statusDot.classList.add("err");
      statusText.textContent = "Not connected";
      return;
    }

    // Connection status
    if (response.connectionOk) {
      statusDot.classList.add("ok");
      statusText.textContent = "Connected to Dashboard";
    } else {
      statusDot.classList.add("err");
      statusText.textContent = "Dashboard offline — data queued";
    }

    // Last snapshot data
    const snap = response.lastSnapshot;
    if (!snap) return;

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
      valueSpan.className = extraClass ? "stat-value " + extraClass : "stat-value";
      valueSpan.textContent = value;
      row.appendChild(labelSpan);
      row.appendChild(valueSpan);
      content.appendChild(row);
    }

    addHeader("Last Capture");
    addStatRow("Platform", snap.platform);
    addStatRow("Event", truncate(snap.eventName, 30));
    addStatRow("Get-In Price", "$" + (snap.getInPrice?.toFixed(2) ?? "—"), "price");
    addStatRow("Median Price", "$" + (snap.medianPrice?.toFixed(2) ?? "—"));
    addStatRow("Total Listings", snap.totalListings ?? "—");
    addStatRow("Max Price", "$" + (snap.maxPrice?.toFixed(2) ?? "—"));

    addHeader("Session Stats");
    addStatRow("Snapshots Captured", response.snapshotCount ?? 0);
  });
});

function truncate(str, len) {
  if (!str) return "—";
  return str.length > len ? str.substring(0, len) + "…" : str;
}
