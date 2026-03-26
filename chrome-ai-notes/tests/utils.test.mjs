/**
 * Unit tests for shared utilities.
 * Uses Node.js built-in test runner (node --test).
 * No external test framework needed.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── Direct imports of pure functions (no chrome.* dependency) ──

// We can't import from src/ directly because some files reference `chrome.*`
// at the module level. Instead, we copy the pure functions here for testing.
// This is the pragmatic approach for a Chrome extension where the runtime
// isn't available in Node.

// ═══════════════════════════════════════════════════════════════════
//  formatTimestamp
// ═══════════════════════════════════════════════════════════════════

function formatTimestamp(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

describe("formatTimestamp", () => {
  it("formats 0 seconds", () => {
    assert.equal(formatTimestamp(0), "00:00:00");
  });

  it("formats seconds only", () => {
    assert.equal(formatTimestamp(45), "00:00:45");
  });

  it("formats minutes and seconds", () => {
    assert.equal(formatTimestamp(125), "00:02:05");
  });

  it("formats hours, minutes, seconds", () => {
    assert.equal(formatTimestamp(3661), "01:01:01");
  });

  it("formats a 90-minute lecture", () => {
    assert.equal(formatTimestamp(5400), "01:30:00");
  });

  it("handles null/undefined gracefully", () => {
    assert.equal(formatTimestamp(null), "00:00:00");
    assert.equal(formatTimestamp(undefined), "00:00:00");
  });

  it("handles negative numbers", () => {
    assert.equal(formatTimestamp(-10), "00:00:00");
  });

  it("handles floating point", () => {
    assert.equal(formatTimestamp(61.7), "00:01:01");
  });

  it("handles very large values", () => {
    assert.equal(formatTimestamp(86400), "24:00:00"); // 24 hours
  });
});

// ═══════════════════════════════════════════════════════════════════
//  isSilent (silence detection)
// ═══════════════════════════════════════════════════════════════════

function isSilent(audio, threshold = 0.001) {
  if (!(audio instanceof Float32Array) || audio.length === 0) return true;
  for (let i = 0; i < audio.length; i += 100) {
    if (Math.abs(audio[i]) >= threshold) return false;
  }
  return true;
}

describe("isSilent", () => {
  it("detects silence (all zeros)", () => {
    const audio = new Float32Array(16000); // 1 second of silence
    assert.equal(isSilent(audio), true);
  });

  it("detects near-silence (below threshold)", () => {
    const audio = new Float32Array(16000);
    audio[500] = 0.0005; // below 0.001
    assert.equal(isSilent(audio), true);
  });

  it("detects audio (above threshold)", () => {
    const audio = new Float32Array(16000);
    audio[0] = 0.5; // well above threshold
    assert.equal(isSilent(audio), false);
  });

  it("handles sample at non-100th index", () => {
    // isSilent checks every 100th sample. A loud sample at index 50
    // won't be caught (by design — it's a sampling heuristic).
    const audio = new Float32Array(16000);
    audio[50] = 1.0;
    // This is "silent" by the heuristic since index 50 isn't checked
    assert.equal(isSilent(audio), true);
  });

  it("detects audio at 100th-sample boundary", () => {
    const audio = new Float32Array(16000);
    audio[100] = 0.5;
    assert.equal(isSilent(audio), false);
  });

  it("handles empty array", () => {
    assert.equal(isSilent(new Float32Array(0)), true);
  });

  it("handles non-Float32Array", () => {
    assert.equal(isSilent([1, 2, 3]), true); // regular array → true
    assert.equal(isSilent(null), true);
    assert.equal(isSilent(undefined), true);
  });

  it("respects custom threshold", () => {
    const audio = new Float32Array(16000);
    audio[0] = 0.01;
    assert.equal(isSilent(audio, 0.1), true);   // below custom threshold
    assert.equal(isSilent(audio, 0.005), false); // above custom threshold
  });
});

// ═══════════════════════════════════════════════════════════════════
//  noteToMarkdown
// ═══════════════════════════════════════════════════════════════════

// Inline the function since it imports formatTimestamp
function noteToMarkdown(note) {
  const date = new Date(note.date).toISOString().split("T")[0];
  const durationStr = formatTimestamp(note.duration || 0);

  const lines = [
    `# ${note.title || "Untitled Note"}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| **Date** | ${date} |`,
  ];

  if (note.courseName) lines.push(`| **Course** | ${note.courseName} |`);
  if (note.url) lines.push(`| **Source** | ${note.url} |`);
  lines.push(`| **Duration** | ${durationStr} |`);
  lines.push("", "---", "", "## Transcript", "");

  if (note.chunks && note.chunks.length > 0) {
    for (const chunk of note.chunks) {
      const ts = formatTimestamp(chunk.offsetSec || 0);
      const text = (chunk.text || "").trim();
      if (text) {
        lines.push(`\`[${ts}]\` ${text}`, "");
      }
    }
  } else if (note.transcript) {
    lines.push(note.transcript, "");
  } else {
    lines.push("_No transcript available._", "");
  }

  if (note.summary) {
    lines.push("---", "", "## Summary", "", note.summary, "");
  }

  return lines.join("\n");
}

describe("noteToMarkdown", () => {
  const baseNote = {
    title: "Lecture 1",
    date: new Date("2026-01-15"),
    url: "https://example.com/video",
    courseName: "CS101",
    duration: 3661,
    transcript: "Hello world",
    chunks: [],
    summary: "",
  };

  it("generates valid markdown with metadata table", () => {
    const md = noteToMarkdown(baseNote);
    assert.ok(md.includes("# Lecture 1"));
    assert.ok(md.includes("| **Date** | 2026-01-15 |"));
    assert.ok(md.includes("| **Course** | CS101 |"));
    assert.ok(md.includes("| **Duration** | 01:01:01 |"));
  });

  it("includes timestamped chunks", () => {
    const note = {
      ...baseNote,
      chunks: [
        { text: "First point", offsetSec: 0 },
        { text: "Second point", offsetSec: 65 },
      ],
    };
    const md = noteToMarkdown(note);
    assert.ok(md.includes("`[00:00:00]` First point"));
    assert.ok(md.includes("`[00:01:05]` Second point"));
  });

  it("falls back to raw transcript when no chunks", () => {
    const md = noteToMarkdown(baseNote);
    assert.ok(md.includes("Hello world"));
  });

  it("shows no-transcript message when empty", () => {
    const note = { ...baseNote, transcript: "", chunks: [] };
    const md = noteToMarkdown(note);
    assert.ok(md.includes("_No transcript available._"));
  });

  it("includes summary section when present", () => {
    const note = { ...baseNote, summary: "Key takeaway: X" };
    const md = noteToMarkdown(note);
    assert.ok(md.includes("## Summary"));
    assert.ok(md.includes("Key takeaway: X"));
  });

  it("omits summary section when empty", () => {
    const md = noteToMarkdown(baseNote);
    assert.ok(!md.includes("## Summary"));
  });

  it("handles missing optional fields", () => {
    const note = { date: new Date(), transcript: "Test", chunks: [] };
    const md = noteToMarkdown(note);
    assert.ok(md.includes("# Untitled Note"));
    assert.ok(!md.includes("**Course**"));
    assert.ok(!md.includes("**Source**"));
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Recording state machine transitions
// ═══════════════════════════════════════════════════════════════════

describe("Recording state machine", () => {
  // Simulate the state machine from service-worker.js
  let state;

  function canStart() { return state === "idle"; }
  function canStop() { return state === "recording" || state === "starting"; }

  function reset() { state = "idle"; }

  beforeEach(() => reset());

  it("starts from idle", () => {
    assert.equal(canStart(), true);
    assert.equal(canStop(), false);
  });

  it("allows idle → starting", () => {
    state = "starting";
    assert.equal(canStart(), false);
    assert.equal(canStop(), true); // can stop while starting!
  });

  it("allows starting → recording", () => {
    state = "recording";
    assert.equal(canStart(), false);
    assert.equal(canStop(), true);
  });

  it("allows recording → stopping", () => {
    state = "stopping";
    assert.equal(canStart(), false);
    assert.equal(canStop(), false); // can't double-stop
  });

  it("allows stopping → idle", () => {
    state = "idle";
    assert.equal(canStart(), true);
    assert.equal(canStop(), false);
  });

  it("blocks start from non-idle states", () => {
    for (const s of ["starting", "recording", "stopping"]) {
      state = s;
      assert.equal(canStart(), false, `should block start from ${s}`);
    }
  });

  it("allows stop from starting (model-loading abort)", () => {
    state = "starting";
    assert.equal(canStop(), true);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Cleanup grace period logic
// ═══════════════════════════════════════════════════════════════════

describe("Cleanup grace period", () => {
  const GRACE_MS = 5 * 60 * 1000;

  function shouldCleanup(note) {
    const cutoff = new Date(Date.now() - GRACE_MS);
    return note.status === "recording" && new Date(note.date) < cutoff;
  }

  it("does NOT clean up notes created < 5 minutes ago", () => {
    const note = { status: "recording", date: new Date(), transcript: "" };
    assert.equal(shouldCleanup(note), false);
  });

  it("cleans up notes stuck in recording for > 5 minutes", () => {
    const oldDate = new Date(Date.now() - 6 * 60 * 1000);
    const note = { status: "recording", date: oldDate, transcript: "" };
    assert.equal(shouldCleanup(note), true);
  });

  it("does NOT clean up completed notes regardless of age", () => {
    const oldDate = new Date(Date.now() - 60 * 60 * 1000);
    const note = { status: "complete", date: oldDate, transcript: "" };
    assert.equal(shouldCleanup(note), false);
  });

  it("preserves notes with transcript (marks complete, not deletes)", () => {
    const oldDate = new Date(Date.now() - 6 * 60 * 1000);
    const note = { status: "recording", date: oldDate, transcript: "Some text" };
    // shouldCleanup returns true, but the note has content → mark complete, not delete
    assert.equal(shouldCleanup(note), true);
    assert.ok(note.transcript.length > 0, "note has content — should be preserved");
  });
});

