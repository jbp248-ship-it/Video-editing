import React, { useState, useEffect, useRef } from "react";
import { formatTimestamp } from "../utils/constants.js";
import { onAudioLevel } from "./mic-capture.js";

/**
 * Live transcript with audio level indicator and processing status.
 */
export default function LiveTranscript({ noteId, isRecording, onStop, onBack }) {
  const [lines, setLines] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [queueDepth, setQueueDepth] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [processing, setProcessing] = useState(false);
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

  // Audio level monitor
  useEffect(() => {
    if (!isRecording) return;
    onAudioLevel((level) => setAudioLevel(level));
    return () => onAudioLevel(null);
  }, [isRecording]);

  // Listen for transcript chunks
  useEffect(() => {
    const handler = (msg) => {
      if (msg.type === "transcript-chunk" && msg.noteId === noteId) {
        setLines((prev) => [...prev, {
          text: msg.text,
          offsetSec: msg.offsetSec || 0,
        }]);
        setProcessing(false);
        if (msg.queueDepth != null) setQueueDepth(msg.queueDepth);
      }
      // Show "processing" when audio is being transcribed
      if (msg.type === "audio-chunk") {
        setProcessing(true);
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
        {queueDepth > 2 && (
          <span className="queue-badge" title="Chunks being processed">
            Q:{queueDepth}
          </span>
        )}
        {isRecording && (
          <button className="btn danger" onClick={onStop}>Stop</button>
        )}
      </div>

      {/* Audio level bar — shows the mic is hearing you */}
      {isRecording && (
        <div className="audio-level-container">
          <div
            className="audio-level-bar"
            style={{ width: `${Math.min(100, audioLevel * 300)}%` }}
          />
          <span className="audio-level-label">
            {audioLevel > 0.01 ? "Hearing audio..." : "Waiting for sound..."}
          </span>
        </div>
      )}

      <div className="transcript-feed">
        {lines.length === 0 && isRecording && !processing && (
          <p className="placeholder">Start talking — transcript will appear here.</p>
        )}
        {lines.length === 0 && isRecording && processing && (
          <p className="placeholder processing">Processing audio...</p>
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
        {processing && lines.length > 0 && (
          <p className="processing-indicator">Transcribing...</p>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
