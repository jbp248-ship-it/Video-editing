import React, { useState, useEffect, useCallback } from "react";
import { getNotesPage } from "../storage/db.js";
import LiveTranscript from "./LiveTranscript.jsx";
import NotesList from "./NotesList.jsx";
import NoteDetail from "./NoteDetail.jsx";

/**
 * Chrome Extension Side Panel — Tab Audio Only
 *
 * This extension captures audio from the current browser tab (Zoom, YouTube,
 * etc.) and transcribes it via Whisper. For microphone recording of in-person
 * lectures, use the desktop app.
 */
export default function App() {
  const [view, setView] = useState("home");
  const [notes, setNotes] = useState([]);
  const [hasMoreNotes, setHasMoreNotes] = useState(false);
  const [notesPage, setNotesPage] = useState(0);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [modelStatus, setModelStatus] = useState("idle");
  const [modelProgress, setModelProgress] = useState(0);
  const [modelError, setModelError] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);

  const refreshNotes = useCallback((page = 0) => {
    getNotesPage(page)
      .then(({ notes: fetched, hasMore }) => {
        setNotes(page === 0 ? fetched : (prev) => [...prev, ...fetched]);
        setHasMoreNotes(hasMore);
        setNotesPage(page);
      })
      .catch((err) => console.error("[UI] Failed to load notes:", err));
  }, []);

  const loadMoreNotes = useCallback(() => {
    refreshNotes(notesPage + 1);
  }, [notesPage, refreshNotes]);

  useEffect(() => {
    if (view === "home") {
      refreshNotes(0);
      setError(null);
    }
  }, [view, refreshNotes]);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "get-model-status" }, (res) => {
      if (res) {
        setModelStatus(res.status || "idle");
        if (res.error) setModelError(res.error);
      }
    });
  }, []);

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
          if (view === "live") setTimeout(() => setView("home"), 3000);
          break;
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [view]);

  const startRecording = useCallback(() => {
    setError(null);
    chrome.runtime.sendMessage({ type: "start-recording" }, (res) => {
      if (res && !res.ok) setError(res.error || "Failed to start recording");
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
        <span className="header-hint">Tab Audio</span>
        <ModelBadge status={modelStatus} progress={modelProgress} error={modelError} onRetry={retryModelLoad} />
      </header>

      {error && (
        <div className="error-banner" onClick={dismissError}>
          {error} <span className="dismiss">x</span>
        </div>
      )}

      <main className="main">
        {view === "home" && (
          <>
            <div className="controls">
              <button className="btn primary" onClick={startRecording} disabled={isRecording || modelStatus === "loading"}>
                {isRecording ? "Recording Tab Audio..." : modelStatus === "loading" ? "Model loading..." : "Record This Tab"}
              </button>
              <p className="controls-hint">
                Records audio from the current browser tab (Zoom, YouTube, etc.).<br/>
                For mic recording, use the desktop app.
              </p>
            </div>
            <NotesList notes={notes} hasMore={hasMoreNotes} onOpen={openNote} onRefresh={() => refreshNotes(0)} onLoadMore={loadMoreNotes} />
          </>
        )}

        {view === "live" && (
          <LiveTranscript noteId={activeNoteId} isRecording={isRecording} onStop={stopRecording} onBack={() => setView("home")} />
        )}

        {view === "detail" && (
          <NoteDetail noteId={activeNoteId} onBack={() => setView("home")} />
        )}
      </main>
    </div>
  );
}

function ModelBadge({ status, progress, error, onRetry }) {
  if (status === "loading" || status === "loading-wasm-fallback") {
    return <div className="model-badge loading">Loading model... {progress}%</div>;
  }
  if (status === "ready") {
    return <div className="model-badge ready">Model ready</div>;
  }
  if (status === "error") {
    return <div className="model-badge error" onClick={onRetry} title={error}>Model failed - retry</div>;
  }
  return null;
}
