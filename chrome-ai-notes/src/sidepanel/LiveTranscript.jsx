import React, { useState, useEffect, useRef } from "react";

/**
 * Live transcript view — shows real-time text as Whisper processes audio
 * chunks from the service worker.
 */
export default function LiveTranscript({ noteId, isRecording, onStop, onBack }) {
  const [lines, setLines] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    const handler = (msg) => {
      if (msg.type === "transcript-chunk" && msg.noteId === noteId) {
        setLines((prev) => [...prev, { text: msg.text, ts: Date.now() }]);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [noteId]);

  // Auto-scroll to bottom as new lines arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="live-transcript">
      <div className="live-header">
        <button className="btn ghost" onClick={onBack}>
          &larr; Back
        </button>
        <div className={`recording-indicator ${isRecording ? "active" : ""}`}>
          <span className="dot" />
          {isRecording ? "Recording" : "Stopped"}
        </div>
        {isRecording && (
          <button className="btn danger" onClick={onStop}>
            Stop
          </button>
        )}
      </div>

      <div className="transcript-feed">
        {lines.length === 0 && (
          <p className="placeholder">
            Listening… transcript will appear here.
          </p>
        )}
        {lines.map((line, i) => (
          <p key={i} className="transcript-line">
            {line.text}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
