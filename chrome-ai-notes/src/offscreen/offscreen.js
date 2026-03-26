/**
 * Offscreen document — bridges chrome.tabCapture media stream to an
 * AudioWorklet that downsamples to 16 kHz mono for Whisper.
 *
 * Service workers can't use AudioContext, so this offscreen document
 * handles all Web Audio processing and relays PCM chunks back to the
 * service worker via chrome.runtime messaging.
 *
 * Messages IN  (from service worker):
 *   { type: "start-capture", streamId: string }
 *   { type: "stop-capture" }
 *
 * Messages OUT (to service worker):
 *   { type: "audio-chunk", audio: Float32Array }
 *   { type: "capture-stopped" }
 *   { type: "capture-error", error: string }
 */

let audioContext = null;
let mediaStream = null;
let sourceNode = null;
let workletNode = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "start-capture") {
    startCapture(msg.streamId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }

  if (msg.type === "stop-capture") {
    stopCapture();
    sendResponse({ ok: true });
  }
});

async function startCapture(streamId) {
  // Get the media stream from the tab capture stream ID
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
  });

  // Create AudioContext at the system's native sample rate
  audioContext = new AudioContext();
  const sourceSR = audioContext.sampleRate;

  // Load and register the AudioWorklet processor
  const workletUrl = chrome.runtime.getURL("src/audio/audio-processor.js");
  await audioContext.audioWorklet.addModule(workletUrl);

  // Wire: mediaStream → sourceNode → workletNode
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  workletNode = new AudioWorkletNode(audioContext, "audio-capture-processor");

  // Tell the worklet the source sample rate so it can downsample correctly
  workletNode.port.postMessage({ type: "configure", sampleRate: sourceSR });

  // Relay downsampled PCM chunks to the service worker
  workletNode.port.onmessage = (e) => {
    const { type, audio } = e.data;
    if (type === "chunk") {
      // Send the Float32Array as a regular array (structured clone)
      chrome.runtime.sendMessage({
        type: "audio-chunk",
        audio: Array.from(audio),
      });
    }
  };

  sourceNode.connect(workletNode);
  // Don't connect workletNode to destination — we don't want to play the
  // audio back; we just want to capture it silently.

  console.log(
    `[Offscreen] Capture started. Source SR: ${sourceSR} Hz`
  );
}

function stopCapture() {
  // Flush remaining audio in the worklet buffer
  if (workletNode) {
    workletNode.port.postMessage({ type: "flush" });
  }

  // Tear down the audio graph
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  if (workletNode) {
    workletNode.disconnect();
    workletNode = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }

  chrome.runtime.sendMessage({ type: "capture-stopped" });
  console.log("[Offscreen] Capture stopped.");
}
