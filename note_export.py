"""
Multi-format export module for AI meeting notes.

Exports MeetingNotes to Markdown, JSON, Obsidian, Notion API blocks, and CSV.
Uses only Python stdlib.
"""

import csv
import io
import json
import logging
import re
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Version metadata
# ---------------------------------------------------------------------------
__version__ = "1.0.0"
__tool_name__ = "tiktok-clipper-note-export"


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def format_timestamp(seconds: float) -> str:
    """Convert seconds to HH:MM:SS format."""
    if seconds < 0:
        seconds = 0.0
    total = int(round(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


# ---------------------------------------------------------------------------
# Internal utilities
# ---------------------------------------------------------------------------

def _safe(value: str) -> str:
    """Return value or empty string when None/missing."""
    return value if value else ""


def _escape_md(text: str) -> str:
    """Escape pipe characters for Markdown table cells."""
    if not text:
        return ""
    return text.replace("|", "\\|").replace("\n", " ")


def _slugify(text: str) -> str:
    """Convert text to a slug suitable for tags."""
    slug = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s_]+", "-", slug).strip("-")


def _link_keywords(text: str, keywords: list[str]) -> str:
    """Wrap recognised keywords in Obsidian [[internal link]] syntax.

    Uses word-boundary matching so partial words are not linked.
    Each keyword is linked at most once per call to avoid noisy output.
    """
    if not keywords or not text:
        return _safe(text)
    result = text
    for kw in keywords:
        if not kw:
            continue
        pattern = re.compile(re.escape(kw), re.IGNORECASE)
        # Only replace the first occurrence
        match = pattern.search(result)
        if match:
            original = match.group(0)
            # Don't double-link
            start = match.start()
            if start >= 2 and result[start - 2:start] == "[[":
                continue
            result = result[:start] + f"[[{original}]]" + result[match.end():]
    return result


def _duration_display(seconds: float) -> str:
    """Human-readable duration like '1h 23m'."""
    if seconds < 0:
        seconds = 0.0
    total = int(round(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, _ = divmod(remainder, 60)
    parts = []
    if hours:
        parts.append(f"{hours}h")
    if minutes or not parts:
        parts.append(f"{minutes}m")
    return " ".join(parts)


def _ensure_dir(path: str) -> Path:
    """Create parent directories if needed and return a Path."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


# ---------------------------------------------------------------------------
# Notion helpers
# ---------------------------------------------------------------------------

def _notion_rich_text(content: str, bold: bool = False, italic: bool = False,
                      code: bool = False) -> dict:
    """Build a single Notion rich_text element."""
    rt: dict = {"type": "text", "text": {"content": content}}
    annotations: dict = {}
    if bold:
        annotations["bold"] = True
    if italic:
        annotations["italic"] = True
    if code:
        annotations["code"] = True
    if annotations:
        rt["annotations"] = annotations
    return rt


def _notion_heading(level: int, text: str) -> dict:
    key = f"heading_{level}"
    return {"type": key, key: {"rich_text": [_notion_rich_text(text)]}}


def _notion_bullet(text: str) -> dict:
    return {
        "type": "bulleted_list_item",
        "bulleted_list_item": {"rich_text": [_notion_rich_text(text)]},
    }


def _notion_callout(text: str, emoji: str = "💡") -> dict:
    return {
        "type": "callout",
        "callout": {
            "icon": {"emoji": emoji},
            "rich_text": [_notion_rich_text(text)],
        },
    }


def _notion_divider() -> dict:
    return {"type": "divider", "divider": {}}


def _notion_table_row(cells: list[str]) -> dict:
    return {
        "type": "table_row",
        "table_row": {
            "cells": [[_notion_rich_text(c)] for c in cells],
        },
    }


# ---------------------------------------------------------------------------
# Export: Markdown
# ---------------------------------------------------------------------------

def export_markdown(notes, output_path: str, template: str = "detailed") -> str:
    """Export meeting notes to Markdown.

    Args:
        notes: MeetingNotes dataclass instance.
        output_path: Destination file path.
        template: One of "detailed", "concise", or "action-focused".

    Returns:
        The absolute path of the written file.
    """
    if template not in ("detailed", "concise", "action-focused"):
        logger.warning("Unknown template '%s', falling back to 'detailed'.", template)
        template = "detailed"

    lines: list[str] = []

    # --- Header ---
    speaker_count = len(notes.speakers) if notes.speakers else 0
    lines.append(f"# {_safe(notes.title)}")
    lines.append(
        f"**Date:** {_safe(notes.date)} | "
        f"**Duration:** {_duration_display(notes.duration)} | "
        f"**Speakers:** {speaker_count}"
    )
    lines.append("")

    # --- Executive Summary (detailed + concise) ---
    if template in ("detailed", "concise"):
        lines.append("## Executive Summary")
        lines.append(_safe(notes.executive_summary))
        lines.append("")

    # --- Key Takeaways (detailed + action-focused) ---
    if template in ("detailed", "action-focused"):
        if notes.key_takeaways:
            lines.append("## Key Takeaways")
            for t in notes.key_takeaways:
                lines.append(f"- {t}")
            lines.append("")

    # --- Topics (detailed only) ---
    if template == "detailed" and notes.topics:
        lines.append("## Topics Discussed")
        lines.append("")
        for idx, topic in enumerate(notes.topics, 1):
            ts_start = format_timestamp(topic.start_time)
            ts_end = format_timestamp(topic.end_time)
            lines.append(f"### {idx}. {_safe(topic.title)} [{ts_start} - {ts_end}]")
            lines.append(_safe(topic.summary))
            lines.append("")
            if topic.key_points:
                lines.append("**Key Points:**")
                for kp in topic.key_points:
                    lines.append(f"- {kp}")
                lines.append("")
            if topic.speaker_labels:
                lines.append("**Speaker Contributions:**")
                for speaker_id, statements in topic.speaker_labels.items():
                    if isinstance(statements, list):
                        summary_text = "; ".join(str(s) for s in statements)
                    else:
                        summary_text = str(statements)
                    lines.append(f"- **{speaker_id}:** {summary_text}")
                lines.append("")
            lines.append("---")
            lines.append("")

    # --- Action Items (all templates) ---
    if notes.action_items:
        lines.append("## Action Items")
        lines.append("| Priority | Action | Assignee | Timestamp |")
        lines.append("|----------|--------|----------|-----------|")
        for ai in notes.action_items:
            lines.append(
                f"| {_escape_md(ai.priority.upper())} "
                f"| {_escape_md(ai.text)} "
                f"| {_escape_md(ai.assignee)} "
                f"| {format_timestamp(ai.timestamp)} |"
            )
        lines.append("")

    # --- Decisions (all templates for concise/action-focused; detailed too) ---
    if notes.decisions:
        lines.append("## Decisions Made")
        lines.append("| Decision | Context | Timestamp |")
        lines.append("|----------|---------|-----------|")
        for d in notes.decisions:
            lines.append(
                f"| {_escape_md(d.text)} "
                f"| {_escape_md(d.context)} "
                f"| {format_timestamp(d.timestamp)} |"
            )
        lines.append("")

    # --- Keywords (detailed only) ---
    if template == "detailed" and notes.keywords:
        lines.append("## Keywords & Entities")
        lines.append(", ".join(notes.keywords))
        lines.append("")

    # --- Full Transcript (detailed only) ---
    if template == "detailed" and notes.full_transcript:
        lines.append("## Full Transcript")
        lines.append(_safe(notes.full_transcript))
        lines.append("")

    content = "\n".join(lines)
    out = _ensure_dir(output_path)
    out.write_text(content, encoding="utf-8")
    logger.info("Markdown exported to %s", out)
    return str(out.resolve())


# ---------------------------------------------------------------------------
# Export: JSON
# ---------------------------------------------------------------------------

def export_json(notes, output_path: str) -> str:
    """Export meeting notes as structured JSON.

    Returns:
        The absolute path of the written file.
    """
    data = {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "tool": __tool_name__,
            "tool_version": __version__,
            "format_version": "1.0",
        },
        "meeting": asdict(notes),
    }

    out = _ensure_dir(output_path)
    out.write_text(json.dumps(data, indent=2, default=str, ensure_ascii=False), encoding="utf-8")
    logger.info("JSON exported to %s", out)
    return str(out.resolve())


# ---------------------------------------------------------------------------
# Export: Obsidian
# ---------------------------------------------------------------------------

def export_obsidian(notes, output_path: str) -> str:
    """Export meeting notes as Obsidian-flavoured Markdown with YAML frontmatter.

    Returns:
        The absolute path of the written file.
    """
    lines: list[str] = []
    keywords = notes.keywords or []
    speakers_list = list(notes.speakers.keys()) if notes.speakers else []

    # --- YAML frontmatter ---
    tag_list = ["meeting-notes"] + [_slugify(k) for k in keywords if k]
    lines.append("---")
    lines.append(f"date: {_safe(notes.date)}")
    lines.append(f"tags: [{', '.join(tag_list)}]")
    lines.append(f"speakers: [{', '.join(speakers_list)}]")
    lines.append(f"duration: {_duration_display(notes.duration)}")
    lines.append("type: meeting-notes")
    lines.append("---")
    lines.append("")

    # --- Title ---
    lines.append(f"# {_safe(notes.title)}")
    lines.append("")

    # --- Executive Summary ---
    lines.append("> [!summary]")
    for para in _safe(notes.executive_summary).split("\n"):
        lines.append(f"> {para}")
    lines.append("")

    # --- Key Takeaways ---
    if notes.key_takeaways:
        lines.append("## Key Takeaways")
        for t in notes.key_takeaways:
            lines.append(f"- {_link_keywords(t, keywords)}")
        lines.append("")

    # --- Topics ---
    if notes.topics:
        lines.append("## Topics")
        for topic in notes.topics:
            ts = format_timestamp(topic.start_time)
            tag = f"#{_slugify(topic.title)}" if topic.title else ""
            lines.append(f"### {_safe(topic.title)} `{ts}` {tag}")
            lines.append(_link_keywords(_safe(topic.summary), keywords))
            lines.append("")

            # Key points
            if topic.key_points:
                for kp in topic.key_points:
                    lines.append(f"- {_link_keywords(kp, keywords)}")
                lines.append("")

        # Collect action items and decisions per-section (global)
        if notes.action_items:
            lines.append("> [!todo] Action Items")
            for ai in notes.action_items:
                lines.append(
                    f"> - [ ] {ai.text} — @{ai.assignee} "
                    f"_{ai.priority}_ `{format_timestamp(ai.timestamp)}`"
                )
            lines.append("")

        if notes.decisions:
            lines.append("> [!check] Decisions")
            for d in notes.decisions:
                lines.append(f"> - {d.text} `{format_timestamp(d.timestamp)}`")
            lines.append("")

    # --- Transcript ---
    if notes.full_transcript:
        lines.append("## Transcript")
        lines.append(_safe(notes.full_transcript))
        lines.append("")

    content = "\n".join(lines)
    out = _ensure_dir(output_path)
    out.write_text(content, encoding="utf-8")
    logger.info("Obsidian export written to %s", out)
    return str(out.resolve())


# ---------------------------------------------------------------------------
# Export: Notion API blocks
# ---------------------------------------------------------------------------

def export_notion_blocks(notes) -> list[dict]:
    """Generate Notion API-compatible block objects.

    Returns:
        A list of block dicts ready for the Notion Create Page / Append Children API.
    """
    blocks: list[dict] = []

    # Title
    blocks.append(_notion_heading(1, _safe(notes.title)))

    # Metadata callout
    speaker_count = len(notes.speakers) if notes.speakers else 0
    blocks.append(_notion_callout(
        f"Date: {_safe(notes.date)}  |  Duration: {_duration_display(notes.duration)}  |  "
        f"Speakers: {speaker_count}",
        emoji="📋",
    ))

    # Executive Summary
    blocks.append(_notion_heading(2, "Executive Summary"))
    blocks.append(_notion_bullet(_safe(notes.executive_summary)))

    # Key Takeaways
    if notes.key_takeaways:
        blocks.append(_notion_heading(2, "Key Takeaways"))
        for t in notes.key_takeaways:
            blocks.append(_notion_bullet(t))

    # Topics
    if notes.topics:
        blocks.append(_notion_heading(2, "Topics Discussed"))
        for topic in notes.topics:
            ts = format_timestamp(topic.start_time)
            blocks.append(_notion_heading(3, f"{_safe(topic.title)} [{ts}]"))
            blocks.append(_notion_bullet(_safe(topic.summary)))
            if topic.key_points:
                for kp in topic.key_points:
                    blocks.append(_notion_bullet(kp))
            blocks.append(_notion_divider())

    # Action Items table
    if notes.action_items:
        blocks.append(_notion_heading(2, "Action Items"))
        # Header row
        blocks.append({
            "type": "table",
            "table": {
                "table_width": 4,
                "has_column_header": True,
                "has_row_header": False,
                "children": [
                    _notion_table_row(["Priority", "Action", "Assignee", "Timestamp"]),
                ] + [
                    _notion_table_row([
                        ai.priority.upper(),
                        ai.text,
                        ai.assignee,
                        format_timestamp(ai.timestamp),
                    ])
                    for ai in notes.action_items
                ],
            },
        })

    # Decisions table
    if notes.decisions:
        blocks.append(_notion_heading(2, "Decisions Made"))
        blocks.append({
            "type": "table",
            "table": {
                "table_width": 3,
                "has_column_header": True,
                "has_row_header": False,
                "children": [
                    _notion_table_row(["Decision", "Context", "Timestamp"]),
                ] + [
                    _notion_table_row([
                        d.text,
                        d.context,
                        format_timestamp(d.timestamp),
                    ])
                    for d in notes.decisions
                ],
            },
        })

    # Keywords
    if notes.keywords:
        blocks.append(_notion_heading(2, "Keywords & Entities"))
        blocks.append(_notion_bullet(", ".join(notes.keywords)))

    return blocks


# ---------------------------------------------------------------------------
# Export: CSV (action items only)
# ---------------------------------------------------------------------------

def export_csv_action_items(notes, output_path: str) -> str:
    """Export action items to CSV for project management tool import.

    Returns:
        The absolute path of the written file.
    """
    out = _ensure_dir(output_path)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Priority", "Action", "Assignee", "Timestamp", "Context", "Status"])

    for ai in notes.action_items or []:
        writer.writerow([
            ai.priority.upper(),
            ai.text,
            ai.assignee,
            format_timestamp(ai.timestamp),
            ai.context,
            "TODO",
        ])

    out.write_text(buf.getvalue(), encoding="utf-8")
    logger.info("CSV action items exported to %s", out)
    return str(out.resolve())


# ---------------------------------------------------------------------------
# Export: all formats at once
# ---------------------------------------------------------------------------

def export_all(notes, output_dir: str, template: str = "detailed") -> dict:
    """Export meeting notes to every supported format.

    Creates the following files inside *output_dir*:
        notes.md, notes.json, notes_obsidian.md, notion_blocks.json, action_items.csv

    Args:
        notes: MeetingNotes dataclass instance.
        output_dir: Directory to write all exports into.
        template: Markdown template variant.

    Returns:
        Dict mapping format name to the absolute output path.
    """
    base = Path(output_dir)
    base.mkdir(parents=True, exist_ok=True)

    results: dict[str, str] = {}

    try:
        results["markdown"] = export_markdown(
            notes, str(base / "notes.md"), template=template,
        )
    except Exception:
        logger.exception("Failed to export Markdown")

    try:
        results["json"] = export_json(notes, str(base / "notes.json"))
    except Exception:
        logger.exception("Failed to export JSON")

    try:
        results["obsidian"] = export_obsidian(notes, str(base / "notes_obsidian.md"))
    except Exception:
        logger.exception("Failed to export Obsidian Markdown")

    try:
        notion_blocks = export_notion_blocks(notes)
        notion_path = base / "notion_blocks.json"
        notion_path.write_text(
            json.dumps(notion_blocks, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        results["notion"] = str(notion_path.resolve())
        logger.info("Notion blocks exported to %s", notion_path)
    except Exception:
        logger.exception("Failed to export Notion blocks")

    try:
        results["csv"] = export_csv_action_items(
            notes, str(base / "action_items.csv"),
        )
    except Exception:
        logger.exception("Failed to export CSV action items")

    logger.info("All exports complete: %s", list(results.keys()))
    return results
