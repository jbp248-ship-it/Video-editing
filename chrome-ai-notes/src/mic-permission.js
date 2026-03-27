(async () => {
  const el = document.getElementById("status");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    el.textContent = "Microphone allowed! This window will close...";
    el.className = "status success";
    chrome.runtime.sendMessage({ type: "mic-permission-granted" });
    setTimeout(() => window.close(), 1000);
  } catch (err) {
    el.textContent = "Microphone denied. Please click Allow when prompted.";
    el.className = "status error";
  }
})();
