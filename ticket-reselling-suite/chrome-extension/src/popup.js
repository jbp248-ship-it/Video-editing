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

    content.innerHTML = `
      <div class="section-header">Last Capture</div>
      <div class="stat-row">
        <span class="stat-label">Platform</span>
        <span class="stat-value">${snap.platform}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Event</span>
        <span class="stat-value">${truncate(snap.eventName, 30)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Get-In Price</span>
        <span class="stat-value price">$${snap.getInPrice?.toFixed(2) ?? "—"}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Median Price</span>
        <span class="stat-value">$${snap.medianPrice?.toFixed(2) ?? "—"}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Total Listings</span>
        <span class="stat-value">${snap.totalListings ?? "—"}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Max Price</span>
        <span class="stat-value">$${snap.maxPrice?.toFixed(2) ?? "—"}</span>
      </div>

      <div class="section-header">Session Stats</div>
      <div class="stat-row">
        <span class="stat-label">Snapshots Captured</span>
        <span class="stat-value">${response.snapshotCount ?? 0}</span>
      </div>
    `;
  });
});

function truncate(str, len) {
  if (!str) return "—";
  return str.length > len ? str.substring(0, len) + "…" : str;
}
