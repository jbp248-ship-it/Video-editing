/**
 * IndexedDB storage layer using the `idb` library.
 *
 * Fixes from code review:
 *   - Singleton with close-event reconnection (dead connections auto-heal)
 *   - updateNote uses a single read-modify-write transaction
 *   - cleanupFailedNotes has 5-minute grace period + preserves notes with content
 *   - Quota checks before writes
 *   - Chunk cap prevents unbounded growth
 */

import { openDB } from "idb";
import { NOTES_PAGE_SIZE } from "../utils/constants.js";

const DB_NAME = "ai-notes";
const DB_VERSION = 1;
const CLEANUP_GRACE_MS = 5 * 60 * 1000; // 5 minutes

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
      dbInstance?.close();
      dbInstance = null;
    },
  });

  // Fix: detect connection death so getDB() reopens on next call.
  // Without this, a dead dbInstance sits in memory and all operations fail.
  const rawDb = dbInstance;
  rawDb.addEventListener?.("close", () => {
    console.warn("[DB] Connection closed unexpectedly — will reconnect on next call.");
    if (dbInstance === rawDb) {
      dbInstance = null;
    }
  });

  return dbInstance;
}

// ── Quota helper ──

async function checkQuota() {
  if (!navigator.storage?.estimate) return;
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
    status: "recording",
  });
  return id;
}

export async function getNote(id) {
  const db = await getDB();
  return (await db.get("notes", id)) || null;
}

/**
 * Update a note. Uses a single transaction to prevent lost-update races.
 */
export async function updateNote(id, updates) {
  const db = await getDB();
  const tx = db.transaction("notes", "readwrite");
  const store = tx.objectStore("notes");

  const note = await store.get(id);
  if (!note) {
    await tx.done;
    console.warn(`[DB] updateNote: note ${id} not found`);
    return null;
  }

  const updated = { ...note, ...updates };
  await store.put(updated);
  await tx.done;
  return updated;
}

/**
 * Append new transcript text and chunks inside a single transaction.
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

  const maxChunks = 10000;
  const existing = note.chunks || [];
  const merged = existing.length + newChunks.length > maxChunks
    ? [...existing.slice(-(maxChunks - newChunks.length)), ...newChunks]
    : [...existing, ...newChunks];

  note.transcript += (note.transcript ? " " : "") + newText;
  note.chunks = merged;

  await store.put(note);
  await tx.done;
  return note;
}

export async function deleteNote(id) {
  const db = await getDB();
  const tx = db.transaction(["notes", "audioBlobs"], "readwrite");

  try {
    const blobStore = tx.objectStore("audioBlobs");
    const blobIndex = blobStore.index("by-noteId");
    let cursor = await blobIndex.openCursor(id);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.objectStore("notes").delete(id);
    await tx.done;
  } catch (err) {
    console.error(`[DB] Failed to delete note ${id}:`, err);
    throw err;
  }
}

/**
 * Paginated query, newest first.
 */
export async function getNotesPage(page = 0, pageSize = NOTES_PAGE_SIZE) {
  const db = await getDB();
  const tx = db.transaction("notes", "readonly");
  const index = tx.objectStore("notes").index("by-date");

  const notes = [];
  let skipped = 0;
  const skipTarget = page * pageSize;

  let cursor = await index.openCursor(null, "prev");
  while (cursor) {
    if (skipped < skipTarget) {
      skipped++;
      cursor = await cursor.continue();
      continue;
    }
    if (notes.length >= pageSize + 1) break;
    notes.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;

  const hasMore = notes.length > pageSize;
  if (hasMore) notes.pop();
  return { notes, hasMore };
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
 * Clean up ghost notes: stuck in "recording" for > 5 minutes.
 * - No transcript → delete (truly dead)
 * - Has transcript → mark "complete" (preserve user data)
 */
export async function cleanupFailedNotes() {
  const db = await getDB();
  const tx = db.transaction("notes", "readwrite");
  const store = tx.objectStore("notes");

  let cursor = await store.openCursor();
  let cleaned = 0;
  const cutoff = new Date(Date.now() - CLEANUP_GRACE_MS);

  while (cursor) {
    const note = cursor.value;

    if (note.status === "recording" && new Date(note.date) < cutoff) {
      if (!note.transcript) {
        // Truly dead — no content, safe to delete
        await cursor.delete();
        cleaned++;
      } else {
        // Has content — preserve it, just fix the status
        note.status = "complete";
        await cursor.update(note);
        cleaned++;
      }
    }

    cursor = await cursor.continue();
  }

  await tx.done;
  if (cleaned > 0) {
    console.log(`[DB] Cleaned up ${cleaned} ghost note(s).`);
  }
  return cleaned;
}

// ────────────────────── Audio Blobs CRUD ────────────────────────

export async function saveAudioBlob(noteId, blob) {
  await checkQuota();
  const db = await getDB();
  return db.add("audioBlobs", { noteId, blob, createdAt: new Date() });
}

export async function getAudioBlobs(noteId) {
  const db = await getDB();
  return db.getAllFromIndex("audioBlobs", "by-noteId", noteId);
}
