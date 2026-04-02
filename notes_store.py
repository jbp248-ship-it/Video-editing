"""
notes_store.py - Daily notes storage system for the video notes app.

Notes are persisted to notes_data/notes.json as a flat JSON list.
All public functions are thread-safe via a module-level Lock.
"""

import json
import logging
import os
import threading
import uuid
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Storage configuration
# ---------------------------------------------------------------------------

_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "notes_data")
_NOTES_FILE = os.path.join(_DATA_DIR, "notes.json")

_CACHEABLE_FIELDS = {"summary", "study_guide", "quiz"}

_lock = threading.Lock()

# ---------------------------------------------------------------------------
# In-memory index (populated on first load, invalidated on every write)
# Bug 2 fix: O(1) lookups instead of O(n) linear scans
# ---------------------------------------------------------------------------

_index: dict[str, dict] = {}   # note_id -> note dict
_index_valid = False


def _invalidate_index() -> None:
    global _index_valid
    _index_valid = False


def _ensure_index(notes: list[dict]) -> None:
    global _index, _index_valid
    if not _index_valid:
        _index = {n["id"]: n for n in notes if n.get("id")}
        _index_valid = True


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _ensure_data_dir() -> None:
    """Create notes_data/ directory if it does not exist."""
    os.makedirs(_DATA_DIR, exist_ok=True)


def _load_notes() -> list[dict]:
    """Read notes from disk. Returns an empty list if the file is missing."""
    try:
        with open(_NOTES_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
            if not isinstance(data, list):
                logger.warning("notes.json did not contain a list; resetting to empty.")
                return []
            return data
    except FileNotFoundError:
        logger.debug("notes.json not found; starting with empty note list.")
        return []
    except json.JSONDecodeError as exc:
        # Bug 1 fix: back up the corrupt file before starting fresh so the
        # user can recover their data; never silently destroy it.
        import shutil
        import time
        backup = _NOTES_FILE + f".corrupt.{int(time.time())}"
        try:
            shutil.copy2(_NOTES_FILE, backup)
            logger.error(
                "notes.json corrupted (%s) — backed up to %s, starting fresh",
                exc,
                backup,
            )
        except Exception:
            logger.error(
                "notes.json corrupted (%s) and backup failed — starting fresh", exc
            )
        return []


def _save_notes(notes: list[dict]) -> None:
    """Write notes list to disk atomically (write to temp file then rename)."""
    _ensure_data_dir()
    tmp_path = _NOTES_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(notes, fh, indent=2, ensure_ascii=False)
    os.replace(tmp_path, _NOTES_FILE)
    # Bug 2 fix: invalidate the in-memory index after every write.
    _invalidate_index()
    logger.debug("Wrote %d note(s) to %s", len(notes), _NOTES_FILE)


def _make_note(
    title: str,
    raw_content: str,
    note_date: str,
    job_id: Optional[str],
) -> dict:
    """Construct a new note dict with all required fields."""
    return {
        "id": str(uuid.uuid4()),
        "date": note_date,
        "title": title,
        "raw_content": raw_content,
        "summary": None,
        "study_guide": None,
        "quiz": None,
        "job_id": job_id,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "tags": [],
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def save_note(
    title: str,
    raw_content: str,
    date: str = None,  # noqa: A002 — kept for public API compatibility
    job_id: str = None,
) -> dict:
    """Create and persist a new note entry.

    Parameters
    ----------
    title:       Human-readable title for the note.
    raw_content: Original transcript / notes text.
    date:        ISO date string (YYYY-MM-DD). Defaults to today (UTC).
    job_id:      Optional pipeline job ID to link to this note.

    Returns
    -------
    The saved note dict.
    """
    # Bug 4 fix: use a local alias so the parameter name `date` never
    # collides with datetime.date in this scope (datetime.date was removed
    # from the import; we now only import `datetime`).
    note_date = date if date is not None else datetime.utcnow().strftime("%Y-%m-%d")

    note = _make_note(title, raw_content, note_date, job_id)

    with _lock:
        notes = _load_notes()
        notes.append(note)
        _save_notes(notes)

    logger.info("Saved note id=%s title=%r date=%s", note["id"], title, note_date)
    return note


def get_note(note_id: str) -> Optional[dict]:
    """Return a single note by its UUID, or None if not found."""
    with _lock:
        notes = _load_notes()
        # Bug 2 fix: O(1) index lookup.
        _ensure_index(notes)
        note = _index.get(note_id)
        if note is not None:
            # Bug 3 fix: return a shallow copy so the caller owns a stable
            # snapshot that cannot be mutated by concurrent writers.
            return dict(note)

    logger.debug("get_note: id=%s not found", note_id)
    return None


def get_notes_by_date(date: str) -> list[dict]:  # noqa: A002
    """Return all notes for a given date (YYYY-MM-DD), in creation order."""
    with _lock:
        notes = _load_notes()

    # Bug 3 fix: copy each note so callers get stable snapshots.
    result = [dict(n) for n in notes if n.get("date") == date]
    logger.debug("get_notes_by_date: date=%s returned %d note(s)", date, len(result))
    return result


def get_all_notes() -> list[dict]:
    """Return all notes sorted by date descending (newest first)."""
    with _lock:
        notes = _load_notes()

    # Bug 3 fix: copy each note so callers get stable snapshots.
    sorted_notes = sorted(
        [dict(n) for n in notes],
        key=lambda n: n.get("date", ""),
        reverse=True,
    )
    logger.debug("get_all_notes: returned %d note(s)", len(sorted_notes))
    return sorted_notes


def get_dates_with_notes() -> list[str]:
    """Return a sorted list of unique dates that have at least one note (newest first)."""
    with _lock:
        notes = _load_notes()

    dates = sorted(
        {n["date"] for n in notes if n.get("date")},
        reverse=True,
    )
    logger.debug("get_dates_with_notes: %d unique date(s)", len(dates))
    return dates


def update_note_cache(note_id: str, field: str, value: Any) -> bool:
    """Update a cached derived field (summary, study_guide, or quiz) on a note.

    Parameters
    ----------
    note_id: UUID of the note to update.
    field:   One of 'summary', 'study_guide', 'quiz'.
    value:   New value to store (str for summary/study_guide, dict for quiz).

    Returns
    -------
    True if the note was found and updated, False otherwise.
    """
    if field not in _CACHEABLE_FIELDS:
        logger.error(
            "update_note_cache: field=%r is not cacheable; must be one of %s",
            field,
            sorted(_CACHEABLE_FIELDS),
        )
        return False

    with _lock:
        notes = _load_notes()
        # Bug 2 fix: O(1) index lookup instead of linear scan.
        _ensure_index(notes)
        note = _index.get(note_id)
        if note is not None:
            note[field] = value
            _save_notes(notes)
            logger.info(
                "update_note_cache: updated field=%r on note id=%s", field, note_id
            )
            return True

    logger.warning("update_note_cache: note id=%s not found", note_id)
    return False


def delete_note(note_id: str) -> bool:
    """Delete a note by ID.

    Returns
    -------
    True if the note was found and removed, False if it did not exist.
    """
    with _lock:
        notes = _load_notes()
        original_count = len(notes)
        filtered = [n for n in notes if n.get("id") != note_id]

        if len(filtered) == original_count:
            logger.warning("delete_note: note id=%s not found", note_id)
            return False

        _save_notes(filtered)

    logger.info("delete_note: deleted note id=%s", note_id)
    return True
