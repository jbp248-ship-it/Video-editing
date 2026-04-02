#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# TicketOps — Electron desktop launcher (macOS / Linux)
#
# Usage:
#   ./desktop/start-electron.sh
# ──────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DESKTOP_DIR="$SCRIPT_DIR"

# ── Colour helpers (no-op when not a terminal) ────────────────
if [ -t 1 ]; then
    GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
else
    GREEN=''; RED=''; YELLOW=''; NC=''
fi

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── Check prerequisites ──────────────────────────────────────
if ! command -v node &>/dev/null; then
    error "Node.js is not installed."
    error "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

if ! command -v npm &>/dev/null; then
    error "npm is not installed (comes with Node.js)."
    exit 1
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 18 ]; then
    warn "Node.js $NODE_MAJOR detected; version 18+ is recommended."
fi

info "Node $(node --version) / npm $(npm --version)"

# ── Install npm dependencies if needed ────────────────────────
if [ ! -d "$DESKTOP_DIR/node_modules" ]; then
    info "Installing desktop dependencies ..."
    (cd "$DESKTOP_DIR" && npm install)
fi

# ── Launch Electron ───────────────────────────────────────────
info "Launching TicketOps desktop app ..."
cd "$DESKTOP_DIR"
exec npm start
