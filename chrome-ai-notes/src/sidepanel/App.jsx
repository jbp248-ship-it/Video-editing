import React, { useState, useEffect, useCallback } from "react";
import { getAllNotes } from "../storage/db.js";
import LiveTranscript from "./LiveTranscript.jsx";
import NotesList from "./NotesList.jsx";
import NoteDetail from "./NoteDetail.jsx";

/**
 * Root component for the side panel.
 * Handles all message types from the service worker including errors.
 */
export default function App() {
  const [view, setView] = useState("home");
  const [notes, setNotes] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [modelStatus, setModelStatus] = useState("idle");
  const [modelProgress, setModelProgress] = useState(0);
  const [modelError, setModelError] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);

  // Load notes on mount and when returning to home
  useEffect(() => {
    if (view === "home") {
      getAllNotes()
        .then(setNotes)
        .catch((err) => console.error("[UI] Failed to load notes:", err));
    }
  }, [view]);

  // Ask the service worker for current model status on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "get-model-status" }, (res) => {
      if (res) {
        setModelStatus(res.status || "idle");
        if (res.error) setModelError(res.error);
      }
    });
  }, []);

  // Listen for all service worker messages
  useEffect(() => {
    const handler = (msg) => {
      switch (msg.type) {
        case "model-status":
          setModelStatus(msg.status);
          if (msg.progress != null) setModelProgress(msg.progress);
          if (msg.error) setModelError(msg.error);
          if (msg.status === "ready") setModelError(null);
          break;

        case "recording-started":
          setActiveNoteId(msg.noteId);
          setIsRecording(true);
          setError(null);
          setView("live");
          break;

        case "recording-stopped":
          setIsRecording(false);
          break;

        case "recording-error":
          setIsRecording(false);
          setError(msg.error || "Recording failed");
          // Return to home if we were on the live view with no transcript
          if (view === "live") {
            setTimeout(() => setView("home"), 3000);
          }
          break;

        case "queue-warning":
          console.warn(`[UI] Inference queue depth: ${msg.depth}`);
          break;
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [view]);

  const startRecording = useCallback(() => {
    setError(null);
    chrome.runtime.sendMessage({ type: "start-recording" }, (res) => {
      if (res && !res.ok) {
        setError(res.error || "Failed to start recording");
      }
    });
  }, []);

  const stopRecording = useCallback(() => {
    chrome.runtime.sendMessage({ type: "stop-recording" });
  }, []);

  const retryModelLoad = useCallback(() => {
    setModelError(null);
    setModelStatus("loading");
    chrome.runtime.sendMessage({ type: "retry-model-load" });
  }, []);

  const openNote = useCallback((id) => {
    setActiveNoteId(id);
    setView("detail");
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  return (
    <div className="app">
      <header className="header">
        <h1 onClick={() => setView("home")}>AI Note Taker</h1>
        <ModelBadge
          status={modelStatus}
          progress={modelProgress}
          error={modelError}
          onRetry={retryModelLoad}
        />
      </header>

      {error && (
        <div className="error-banner" onClick={dismissError}>
          {error}
          <span className="dismiss">x</span>
        </div>
      )}

      <main className="main">
        {view === "home" && (
          <>
            <div className="controls">
              <button
                className="btn primary"
                onClick={startRecording}
                disabled={isRecording || modelStatus === "loading"}
              >
                {isRecording
                  ? "Recording..."
                  : modelStatus === "loading"
                  ? "Model loading..."
                  : "Start Recording"}
              </button>
            </div>
            <NotesList notes={notes} onOpen={openNote} />
          </>
        )}

        {view === "live" && (
          <LiveTranscript
            noteId={activeNoteId}
            isRecording={isRecording}
            onStop={stopRecording}
            onBack={() => setView("home")}
          />
        )}

        {view === "detail" && (
          <NoteDetail
            noteId={activeNoteId}
            onBack={() => setView("home")}
          />
        )}
      </main>
    </div>
  );
}

function ModelBadge({ status, progress, error, onRetry }) {
  if (status === "loading" || status === "loading-wasm-fallback") {
    return (
      <div className="model-badge loading">
        Loading model... {progress}%
      </div>
    );
  }
  if (status === "ready") {
    return <div className="model-badge ready">Model ready</div>;
  }
  if (status === "error") {
    return (
      <div className="model-badge error" onClick={onRetry} title={error}>
        Model failed - click to retry
      </div>
    );
  }
  return null;
}
