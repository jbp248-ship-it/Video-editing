#!/usr/bin/env python3
"""
TicketOps Desktop App

Launches the TicketOps web app inside a native desktop window using pywebview.
Same functionality as the browser-based app, but runs as a proper desktop application
with native window chrome, system tray, and menu bar.

Usage:
    python desktop.py
    python desktop.py --debug       # Enable dev tools
    python desktop.py --fullscreen  # Launch fullscreen
"""

import sys
import os
import signal
import threading
import argparse
import logging
from pathlib import Path

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
os.chdir(PROJECT_ROOT)
sys.path.insert(0, str(PROJECT_ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ticketops-desktop")

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(description="TicketOps Desktop App")
    parser.add_argument("--debug", action="store_true", help="Enable developer tools")
    parser.add_argument("--fullscreen", action="store_true", help="Launch in fullscreen")
    parser.add_argument("--width", type=int, default=1280, help="Window width (default: 1280)")
    parser.add_argument("--height", type=int, default=860, help="Window height (default: 860)")
    parser.add_argument("--port", type=int, default=5000, help="Flask server port (default: 5000)")
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Flask server (runs in background thread)
# ---------------------------------------------------------------------------

def start_flask_server(port: int):
    """Start the Flask app in a background thread."""
    from app import app

    Path(app.config["UPLOAD_FOLDER"]).mkdir(exist_ok=True)
    Path("output").mkdir(exist_ok=True)

    # Disable Flask's reloader — it conflicts with pywebview's main loop
    app.run(
        host="127.0.0.1",
        port=port,
        debug=False,
        threaded=True,
        use_reloader=False,
    )


# ---------------------------------------------------------------------------
# Native menu bar
# ---------------------------------------------------------------------------

def build_menu_items(window):
    """Build native menu items for the desktop window."""
    import webview

    def go_home():
        window.load_url(f"http://127.0.0.1:{window._port}/")

    def go_notes():
        window.load_url(f"http://127.0.0.1:{window._port}/notes")

    def toggle_fullscreen():
        window.toggle_fullscreen()

    def open_output_folder():
        output_dir = PROJECT_ROOT / "output"
        output_dir.mkdir(exist_ok=True)
        if sys.platform == "darwin":
            os.system(f'open "{output_dir}"')
        elif sys.platform == "win32":
            os.startfile(str(output_dir))
        else:
            os.system(f'xdg-open "{output_dir}"')

    def show_about():
        window.evaluate_js("""
            alert('TicketOps Desktop v1.0\\n\\nVideo Clipper + AI Note Taker + Study Tools\\n\\nPowered by Flask & pywebview');
        """)

    return [
        webview.menu.Menu("Navigate", [
            webview.menu.MenuAction("Video Clipper", go_home),
            webview.menu.MenuAction("Notes & Study Tools", go_notes),
            webview.menu.MenuSeparator(),
            webview.menu.MenuAction("Toggle Fullscreen", toggle_fullscreen),
        ]),
        webview.menu.Menu("Tools", [
            webview.menu.MenuAction("Open Output Folder", open_output_folder),
        ]),
        webview.menu.Menu("Help", [
            webview.menu.MenuAction("About TicketOps", show_about),
        ]),
    ]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = parse_args()

    try:
        import webview
    except ImportError:
        print("=" * 55)
        print("  pywebview is required for the desktop app.")
        print("  Install it with:")
        print()
        print("    pip install pywebview")
        print()
        print("  On Linux you may also need:")
        print("    sudo apt install python3-gi gir1.2-webkit2-4.1")
        print("=" * 55)
        sys.exit(1)

    port = args.port

    # Start Flask in a daemon thread so it dies when the window closes
    logger.info("Starting Flask server on port %d ...", port)
    server_thread = threading.Thread(
        target=start_flask_server,
        args=(port,),
        daemon=True,
    )
    server_thread.start()

    # Give Flask a moment to bind
    import time
    time.sleep(1.0)

    # Create the native window
    logger.info("Opening TicketOps desktop window ...")
    window = webview.create_window(
        title="TicketOps",
        url=f"http://127.0.0.1:{port}/",
        width=args.width,
        height=args.height,
        resizable=True,
        min_size=(800, 600),
        fullscreen=args.fullscreen,
        text_select=True,
    )

    # Stash port on the window object so the menu callbacks can use it
    window._port = port

    # Build menu bar
    try:
        menu = build_menu_items(window)
    except Exception:
        # Menu API may not be available on all backends
        menu = []

    # Start the GUI event loop (blocks until window is closed)
    webview.start(
        debug=args.debug,
        menu=menu if menu else None,
        gui=None,  # auto-detect best backend
    )

    logger.info("Window closed — exiting.")
    # Force-kill any lingering threads (Flask, background jobs, etc.)
    os.kill(os.getpid(), signal.SIGTERM)


if __name__ == "__main__":
    main()
