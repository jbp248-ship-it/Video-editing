import React from "react";
import { formatTimestamp } from "../utils/constants.js";
import { deleteNote } from "../storage/db.js";

/**
 * Paginated list of saved notes with delete and load-more.
 */
export default function NotesList({ notes, hasMore, onOpen, onRefresh, onLoadMore }) {
  if (notes.length === 0) {
    return (
      <div className="empty-state">
        <p>No notes yet. Start recording to create your first note.</p>
      </div>
    );
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (confirm("Delete this note? This cannot be undone.")) {
      await deleteNote(id);
      onRefresh?.();
    }
  };

  return (
    <>
      <ul className="notes-list">
        {notes.map((note) => (
          <li key={note.id} className="note-card" onClick={() => onOpen(note.id)}>
            <div className="note-card-header">
              <div className="note-title">{note.title || "Untitled"}</div>
              <button
                className="btn-delete"
                onClick={(e) => handleDelete(e, note.id)}
                title="Delete note"
              >
                x
              </button>
            </div>
            <div className="note-meta">
              <span>{new Date(note.date).toLocaleDateString()}</span>
              {note.duration > 0 && <span>{formatTimestamp(note.duration)}</span>}
              {note.courseName && <span className="tag">{note.courseName}</span>}
              {note.status === "error" && <span className="tag error-tag">Failed</span>}
            </div>
            <p className="note-preview">
              {note.transcript
                ? note.transcript.slice(0, 120) + (note.transcript.length > 120 ? "..." : "")
                : "No transcript"}
            </p>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button className="btn secondary load-more" onClick={onLoadMore}>
          Load more notes
        </button>
      )}
    </>
  );
}
