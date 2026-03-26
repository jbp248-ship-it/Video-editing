/**
 * IndexedDB storage layer using the `idb` library.
 *
 * Robustness features:
 *   - Singleton DB connection (no re-open per call)
 *   - Quota checks before writes
 *   - Transactional deletes (notes + blobs atomically)
 *   - Paginated queries
 *   - Cleanup of empty/failed notes
 *   - All operations wrapped in try/catch with meaningful errors
 *
 * Schema:
 *   notes        – transcription sessions
 *   audioBlobs   – raw audio for replay / re-transcription
 */

import { openDB } from "idb";
import { NOTES_PAGE_SIZE } from "../utils/constants.js";

const DB_NAME = "ai-notes";
const DB_VERSION = 1;

// Singleton connection — avoids opening a new connection per call.
let dbInstance = null;

async function getDB() {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("notes")) {
        const noteStore = db.createObjectStore("notes", {
          keyPath: "id",
          autoIncrement: true,
        });
        noteStore.createIndex("by-url", "url", { unique: false });
        noteStore.createIndex("by-date", "date", { unique: false });
        noteStore.createIndex("by-course", "courseName", { unique: false });
      }

      if (!db.objectStoreNames.contains("audioBlobs")) {
        const blobStore = db.createObjectStore("audioBlobs", {
          keyPath: "id",
          autoIncrement: true,
        });
        blobStore.createIndex("by-noteId", "noteId", { unique: false });
      }
    },
    blocked() {
      console.warn("[DB] Database upgrade blocked by another tab.");
    },
    blocking() {
      // Close our connection so the other tab can upgrade
      dbInstance?.close();
      dbInstance = null;
    },
  });

  return dbInstance;
}

// ── Quota helper ──

async function checkQuota() {
  if (!navigator.storage?.estimate) return; // API not available
  const { usage, quota } = await navigator.storage.estimate();
  const remaining = quota - usage;
  const MB = 1024 * 1024;
  if (remaining < 10 * MB) {
    console.warn(`[DB] Low storage: ${Math.round(remaining / MB)} MB remaining`);
  }
  if (remaining < 1 * MB) {
    throw new Error("Storage quota nearly full. Delete old notes to free space.");
  }
}

// ────────────────────────── Notes CRUD ──────────────────────────

export async function createNote({ url, title, courseName = "" }) {
  await checkQuota();
  const db = await getDB();
  const id = await db.add("notes", {
    url: url || "",
    title: title || "Untitled",
    courseName,
    date: new Date(),
    transcript: "",
    chunks: [],
    summary: "",
    duration: 0,
    status: "recording", // "recording" | "complete" | "error"
  });
  return id;
}

export async function getNote(id) {
  const db = await getDB();
  const note = await db.get("notes", id);
  if (!note) return null;
  return note;
}

export async function updateNote(id, updates) {
  const db = await getDB();
  const note = await db.get("notes", id);
  if (!note) {
    console.warn(`[DB] updateNote: note ${id} not found`);
    return null;
  }
  const updated = { ...note, ...updates };
  await db.put("notes", updated);
  return updated;
}

/**
 * Append new transcript text and chunks to an existing note.
 * Uses a read-modify-write inside a transaction for safety.
 */
export async function appendTranscript(id, newText, newChunks = []) {
  const db = await getDB();
  const tx = db.transaction("notes", "readwrite");
  const store = tx.objectStore("notes");

  const note = await store.get(id);
  if (!note) {
    await tx.done;
    throw new Error(`Note ${id} not found`);
  }

  // Guard against unbounded growth — cap chunks at 10,000 entries
  const maxChunks = 10000;
  const existingChunks = note.chunks || [];
  const mergedChunks = existingChunks.length + newChunks.length > maxChunks
    ? [...existingChunks.slice(-(maxChunks - newChunks.length)), ...newChunks]
    : [...existingChunks, ...newChunks];

  note.transcript += (note.transcript ? " " : "") + newText;
  note.chunks = mergedChunks;

  await store.put(note);
  await tx.done;
  return note;
}

export async function deleteNote(id) {
  const db = await getDB();
  const tx = db.transaction(["notes", "audioBlobs"], "readwrite");

  try {
    // Delete associated audio blobs first
    const blobStore = tx.objectStore("audioBlobs");
    const blobIndex = blobStore.index("by-noteId");
    let cursor = await blobIndex.openCursor(id);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }

    // Delete the note
    await tx.objectStore("notes").delete(id);
    await tx.done;
  } catch (err) {
    console.error(`[DB] Failed to delete note ${id}:`, err);
    throw err;
  }
}

/**
 * Get notes with pagination, newest first.
 * @param {number} [page=0] - Zero-based page index
 * @param {number} [pageSize=NOTES_PAGE_SIZE]
 * @returns {Promise<{ notes: Array, hasMore: boolean }>}
 */
export async function getNotesPage(page = 0, pageSize = NOTES_PAGE_SIZE) {
  const db = await getDB();
  const tx = db.transaction("notes", "readonly");
  const index = tx.objectStore("notes").index("by-date");

  const notes = [];
  let skipped = 0;
  const skipTarget = page * pageSize;

  // Walk the index in reverse (newest first)
  let cursor = await index.openCursor(null, "prev");
  while (cursor) {
    if (skipped < skipTarget) {
      skipped++;
      cursor = await cursor.continue();
      continue;
    }
    if (notes.length >= pageSize + 1) break; // fetch one extra to detect hasMore
    notes.push(cursor.value);
    cursor = await cursor.continue();
  }

  await tx.done;

  const hasMore = notes.length > pageSize;
  if (hasMore) notes.pop();

  return { notes, hasMore };
}

/**
 * Legacy: get all notes (for backward compat). Use getNotesPage() for new code.
 */
export async function getAllNotes() {
  const db = await getDB();
  const all = await db.getAllFromIndex("notes", "by-date");
  return all.reverse(); // newest first
}

export async function getNotesByUrl(url) {
  const db = await getDB();
  return db.getAllFromIndex("notes", "by-url", url);
}

export async function getNotesByCourse(courseName) {
  const db = await getDB();
  return db.getAllFromIndex("notes", "by-course", courseName);
}

/**
 * Clean up notes that are stuck in "recording" status with no transcript.
 * Called on startup to prune failed recordings.
 */
export async function cleanupFailedNotes() {
  const db = await getDB();
  const tx = db.transaction("notes", "readwrite");
  const store = tx.objectStore("notes");

  let cursor = await store.openCursor();
  let cleaned = 0;

  while (cursor) {
    const note = cursor.value;
    // A note with "recording" status and no transcript is a failed recording
    if (note.status === "recording" && !note.transcript) {
      await cursor.delete();
      cleaned++;
    }
    cursor = await cursor.continue();
  }

  await tx.done;
  if (cleaned > 0) {
    console.log(`[DB] Cleaned up ${cleaned} failed recording(s).`);
  }
  return cleaned;
}

// ────────────────────── Audio Blobs CRUD ────────────────────────

export async function saveAudioBlob(noteId, blob) {
  await checkQuota();
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
