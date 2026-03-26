import React, { useState, useEffect, useCallback } from "react";
import { getNote, updateNote } from "../storage/db.js";

/**
 * Detail view for a saved note — full transcript, summarize, and export.
 */
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
      // Chrome's built-in Gemini Nano API
      const session = await window.ai.createTextSession();
      const result = await session.prompt(
        `Summarize the following lecture transcript into concise bullet points:\n\n${note.transcript}`
      );
      setSummary(result);
      await updateNote(noteId, { summary: result });
      session.destroy();
    } catch (err) {
      console.error("[Summarize]", err);
      setSummary("Error: Could not generate summary. Is window.ai available?");
    } finally {
      setSummarizing(false);
    }
  }, [note, noteId]);

  // ── Export to Markdown ──
  const handleExport = useCallback(() => {
    if (!note) return;

    const date = new Date(note.date).toISOString().split("T")[0];
    const md = [
      `# ${note.title || "Untitled Note"}`,
      "",
      `**Date:** ${date}`,
      note.courseName ? `**Course:** ${note.courseName}` : "",
      note.url ? `**Source:** ${note.url}` : "",
      "",
      "## Transcript",
      "",
      note.transcript || "_No transcript available._",
      "",
      summary ? "## Summary\n\n" + summary : "",
    ]
      .filter(Boolean)
      .join("\n");

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${date}-${(note.title || "note").replace(/\s+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [note, summary]);

  // ── Save course name ──
  const saveCourse = useCallback(async () => {
    await updateNote(noteId, { courseName });
    setNote((n) => ({ ...n, courseName }));
    setEditing(false);
  }, [noteId, courseName]);

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
          {note.transcript || <em>No transcript available.</em>}
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
