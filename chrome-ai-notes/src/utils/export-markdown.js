/**
 * Client-side Markdown export utility.
 *
 * Converts a note object from IndexedDB into a properly formatted
 * Markdown file with timestamps, metadata table, and optional summary.
 *
 * Timestamp format: [HH:MM:SS]
 * Example: [00:12:30] Today we discuss the implications of...
 */

/**
 * Convert seconds to HH:MM:SS.
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatTimestamp(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

/**
 * Build a Markdown string from a note object.
 *
 * @param {object} note - The note from IndexedDB
 * @param {string} [note.title]
 * @param {Date|string} [note.date]
 * @param {string} [note.courseName]
 * @param {string} [note.url]
 * @param {number} [note.duration] - seconds
 * @param {string} [note.transcript]
 * @param {Array} [note.chunks] - { text, offsetSec }
 * @param {string} [note.summary]
 * @returns {string} Markdown content
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

  // Timestamped chunks
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
 *
 * @param {object} note
 * @param {string} [summaryOverride] - Use this instead of note.summary
 */
export function downloadNoteAsMarkdown(note, summaryOverride) {
  const exportNote = summaryOverride
    ? { ...note, summary: summaryOverride }
    : note;

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
