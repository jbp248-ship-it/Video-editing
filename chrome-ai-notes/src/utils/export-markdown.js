/**
 * Markdown export utility.
 * Uses the shared formatTimestamp from constants.js — no duplication.
 */

import { formatTimestamp } from "./constants.js";

/**
 * Build a Markdown string from a note object.
 * @param {object} note
 * @returns {string}
 */
export function noteToMarkdown(note) {
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

/**
 * Trigger a browser download of the Markdown file.
 */
export function downloadNoteAsMarkdown(note, summaryOverride) {
  const exportNote = summaryOverride ? { ...note, summary: summaryOverride } : note;
  const md = noteToMarkdown(exportNote);
  const date = new Date(note.date).toISOString().split("T")[0];
  const slug = (note.title || "note").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();

  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${date}-${slug}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
