import React, { useState, useEffect, useCallback } from "react";
import { getNote, updateNote } from "../storage/db.js";
import { downloadNoteAsMarkdown } from "../utils/export-markdown.js";

/**
 * Detail view for a saved note.
 * Full timestamped transcript, Summarize (window.ai), Export to Markdown.
 */

const SUMMARY_SYSTEM_PROMPT = `You are an expert academic note-taker. Analyze the following lecture transcript and produce a structured summary in this exact format:

## Core Thesis
[One clear sentence stating the main argument or topic of the lecture]

## Three Key Supporting Points
1. [First key point with a brief explanation]
2. [Second key point with a brief explanation]
3. [Third key point with a brief explanation]

## Unresolved Questions
- [Any questions raised but not fully answered in the lecture]
- [Areas that need further exploration]

Be concise but thorough. Use the speaker's own terminology where possible.`;

export default function NoteDetail({ noteId, onBack }) {
  const [note, setNote] = useState(null);
  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    getNote(noteId).then((n) => {
      setNote(n);
      setSummary(n.summary || "");
      setCourseName(n.courseName || "");
    });
  }, [noteId]);

  // ── Summarize with window.ai (Gemini Nano) ──
  const handleSummarize = useCallback(async () => {
    if (!note?.transcript) return;
    setSummarizing(true);

    try {
      // Check if window.ai is available (Chrome 124+ with Gemini Nano)
      if (!window.ai || !window.ai.createTextSession) {
        throw new Error(
          "window.ai not available. Enable chrome://flags/#optimization-guide-on-device-model"
        );
      }

      // Truncate for token limits
      const maxWords = 4000;
      const words = note.transcript.split(/\s+/);
      const truncated =
        words.length > maxWords
          ? words.slice(0, maxWords).join(" ") +
            "\n\n[Transcript truncated for summary]"
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
      setSummary(`Error: ${err.message}`);
    } finally {
      setSummarizing(false);
    }
  }, [note, noteId]);

  // ── Export to Markdown (with timestamps) ──
  const handleExport = useCallback(() => {
    if (!note) return;
    downloadNoteAsMarkdown(note, summary || undefined);
  }, [note, summary]);

  // ── Save course name ──
  const saveCourse = useCallback(async () => {
    await updateNote(noteId, { courseName });
    setNote((n) => ({ ...n, courseName }));
    setEditing(false);
  }, [noteId, courseName]);

  // ── Format timestamp for display ──
  const fmtTs = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
  };

  if (!note) return <p className="loading">Loading…</p>;

  return (
    <div className="note-detail">
      <div className="detail-header">
        <button className="btn ghost" onClick={onBack}>
          &larr; Back
        </button>
        <h2>{note.title || "Untitled Note"}</h2>
      </div>

      <div className="detail-meta">
        <span>{new Date(note.date).toLocaleDateString()}</span>
        {note.duration > 0 && <span>{fmtTs(note.duration)}</span>}
        {editing ? (
          <span className="course-edit">
            <input
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="Course name"
            />
            <button className="btn small" onClick={saveCourse}>
              Save
            </button>
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
                <span className="timestamp">[{fmtTs(chunk.offsetSec || 0)}]</span>{" "}
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
          {summarizing ? "Summarizing…" : "Summarize"}
        </button>
        <button className="btn secondary" onClick={handleExport}>
          Export to Markdown
        </button>
      </div>

      {summary && (
        <section className="summary-section">
          <h3>Summary</h3>
          <div className="summary-text">{summary}</div>
        </section>
      )}
    </div>
  );
}
