import React, { useState, useEffect, useRef } from "react";
import { formatTimestamp } from "../utils/constants.js";

/**
 * Live transcript view with timestamps, elapsed timer, and queue depth indicator.
 */
export default function LiveTranscript({ noteId, isRecording, onStop, onBack }) {
  const [lines, setLines] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [queueDepth, setQueueDepth] = useState(0);
  const bottomRef = useRef(null);
  const startTimeRef = useRef(Date.now());

  // Elapsed timer
  useEffect(() => {
    if (!isRecording) return;
    startTimeRef.current = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  // Listen for transcript chunks
  useEffect(() => {
    const handler = (msg) => {
      if (msg.type === "transcript-chunk" && msg.noteId === noteId) {
        setLines((prev) => [...prev, {
          text: msg.text,
          offsetSec: msg.offsetSec || 0,
        }]);
        if (msg.queueDepth != null) setQueueDepth(msg.queueDepth);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [noteId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="live-transcript">
      <div className="live-header">
        <button className="btn ghost" onClick={onBack}>&larr; Back</button>
        <div className={`recording-indicator ${isRecording ? "active" : ""}`}>
          <span className="dot" />
          {isRecording ? formatTimestamp(elapsed) : "Stopped"}
        </div>
        {queueDepth > 5 && (
          <span className="queue-badge" title="Inference queue depth">
            Q:{queueDepth}
          </span>
        )}
        {isRecording && (
          <button className="btn danger" onClick={onStop}>Stop</button>
        )}
      </div>

      <div className="transcript-feed">
        {lines.length === 0 && isRecording && (
          <p className="placeholder">Listening... transcript will appear here.</p>
        )}
        {lines.length === 0 && !isRecording && (
          <p className="placeholder">No transcript was captured.</p>
        )}
        {lines.map((line, i) => (
          <p key={i} className="transcript-line">
            <span className="timestamp">[{formatTimestamp(line.offsetSec)}]</span>{" "}
            {line.text}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
