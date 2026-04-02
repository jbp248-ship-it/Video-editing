#!/usr/bin/env python3
"""
TicketOps Build & Packaging Script

Commands:
    python build.py setup               Install all dependencies
    python build.py package              Bundle into a distributable executable
    python build.py package --platform   Target platform hint (win/mac/linux)
    python build.py clean                Remove build artifacts

Requirements for packaging:
    pip install pyinstaller>=6.0.0
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT_DIR = Path(__file__).resolve().parent
DESKTOP_DIR = ROOT_DIR / "desktop"
DIST_DIR = ROOT_DIR / "dist"
BUILD_DIR = ROOT_DIR / "build"
SPEC_FILE = ROOT_DIR / "ticketops.spec"

APP_NAME = "TicketOps"

# Python modules to include in the bundle (all .py files except tests/build).
EXCLUDE_FILES = {"build.py", "create_test_video.py", "start.py"}

# Large packages to exclude from the PyInstaller bundle to cut size.
PYINSTALLER_EXCLUDES = [
    "matplotlib",
    "tkinter",
    "scipy.spatial.cKDTree",
    "IPython",
    "jupyter",
    "notebook",
    "pytest",
    "unittest",
    "setuptools",
    "pip",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def run(cmd: list[str], cwd: str | Path | None = None, check: bool = True) -> int:
    """Run a command, printing it first."""
    label = " ".join(str(c) for c in cmd)
    print(f"\n>>> {label}")
    result = subprocess.run(cmd, cwd=cwd)
    if check and result.returncode != 0:
        print(f"[ERROR] Command failed with exit code {result.returncode}")
        sys.exit(result.returncode)
    return result.returncode


def ensure_command(name: str, install_hint: str) -> bool:
    """Check that a CLI tool is available."""
    if shutil.which(name):
        return True
    print(f"[WARN]  '{name}' not found. {install_hint}")
    return False

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_setup() -> None:
    """Install Python requirements and desktop (npm) dependencies."""
    print("=" * 50)
    print("  TicketOps — Setup")
    print("=" * 50)

    # Python deps
    req_file = ROOT_DIR / "requirements.txt"
    if req_file.exists():
        run([sys.executable, "-m", "pip", "install", "-r", str(req_file)])
    else:
        print("[WARN]  requirements.txt not found, skipping Python deps")

    # Desktop (Electron) deps
    if (DESKTOP_DIR / "package.json").exists():
        if ensure_command("npm", "Install Node.js from https://nodejs.org"):
            run(["npm", "install"], cwd=DESKTOP_DIR)
        else:
            print("[WARN]  Skipping Electron deps (npm not available)")
    else:
        print("[INFO]  No desktop/package.json — skipping Electron deps")

    print("\n[DONE]  Setup complete.\n")


def cmd_package(platform: str | None = None) -> None:
    """Bundle the Python backend into a distributable using PyInstaller."""
    print("=" * 50)
    print("  TicketOps — Package")
    print("=" * 50)

    # Ensure PyInstaller is installed.
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        print("[INFO]  Installing PyInstaller ...")
        run([sys.executable, "-m", "pip", "install", "pyinstaller>=6.0.0"])

    if platform:
        print(f"[INFO]  Target platform hint: {platform}")
        print("[INFO]  Note: PyInstaller can only build for the current OS.")
        print("[INFO]  Use a CI matrix (GitHub Actions) for true cross-platform builds.\n")

    # Collect all .py modules to add as hidden imports.
    py_files = sorted(
        p for p in ROOT_DIR.glob("*.py")
        if p.name not in EXCLUDE_FILES and p.name != "__pycache__"
    )
    hidden_imports = [p.stem for p in py_files if p.stem != "app"]

    # Build the PyInstaller command.
    cmd: list[str] = [
        sys.executable, "-m", "PyInstaller",
        str(SPEC_FILE),
        "--noconfirm",
        "--clean",
    ]

    print(f"[INFO]  Using spec file: {SPEC_FILE}")
    print(f"[INFO]  Hidden imports: {hidden_imports}")

    run(cmd, cwd=ROOT_DIR)

    # Report output
    out_dir = DIST_DIR / APP_NAME
    if out_dir.exists():
        size_mb = sum(f.stat().st_size for f in out_dir.rglob("*") if f.is_file()) / (1024 * 1024)
        print(f"\n[DONE]  Build complete: {out_dir}")
        print(f"[INFO]  Total size: {size_mb:.1f} MB")
    else:
        exe = DIST_DIR / (APP_NAME + (".exe" if sys.platform == "win32" else ""))
        if exe.exists():
            size_mb = exe.stat().st_size / (1024 * 1024)
            print(f"\n[DONE]  Build complete: {exe}")
            print(f"[INFO]  Size: {size_mb:.1f} MB")
        else:
            print(f"\n[DONE]  Build finished. Check {DIST_DIR}/ for output.")


def cmd_clean() -> None:
    """Remove build artifacts."""
    print("=" * 50)
    print("  TicketOps — Clean")
    print("=" * 50)

    for d in (BUILD_DIR, DIST_DIR):
        if d.exists():
            print(f"[INFO]  Removing {d}")
            shutil.rmtree(d)

    # Remove __pycache__ dirs
    for cache in ROOT_DIR.rglob("__pycache__"):
        if cache.is_dir():
            shutil.rmtree(cache)
            print(f"[INFO]  Removed {cache}")

    print("\n[DONE]  Clean complete.\n")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="TicketOps build & packaging tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Examples:\n"
               "  python build.py setup\n"
               "  python build.py package\n"
               "  python build.py package --platform win\n"
               "  python build.py clean\n",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("setup", help="Install Python and npm dependencies")

    pkg = sub.add_parser("package", help="Create distributable executable")
    pkg.add_argument(
        "--platform", choices=["win", "mac", "linux"], default=None,
        help="Target platform hint (informational; PyInstaller builds for current OS only)",
    )

    sub.add_parser("clean", help="Remove build artifacts")

    args = parser.parse_args()

    if args.command == "setup":
        cmd_setup()
    elif args.command == "package":
        cmd_package(platform=args.platform)
    elif args.command == "clean":
        cmd_clean()


if __name__ == "__main__":
    main()
