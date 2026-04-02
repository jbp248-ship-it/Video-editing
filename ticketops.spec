# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for TicketOps (TikTok Video Clipper)

Usage:
    pyinstaller ticketops.spec --noconfirm --clean

This bundles the Flask backend into a single-folder distributable.
"""

import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Project paths
# ---------------------------------------------------------------------------

ROOT = Path(SPECPATH)

# All .py modules in the project root (the Flask app + supporting modules).
_exclude = {"build.py", "create_test_video.py", "start.py", "run.py"}
_py_files = sorted(
    p for p in ROOT.glob("*.py")
    if p.name not in _exclude and p.name != "ticketops.spec"
)

# Hidden imports — modules that PyInstaller might not detect automatically.
hiddenimports = [p.stem for p in _py_files if p.stem != "app"]

# ---------------------------------------------------------------------------
# Data files to include
# ---------------------------------------------------------------------------
# Format: (source, destination_folder)

datas = []

# Include config.py as data so it can be found at runtime.
if (ROOT / "config.py").exists():
    datas.append((str(ROOT / "config.py"), "."))

# Include templates/ directory if it exists.
if (ROOT / "templates").is_dir():
    datas.append((str(ROOT / "templates"), "templates"))

# Include static/ directory if it exists.
if (ROOT / "static").is_dir():
    datas.append((str(ROOT / "static"), "static"))

# Include desktop assets (icon) for branding.
icon_path = str(ROOT / "desktop" / "assets" / "icon.svg")
if (ROOT / "desktop" / "assets" / "icon.svg").exists():
    datas.append((icon_path, "assets"))

# ---------------------------------------------------------------------------
# Packages to exclude (reduce bundle size)
# ---------------------------------------------------------------------------

excludes = [
    "matplotlib",
    "tkinter",
    "IPython",
    "jupyter",
    "jupyter_client",
    "jupyter_core",
    "notebook",
    "nbconvert",
    "nbformat",
    "pytest",
    "unittest",
    "setuptools",
    "pip",
    "distutils",
    "ensurepip",
    "test",
    "xmlrpc",
    "pydoc_data",
]

# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

a = Analysis(
    [str(ROOT / "app.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
)

# ---------------------------------------------------------------------------
# PYZ archive (compiled bytecode)
# ---------------------------------------------------------------------------

pyz = PYZ(a.pure)

# ---------------------------------------------------------------------------
# Executable
# ---------------------------------------------------------------------------

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="TicketOps",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    # Hide console on Windows for a clean desktop experience.
    console=False if sys.platform == "win32" else True,
    # Icon — set to .ico on Windows, .icns on macOS when available.
    # For now, no icon file in a compatible format; set to None.
    icon=None,
)

# ---------------------------------------------------------------------------
# Collect into a single folder
# ---------------------------------------------------------------------------

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="TicketOps",
)
