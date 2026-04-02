#!/usr/bin/env python3
"""
TicketOps Desktop Installer

Sets up TicketOps as a proper desktop application:
- Installs Python dependencies
- Creates a desktop shortcut (Windows, macOS, Linux)
- Optionally creates a Start Menu / Applications entry

Usage:
    python install_desktop.py
"""

import os
import sys
import stat
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
PYTHON = sys.executable
APP_NAME = "TicketOps"
DESKTOP_SCRIPT = PROJECT_ROOT / "desktop.py"


def install_dependencies():
    print("Installing core dependencies ...")
    # Install core deps first (these are stable across Python versions)
    try:
        subprocess.check_call([PYTHON, "-m", "pip", "install", "-r", str(PROJECT_ROOT / "requirements.txt")])
    except subprocess.CalledProcessError:
        print("  WARNING: Some core dependencies failed. Continuing anyway ...\n")

    # Install pywebview separately — on Windows it may need special handling
    print("Installing pywebview (desktop window) ...")
    try:
        subprocess.check_call([PYTHON, "-m", "pip", "install", "pywebview>=5.0"])
        print("pywebview installed.\n")
    except subprocess.CalledProcessError:
        print()
        print("=" * 55)
        print("  pywebview failed to install.")
        print()
        v = sys.version_info
        if v.minor >= 13:
            print(f"  You're on Python {v.major}.{v.minor} which is very new.")
            print("  pywebview/pythonnet may not support it yet.")
            print()
            print("  Fix: install Python 3.12 from python.org and retry:")
            print("    py -3.12 install_desktop.py")
        else:
            print("  On Windows, try:  pip install pywebview[cef]")
            print("  On Linux:  sudo apt install python3-gi gir1.2-webkit2-4.1")
        print("=" * 55)
        print()
        return False

    print("All dependencies installed.\n")
    return True


def create_icon():
    """Create a simple SVG icon if none exists."""
    icon_path = PROJECT_ROOT / "ticketops_icon.svg"
    if icon_path.exists():
        return icon_path
    icon_path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">\n'
        '  <rect width="128" height="128" rx="24" fill="#6C5CE7"/>\n'
        '  <text x="64" y="82" font-family="Arial,sans-serif" font-size="64" '
        'font-weight="bold" fill="white" text-anchor="middle">T</text>\n'
        '</svg>\n'
    )
    print(f"Created icon: {icon_path}")
    return icon_path


def create_linux_shortcut(icon_path):
    """Create a .desktop file for Linux."""
    desktop_dir = Path.home() / "Desktop"
    apps_dir = Path.home() / ".local" / "share" / "applications"

    desktop_entry = (
        "[Desktop Entry]\n"
        f"Name={APP_NAME}\n"
        "Comment=Video Clipper + AI Notes + Study Tools\n"
        f"Exec={PYTHON} {DESKTOP_SCRIPT}\n"
        f"Icon={icon_path}\n"
        "Terminal=false\n"
        "Type=Application\n"
        "Categories=AudioVideo;Video;Utility;\n"
        f"Path={PROJECT_ROOT}\n"
    )

    created = []
    for target_dir in [desktop_dir, apps_dir]:
        if target_dir.exists():
            shortcut = target_dir / f"{APP_NAME}.desktop"
            shortcut.write_text(desktop_entry)
            shortcut.chmod(shortcut.stat().st_mode | stat.S_IEXEC)
            created.append(shortcut)

    return created


def create_macos_shortcut():
    """Create a macOS .command launcher + optional .app alias."""
    launcher = PROJECT_ROOT / f"{APP_NAME}.command"
    launcher.write_text(
        "#!/bin/bash\n"
        f'cd "{PROJECT_ROOT}"\n'
        f'"{PYTHON}" desktop.py\n'
    )
    launcher.chmod(launcher.stat().st_mode | stat.S_IEXEC)

    # Also copy to Desktop if it exists
    desktop = Path.home() / "Desktop"
    created = [launcher]
    if desktop.exists():
        desktop_launcher = desktop / f"{APP_NAME}.command"
        desktop_launcher.write_text(launcher.read_text())
        desktop_launcher.chmod(desktop_launcher.stat().st_mode | stat.S_IEXEC)
        created.append(desktop_launcher)

    return created


def create_windows_shortcut():
    """Create a .bat launcher and a VBS shortcut creator for Windows."""
    # Batch launcher (always works)
    bat = PROJECT_ROOT / f"{APP_NAME}.bat"
    bat.write_text(
        f'@echo off\n'
        f'cd /d "{PROJECT_ROOT}"\n'
        f'"{PYTHON}" desktop.py\n'
    )

    # VBS script to create a proper Start Menu shortcut
    vbs = PROJECT_ROOT / "_create_shortcut.vbs"
    desktop_path = str(Path.home() / "Desktop")
    vbs.write_text(
        'Set WshShell = WScript.CreateObject("WScript.Shell")\n'
        f'Set Shortcut = WshShell.CreateShortcut("{desktop_path}\\{APP_NAME}.lnk")\n'
        f'Shortcut.TargetPath = "{PYTHON}"\n'
        f'Shortcut.Arguments = """{DESKTOP_SCRIPT}"""\n'
        f'Shortcut.WorkingDirectory = "{PROJECT_ROOT}"\n'
        f'Shortcut.Description = "TicketOps Desktop App"\n'
        'Shortcut.Save\n'
        'WScript.Echo "Desktop shortcut created!"\n'
    )

    created = [bat]
    # Try to run the VBS to create the .lnk shortcut
    try:
        subprocess.run(["cscript", "//nologo", str(vbs)], check=True, cwd=str(PROJECT_ROOT))
        created.append(Path(desktop_path) / f"{APP_NAME}.lnk")
    except Exception:
        print("  Could not auto-create .lnk shortcut — use the .bat file instead.")

    return created


def main():
    print()
    print("=" * 50)
    print(f"  {APP_NAME} Desktop Installer")
    print("=" * 50)
    print()

    # 1. Install deps
    deps_ok = install_dependencies()
    if deps_ok is False:
        print("Fix the dependency issue above, then re-run this script.")
        sys.exit(1)

    # 2. Create icon
    icon_path = create_icon()

    # 3. Create platform-specific shortcut
    print("Creating desktop shortcut ...")
    if sys.platform == "linux":
        created = create_linux_shortcut(icon_path)
    elif sys.platform == "darwin":
        created = create_macos_shortcut()
    elif sys.platform == "win32":
        created = create_windows_shortcut()
    else:
        print(f"  Unknown platform: {sys.platform}")
        created = []

    print()
    print("=" * 50)
    print(f"  {APP_NAME} installed!")
    print("=" * 50)
    print()
    if created:
        for p in created:
            print(f"  Shortcut: {p}")
        print()
    print(f"  You can also run it directly:")
    print(f"    python desktop.py")
    print()


if __name__ == "__main__":
    main()
