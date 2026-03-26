import React, { useState, useEffect, useRef, useCallback } from "react";
import { getAllNotes, getNote } from "../storage/db.js";
import LiveTranscript from "./LiveTranscript.jsx";
import NotesList from "./NotesList.jsx";
import NoteDetail from "./NoteDetail.jsx";

/**
 * Root component for the side panel.
 * Views: "home" (notes list) | "live" (active recording) | "detail" (past note)
 */
export default function App() {
  const [view, setView] = useState("home"); // "home" | "live" | "detail"
  const [notes, setNotes] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [modelStatus, setModelStatus] = useState("idle"); // idle | loading | ready
  const [modelProgress, setModelProgress] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  // Load saved notes on mount
  useEffect(() => {
    getAllNotes().then((n) => setNotes(n.reverse())); // newest first
  }, [view]);

  // Listen for messages from the service worker
  useEffect(() => {
    const handler = (msg) => {
      switch (msg.type) {
        case "model-status":
          setModelStatus(msg.status);
          if (msg.progress != null) setModelProgress(msg.progress);
          break;
        case "recording-started":
          setActiveNoteId(msg.noteId);
          setIsRecording(true);
          setView("live");
          break;
        case "recording-stopped":
          setIsRecording(false);
          break;
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const startRecording = useCallback(() => {
    chrome.runtime.sendMessage({ type: "start-recording" });
  }, []);

  const stopRecording = useCallback(() => {
    chrome.runtime.sendMessage({ type: "stop-recording" });
  }, []);

  const openNote = useCallback((id) => {
    setActiveNoteId(id);
    setView("detail");
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1 onClick={() => setView("home")}>AI Note Taker</h1>
        {modelStatus === "loading" && (
          <div className="model-badge loading">
            Loading model… {modelProgress}%
          </div>
        )}
        {modelStatus === "ready" && (
          <div className="model-badge ready">Model ready</div>
        )}
      </header>

      <main className="main">
        {view === "home" && (
          <>
            <div className="controls">
              <button
                className="btn primary"
                onClick={startRecording}
                disabled={isRecording}
              >
                {isRecording ? "Recording…" : "Start Recording"}
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
