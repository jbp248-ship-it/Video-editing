import React from "react";

/**
 * List of saved notes, sorted newest-first.
 */
export default function NotesList({ notes, onOpen }) {
  if (notes.length === 0) {
    return (
      <div className="empty-state">
        <p>No notes yet. Start recording to create your first note.</p>
      </div>
    );
  }

  return (
    <ul className="notes-list">
      {notes.map((note) => (
        <li key={note.id} className="note-card" onClick={() => onOpen(note.id)}>
          <div className="note-title">{note.title || "Untitled"}</div>
          <div className="note-meta">
            <span>{new Date(note.date).toLocaleDateString()}</span>
            {note.courseName && <span className="tag">{note.courseName}</span>}
          </div>
          <p className="note-preview">
            {note.transcript
              ? note.transcript.slice(0, 120) + "…"
              : "No transcript"}
          </p>
        </li>
      ))}
    </ul>
  );
}
