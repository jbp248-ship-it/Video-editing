#!/usr/bin/env python3
"""
TicketOps Desktop Launcher (Python-native fallback)

One-click launcher that starts the Flask backend and opens a browser.
Works without Electron — use this if Node.js is not installed.

Usage:
    python start.py
    python start.py --port 8080
    python start.py --no-browser
"""

import argparse
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_PORT = 5000
MAX_PORT_ATTEMPTS = 20
HEALTH_TIMEOUT = 60          # seconds to wait for Flask to start
HEALTH_POLL_INTERVAL = 0.4   # seconds between health checks

APP_DIR = os.path.dirname(os.path.abspath(__file__))
APP_SCRIPT = os.path.join(APP_DIR, "app.py")

_flask_proc = None  # global reference for signal handler


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def find_available_port(start: int = DEFAULT_PORT, attempts: int = MAX_PORT_ATTEMPTS) -> int:
    """Return the first available TCP port starting from *start*."""
    for offset in range(attempts):
        port = start + offset
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(0.5)
                sock.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    raise RuntimeError(
        f"Could not find an available port in range {start}-{start + attempts - 1}"
    )


def wait_for_server(port: int, timeout: float = HEALTH_TIMEOUT) -> bool:
    """Poll the Flask server until it responds or *timeout* expires."""
    health_url = f"http://127.0.0.1:{port}/health"
    root_url = f"http://127.0.0.1:{port}/"
    deadline = time.monotonic() + timeout

    while time.monotonic() < deadline:
        for url in (health_url, root_url):
            try:
                resp = urllib.request.urlopen(url, timeout=2)
                resp.close()
                return True
            except (urllib.error.URLError, OSError, ConnectionError):
                pass
        time.sleep(HEALTH_POLL_INTERVAL)
    return False


def build_flask_cmd(port: int) -> list:
    """Build the command list to start the Flask backend."""
    cmd = [sys.executable, APP_SCRIPT, "--port", str(port), "--no-browser"]
    return cmd


def start_flask(port: int) -> subprocess.Popen:
    """Start the Flask process in the background."""
    cmd = build_flask_cmd(port)

    kwargs = dict(
        cwd=APP_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env={**os.environ, "FLASK_PORT": str(port), "PYTHONUNBUFFERED": "1"},
    )

    # On Windows, hide the console window for a clean desktop experience.
    if sys.platform == "win32":
        CREATE_NO_WINDOW = 0x08000000
        kwargs["creationflags"] = CREATE_NO_WINDOW

    proc = subprocess.Popen(cmd, **kwargs)
    return proc


def shutdown_flask(proc):
    """Terminate the Flask process gracefully, then force-kill if needed."""
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=3)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    global _flask_proc

    parser = argparse.ArgumentParser(description="Launch TicketOps desktop app")
    parser.add_argument(
        "--port", type=int, default=DEFAULT_PORT,
        help=f"Preferred port (default: {DEFAULT_PORT}; auto-increments if busy)",
    )
    parser.add_argument(
        "--no-browser", action="store_true",
        help="Do not open the browser automatically",
    )
    args = parser.parse_args()

    # -- Verify app.py exists -----------------------------------------------
    if not os.path.isfile(APP_SCRIPT):
        print(f"[ERROR] {APP_SCRIPT} not found.", file=sys.stderr)
        sys.exit(1)

    # -- Find a free port ---------------------------------------------------
    try:
        port = find_available_port(start=args.port)
    except RuntimeError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        sys.exit(1)

    if port != args.port:
        print(f"[INFO]  Port {args.port} is busy, using {port} instead")

    # -- Start Flask --------------------------------------------------------
    print(f"[INFO]  Starting TicketOps on port {port} ...")
    _flask_proc = start_flask(port)

    # -- Graceful shutdown on Ctrl+C / SIGTERM ------------------------------
    def shutdown(signum=None, frame=None):
        print("\n[INFO]  Shutting down ...")
        shutdown_flask(_flask_proc)
        print("[INFO]  Stopped.")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    if sys.platform == "win32" and hasattr(signal, "SIGBREAK"):
        signal.signal(signal.SIGBREAK, shutdown)

    # -- Wait for Flask to be ready -----------------------------------------
    print("[INFO]  Waiting for server to start ...")
    if not wait_for_server(port):
        print("[ERROR] Server did not start within timeout.", file=sys.stderr)
        # Dump any captured output for debugging.
        if _flask_proc.stdout:
            out = _flask_proc.stdout.read()
            if out:
                print(out.decode(errors="replace"), file=sys.stderr)
        shutdown_flask(_flask_proc)
        sys.exit(1)

    # -- Open browser -------------------------------------------------------
    url = f"http://127.0.0.1:{port}"
    print(f"[INFO]  Server ready at {url}")

    if not args.no_browser:
        webbrowser.open(url)
        print("[INFO]  Browser opened")

    print("[INFO]  Press Ctrl+C to stop\n")

    # -- Keep running, forward Flask output ---------------------------------
    try:
        while True:
            if _flask_proc.poll() is not None:
                code = _flask_proc.returncode
                print(f"[WARN]  Flask exited with code {code}")
                sys.exit(code or 1)
            # Stream output line-by-line so the user can see logs.
            if _flask_proc.stdout:
                line = _flask_proc.stdout.readline()
                if line:
                    sys.stdout.buffer.write(line)
                    sys.stdout.buffer.flush()
            else:
                time.sleep(0.5)
    except KeyboardInterrupt:
        shutdown()


if __name__ == "__main__":
    main()
