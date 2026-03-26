/**
 * IndexedDB storage layer using the `idb` library.
 *
 * Schema:
 *   notes        – transcription sessions
 *     id           : auto-incremented
 *     url          : string    (page URL when recording started)
 *     title        : string    (page title)
 *     courseName   : string    (user-assigned label, default "")
 *     date         : Date      (when the recording started)
 *     transcript   : string    (full transcript text)
 *     chunks       : Array     (timestamped segments from Whisper)
 *     summary      : string    (Gemini Nano summary, initially "")
 *     duration     : number    (recording length in seconds)
 *
 *   audioBlobs   – raw audio for replay / re-transcription
 *     id           : auto-incremented
 *     noteId       : number    (FK → notes.id)
 *     blob         : Blob      (PCM or webm audio)
 *     createdAt    : Date
 *
 * Indexes:
 *   notes:   by-url, by-date, by-course
 *   blobs:   by-noteId
 */

import { openDB } from "idb";

const DB_NAME = "ai-notes";
const DB_VERSION = 1;

function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // --- notes store ---
      if (!db.objectStoreNames.contains("notes")) {
        const noteStore = db.createObjectStore("notes", {
          keyPath: "id",
          autoIncrement: true,
        });
        noteStore.createIndex("by-url", "url", { unique: false });
        noteStore.createIndex("by-date", "date", { unique: false });
        noteStore.createIndex("by-course", "courseName", { unique: false });
      }

      // --- audioBlobs store ---
      if (!db.objectStoreNames.contains("audioBlobs")) {
        const blobStore = db.createObjectStore("audioBlobs", {
          keyPath: "id",
          autoIncrement: true,
        });
        blobStore.createIndex("by-noteId", "noteId", { unique: false });
      }
    },
  });
}

// ────────────────────────── Notes CRUD ──────────────────────────

export async function createNote({ url, title, courseName = "" }) {
  const db = await getDB();
  const id = await db.add("notes", {
    url,
    title,
    courseName,
    date: new Date(),
    transcript: "",
    chunks: [],
    summary: "",
    duration: 0,
  });
  return id;
}

export async function getNote(id) {
  const db = await getDB();
  return db.get("notes", id);
}

export async function updateNote(id, updates) {
  const db = await getDB();
  const note = await db.get("notes", id);
  if (!note) throw new Error(`Note ${id} not found`);
  const updated = { ...note, ...updates };
  await db.put("notes", updated);
  return updated;
}

export async function appendTranscript(id, newText, newChunks = []) {
  const db = await getDB();
  const note = await db.get("notes", id);
  if (!note) throw new Error(`Note ${id} not found`);

  note.transcript += (note.transcript ? " " : "") + newText;
  note.chunks = [...note.chunks, ...newChunks];
  await db.put("notes", note);
  return note;
}

export async function deleteNote(id) {
  const db = await getDB();
  // Delete associated audio blobs first
  const tx = db.transaction(["notes", "audioBlobs"], "readwrite");
  const blobIndex = tx.objectStore("audioBlobs").index("by-noteId");
  let cursor = await blobIndex.openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.objectStore("notes").delete(id);
  await tx.done;
}

export async function getAllNotes() {
  const db = await getDB();
  return db.getAllFromIndex("notes", "by-date");
}

export async function getNotesByUrl(url) {
  const db = await getDB();
  return db.getAllFromIndex("notes", "by-url", url);
}

export async function getNotesByCourse(courseName) {
  const db = await getDB();
  return db.getAllFromIndex("notes", "by-course", courseName);
}

// ────────────────────── Audio Blobs CRUD ────────────────────────

export async function saveAudioBlob(noteId, blob) {
  const db = await getDB();
  return db.add("audioBlobs", {
    noteId,
    blob,
    createdAt: new Date(),
  });
}

export async function getAudioBlobs(noteId) {
  const db = await getDB();
  return db.getAllFromIndex("audioBlobs", "by-noteId", noteId);
}
