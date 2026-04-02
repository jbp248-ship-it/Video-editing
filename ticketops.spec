# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for TicketOps (TikTok Video Clipper)

Bundles the Flask backend into a single-folder distributable.

Usage:
    pyinstaller ticketops.spec --noconfirm --clean
    # or via the build script:
    python build.py package
"""

import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Project paths
# ---------------------------------------------------------------------------

ROOT = Path(SPECPATH)

# All .py modules in the project root — exclude build/test utilities.
_exclude = {"build.py", "create_test_video.py", "start.py", "run.py"}
_py_files = sorted(
    p for p in ROOT.glob("*.py")
    if p.name not in _exclude and not p.name.startswith("test_")
)

# Hidden imports — modules that PyInstaller may not detect via static analysis.
hiddenimports = [p.stem for p in _py_files if p.stem != "app"]

# ---------------------------------------------------------------------------
# Data files to include  — (source, destination_folder)
# ---------------------------------------------------------------------------

datas = []

# config.py is imported at runtime; include as data so it is always found.
if (ROOT / "config.py").exists():
    datas.append((str(ROOT / "config.py"), "."))

# Jinja2 / Flask templates.
if (ROOT / "templates").is_dir():
    datas.append((str(ROOT / "templates"), "templates"))

# Static assets (CSS, JS, images).
if (ROOT / "static").is_dir():
    datas.append((str(ROOT / "static"), "static"))

# Desktop icon for branding.
_icon_svg = ROOT / "desktop" / "assets" / "icon.svg"
if _icon_svg.exists():
    datas.append((str(_icon_svg), "assets"))

# ---------------------------------------------------------------------------
# Packages to exclude (reduce bundle size)
# ---------------------------------------------------------------------------

excludes = [
    # GUI toolkits not needed for a headless Flask server
    "matplotlib",
    "tkinter",
    "_tkinter",
    # Interactive / notebook
    "IPython",
    "jupyter",
    "jupyter_client",
    "jupyter_core",
    "notebook",
    "nbconvert",
    "nbformat",
    # Testing
    "pytest",
    "unittest",
    # Packaging tools (not needed at runtime)
    "setuptools",
    "pip",
    "distutils",
    "ensurepip",
    # Misc standard-library modules rarely used at runtime
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
    # Hide console window on Windows for a clean desktop experience.
    console=False if sys.platform == "win32" else True,
    # Icon — set to .ico on Windows or .icns on macOS when a compatible file
    # is available.  None means the default PyInstaller icon is used.
    icon=None,
)

# ---------------------------------------------------------------------------
# Collect into a single-folder distributable
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
