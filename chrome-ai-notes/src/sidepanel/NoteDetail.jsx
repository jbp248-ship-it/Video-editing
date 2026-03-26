import React, { useState, useEffect, useCallback } from "react";
import { getNote, updateNote } from "../storage/db.js";
import { downloadNoteAsMarkdown } from "../utils/export-markdown.js";
import {
  formatTimestamp, SUMMARY_SYSTEM_PROMPT, SUMMARY_MAX_WORDS,
} from "../utils/constants.js";

/**
 * Detail view — full transcript, summarize (window.ai), export to Markdown.
 * Uses shared constants for prompt and timestamp formatting.
 */
export default function NoteDetail({ noteId, onBack }) {
  const [note, setNote] = useState(null);
  const [summary, setSummary] = useState("");
  const [summaryError, setSummaryError] = useState(null);
  const [summarizing, setSummarizing] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [editing, setEditing] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    getNote(noteId)
      .then((n) => {
        if (!n) {
          setLoadError("Note not found.");
          return;
        }
        setNote(n);
        setSummary(n.summary || "");
        setCourseName(n.courseName || "");
      })
      .catch((err) => setLoadError(err.message));
  }, [noteId]);

  // ── Summarize with window.ai (Gemini Nano) ──
  const handleSummarize = useCallback(async () => {
    if (!note?.transcript) return;
    setSummarizing(true);
    setSummaryError(null);

    try {
      if (!window.ai?.createTextSession) {
        throw new Error(
          "window.ai not available. Enable it at chrome://flags/#optimization-guide-on-device-model"
        );
      }

      const words = note.transcript.split(/\s+/);
      const truncated = words.length > SUMMARY_MAX_WORDS
        ? words.slice(0, SUMMARY_MAX_WORDS).join(" ") + "\n\n[Transcript truncated]"
        : note.transcript;

      const session = await window.ai.createTextSession({
        systemPrompt: SUMMARY_SYSTEM_PROMPT,
      });

      const result = await session.prompt(truncated);
      setSummary(result);
      await updateNote(noteId, { summary: result });
      session.destroy();
    } catch (err) {
      console.error("[Summarize]", err);
      setSummaryError(err.message);
    } finally {
      setSummarizing(false);
    }
  }, [note, noteId]);

  const handleExport = useCallback(() => {
    if (!note) return;
    downloadNoteAsMarkdown(note, summary || undefined);
  }, [note, summary]);

  const saveCourse = useCallback(async () => {
    await updateNote(noteId, { courseName });
    setNote((n) => ({ ...n, courseName }));
    setEditing(false);
  }, [noteId, courseName]);

  if (loadError) {
    return (
      <div className="note-detail">
        <button className="btn ghost" onClick={onBack}>&larr; Back</button>
        <div className="error-banner">{loadError}</div>
      </div>
    );
  }

  if (!note) return <p className="loading">Loading...</p>;

  return (
    <div className="note-detail">
      <div className="detail-header">
        <button className="btn ghost" onClick={onBack}>&larr; Back</button>
        <h2>{note.title || "Untitled Note"}</h2>
      </div>

      <div className="detail-meta">
        <span>{new Date(note.date).toLocaleDateString()}</span>
        {note.duration > 0 && <span>{formatTimestamp(note.duration)}</span>}
        {note.status === "error" && <span className="tag error-tag">Failed</span>}
        {editing ? (
          <span className="course-edit">
            <input
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="Course name"
            />
            <button className="btn small" onClick={saveCourse}>Save</button>
          </span>
        ) : (
          <span
            className="tag editable"
            onClick={() => setEditing(true)}
            title="Click to edit course"
          >
            {note.courseName || "+ Add course"}
          </span>
        )}
      </div>

      <section className="transcript-section">
        <h3>Transcript</h3>
        <div className="transcript-text">
          {note.chunks && note.chunks.length > 0 ? (
            note.chunks.map((chunk, i) => (
              <p key={i} className="transcript-line">
                <span className="timestamp">
                  [{formatTimestamp(chunk.offsetSec || 0)}]
                </span>{" "}
                {chunk.text}
              </p>
            ))
          ) : note.transcript ? (
            <p>{note.transcript}</p>
          ) : (
            <em>No transcript available.</em>
          )}
        </div>
      </section>

      <div className="actions">
        <button
          className="btn primary"
          onClick={handleSummarize}
          disabled={summarizing || !note.transcript}
        >
          {summarizing ? "Summarizing..." : "Summarize"}
        </button>
        <button className="btn secondary" onClick={handleExport}>
          Export to Markdown
        </button>
      </div>

      {summaryError && (
        <div className="error-banner">{summaryError}</div>
      )}

      {summary && !summaryError && (
        <section className="summary-section">
          <h3>Summary</h3>
          <div className="summary-text">{summary}</div>
        </section>
      )}
    </div>
  );
}
