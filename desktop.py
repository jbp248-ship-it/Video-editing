#!/usr/bin/env python3
"""
TicketOps — double-click to launch.

Starts the server and opens the app in your browser.
Close the terminal window to stop.
"""

import os
import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

PORT = 5000
URL = f"http://localhost:{PORT}"


def main():
    from app import app

    Path(app.config["UPLOAD_FOLDER"]).mkdir(exist_ok=True)
    Path("output").mkdir(exist_ok=True)

    # Open browser after a short delay (gives Flask time to start)
    threading.Timer(1.5, lambda: webbrowser.open(URL)).start()

    print()
    print("=" * 40)
    print("  TicketOps is running!")
    print(f"  {URL}")
    print()
    print("  Close this window to stop.")
    print("=" * 40)
    print()

    app.run(host="127.0.0.1", port=PORT, debug=False, threaded=True)


if __name__ == "__main__":
    main()
