import React, { useState, useEffect, useCallback } from "react";
import { getNotesPage } from "../storage/db.js";
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

  // Load notes on mount and when returning to home; clear stale errors
  useEffect(() => {
    if (view === "home") {
      refreshNotes(0);
      setError(null);
    }
  }, [view, refreshNotes]);

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

  const startRecording = useCallback(async () => {
    setError(null);

    // Check if we already have mic permission by trying a quick getUserMedia.
    // Side panels can't always trigger the permission prompt, so we open
    // a popup window if permission isn't granted yet.
    let hasMicPermission = false;
    try {
      const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      testStream.getTracks().forEach((t) => t.stop());
      hasMicPermission = true;
    } catch {
      // Permission not granted — open a popup to request it
    }

    if (!hasMicPermission) {
      // Open a small popup window that requests mic access with a visible prompt
      chrome.windows.create({
        url: chrome.runtime.getURL("mic-permission.html"),
        type: "popup",
        width: 400,
        height: 300,
        focused: true,
      });

      // Wait for the permission result via message
      return new Promise((resolve) => {
        const handler = (msg) => {
          if (msg.type === "mic-permission-granted") {
            chrome.runtime.onMessage.removeListener(handler);
            // Now start recording
            chrome.runtime.sendMessage({ type: "start-recording" }, (res) => {
              if (res && !res.ok) setError(res.error || "Failed to start recording");
            });
            resolve();
          }
        };
        chrome.runtime.onMessage.addListener(handler);

        // Timeout after 30 seconds
        setTimeout(() => {
          chrome.runtime.onMessage.removeListener(handler);
          setError("Microphone permission was not granted. Please try again and click Allow.");
          resolve();
        }, 30000);
      });
    }

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
            <NotesList
              notes={notes}
              hasMore={hasMoreNotes}
              onOpen={openNote}
              onRefresh={() => refreshNotes(0)}
              onLoadMore={loadMoreNotes}
            />
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
