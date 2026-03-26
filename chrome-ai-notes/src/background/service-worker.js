/**
 * Background service worker — placeholder.
 * Will handle:
 *  1. chrome.tabCapture audio streaming
 *  2. Whisper model loading (WebGPU)
 *  3. Real-time transcription pipeline
 */

// Open the side panel when the extension action icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

console.log("[AI Note Taker] Service worker registered.");
