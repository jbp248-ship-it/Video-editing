#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# TicketOps — Electron desktop launcher (macOS / Linux)
#
# Usage:
#   bash desktop/start-electron.sh
#   ./desktop/start-electron.sh
# ──────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DESKTOP_DIR="$SCRIPT_DIR"

# ── Colour helpers (no-op when stdout is not a terminal) ─────
if [ -t 1 ]; then
    GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
else
    GREEN=''; RED=''; YELLOW=''; NC=''
fi

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── Check prerequisites ─────────────────────────────────────
if ! command -v node &>/dev/null; then
    error "Node.js is not installed."
    error "Install Node.js 18+ from https://nodejs.org/ or via your package manager."
    error ""
    error "Fallback: run  python3 start.py  to use the browser-based UI instead."
    exit 1
fi

if ! command -v npm &>/dev/null; then
    error "npm is not installed (it ships with Node.js)."
    exit 1
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 18 ]; then
    warn "Node.js v${NODE_MAJOR} detected. Version 18+ is recommended."
fi

info "Node $(node --version) / npm $(npm --version)"

# ── Install npm dependencies if missing ──────────────────────
if [ ! -d "$DESKTOP_DIR/node_modules" ]; then
    info "Installing desktop dependencies (first run) ..."
    if ! (cd "$DESKTOP_DIR" && npm install); then
        error "npm install failed. Check the output above for details."
        exit 1
    fi
    info "Dependencies installed."
fi

# ── Check Python backend is available ────────────────────────
if [ ! -f "$PROJECT_DIR/app.py" ]; then
    error "app.py not found in $PROJECT_DIR"
    error "Make sure you are running this from the project root."
    exit 1
fi

# ── Launch Electron ──────────────────────────────────────────
info "Launching TicketOps desktop app ..."
cd "$DESKTOP_DIR"
exec npm start
