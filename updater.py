"""
Self-update module for TicketOps.

Checks for new commits on the configured GitHub branch, pulls updates,
and detects whether a restart is needed.
"""

import importlib
import logging
import os
import subprocess
import time
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────────

REPO_URL = "https://github.com/jbp248-ship-it/Video-editing"
BRANCH = "claude/improve-ticketops-startup-SUpnB"
PROJECT_ROOT = str(Path(__file__).resolve().parent)

# Timestamp of last successful pull — used by needs_restart()
_last_pull_time: float = 0.0


# ── Helpers ──────────────────────────────────────────────────────────────

def _git(*args: str) -> subprocess.CompletedProcess:
    """Run a git command in the project root and return the result."""
    cmd = ["git"] + list(args)
    logger.debug("Running: %s", " ".join(cmd))
    result = subprocess.run(
        cmd,
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:
        logger.warning("git %s failed (rc=%d): %s", args[0], result.returncode, result.stderr.strip())
    return result


def _get_head_commit() -> str:
    """Return the short hash of the current HEAD commit."""
    result = _git("rev-parse", "--short", "HEAD")
    return result.stdout.strip() if result.returncode == 0 else "unknown"


def _get_full_head_commit() -> str:
    """Return the full hash of the current HEAD commit."""
    result = _git("rev-parse", "HEAD")
    return result.stdout.strip() if result.returncode == 0 else "unknown"


def _get_branch_name() -> str:
    """Return the name of the currently checked-out branch."""
    result = _git("rev-parse", "--abbrev-ref", "HEAD")
    return result.stdout.strip() if result.returncode == 0 else "unknown"


def _read_version() -> str:
    """Import (or re-import) version.py and return __version__."""
    try:
        import version as _v
        importlib.reload(_v)
        return _v.__version__
    except Exception as exc:
        logger.warning("Could not read version.py: %s", exc)
        return "unknown"


# ── Public API ───────────────────────────────────────────────────────────

def get_current_info() -> dict:
    """Return current version, commit hash, and branch name."""
    return {
        "commit": _get_head_commit(),
        "full_commit": _get_full_head_commit(),
        "branch": _get_branch_name(),
        "current_version": _read_version(),
    }


def check_for_updates() -> dict:
    """
    Fetch from origin and check whether the remote branch is ahead of HEAD.

    Returns a dict with update status information.
    """
    current_version = _read_version()
    current_commit = _get_full_head_commit()

    # Fetch the latest refs from origin
    fetch = _git("fetch", "origin", BRANCH)
    if fetch.returncode != 0:
        return {
            "update_available": False,
            "current_commit": current_commit,
            "latest_commit": current_commit,
            "commits_behind": 0,
            "current_version": current_version,
            "error": f"Failed to fetch: {fetch.stderr.strip()}",
        }

    # How many commits are we behind?
    count_result = _git("rev-list", "--count", f"HEAD..origin/{BRANCH}")
    commits_behind = int(count_result.stdout.strip()) if count_result.returncode == 0 else 0

    # Latest commit on the remote branch
    latest_result = _git("rev-parse", f"origin/{BRANCH}")
    latest_commit = latest_result.stdout.strip() if latest_result.returncode == 0 else "unknown"

    return {
        "update_available": commits_behind > 0,
        "current_commit": current_commit,
        "latest_commit": latest_commit,
        "commits_behind": commits_behind,
        "current_version": current_version,
    }


def get_changelog() -> list[str]:
    """
    Return a list of one-line commit descriptions between HEAD and the
    remote branch tip.  Call check_for_updates() first to ensure refs are
    fetched.
    """
    result = _git("log", f"HEAD..origin/{BRANCH}", "--oneline")
    if result.returncode != 0 or not result.stdout.strip():
        return []
    return [line for line in result.stdout.strip().splitlines() if line]


def apply_update() -> dict:
    """
    Pull the latest commits from the remote branch.

    Returns a dict describing the outcome.
    """
    global _last_pull_time

    old_version = _read_version()

    pull = _git("pull", "origin", BRANCH)
    if pull.returncode != 0:
        return {
            "success": False,
            "old_version": old_version,
            "new_version": old_version,
            "message": f"Pull failed: {pull.stderr.strip()}",
        }

    _last_pull_time = time.time()

    new_version = _read_version()
    return {
        "success": True,
        "old_version": old_version,
        "new_version": new_version,
        "message": f"Updated from {old_version} to {new_version}" if old_version != new_version
                   else f"Pulled latest changes (version {new_version})",
    }


def needs_restart() -> bool:
    """
    Check whether any .py files in the project were modified since the last
    pull.  This indicates the running server is out-of-date and a restart
    would pick up new code.
    """
    if _last_pull_time == 0.0:
        return False

    try:
        # Ask git which Python files changed between the pre-pull HEAD and now
        result = _git("diff", "--name-only", "HEAD@{1}", "HEAD", "--", "*.py")
        if result.returncode == 0 and result.stdout.strip():
            changed = [f for f in result.stdout.strip().splitlines() if f.endswith(".py")]
            if changed:
                logger.info("Python files changed since last pull: %s", changed)
                return True
    except Exception as exc:
        logger.warning("needs_restart check failed: %s", exc)

    # Fallback: scan file modification times
    try:
        for py_file in Path(PROJECT_ROOT).rglob("*.py"):
            if py_file.stat().st_mtime > _last_pull_time:
                logger.info("File modified after pull: %s", py_file)
                return True
    except Exception as exc:
        logger.warning("mtime scan failed: %s", exc)

    return False
