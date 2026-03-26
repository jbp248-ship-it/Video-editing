#!/usr/bin/env bash
#
# AI Note Taker — One-command setup
#
# Usage:
#   chmod +x setup.sh && ./setup.sh
#
# What it does:
#   1. Checks for Node.js (v18+)
#   2. Installs npm dependencies
#   3. Downloads the Whisper model (~75 MB, cached on repeat runs)
#   4. Generates extension icons
#   5. Builds the extension into dist/
#   6. Prints instructions for loading into Chrome
#

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

step=0
total_steps=5

progress() {
  step=$((step + 1))
  echo ""
  echo -e "${BLUE}[${step}/${total_steps}]${NC} ${BOLD}$1${NC}"
  echo ""
}

success() {
  echo -e "${GREEN}✓${NC} $1"
}

warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

fail() {
  echo -e "${RED}✗${NC} $1"
  exit 1
}

# ── Navigate to script directory ──
cd "$(dirname "$0")"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   AI Note Taker — Extension Setup    ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"

# ── Step 1: Check Node.js ──
progress "Checking Node.js..."

if ! command -v node &> /dev/null; then
  fail "Node.js not found. Install it from https://nodejs.org (v18+)"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js v18+ required (found v$(node -v)). Update at https://nodejs.org"
fi

success "Node.js $(node -v) detected"

if ! command -v npm &> /dev/null; then
  fail "npm not found. It should come with Node.js."
fi

success "npm $(npm -v) detected"

# ── Step 2: Install dependencies ──
progress "Installing dependencies..."

npm install --no-fund --no-audit 2>&1 | tail -3
success "Dependencies installed"

# ── Step 3: Download Whisper model ──
progress "Downloading Whisper model (first run only, ~75 MB)..."

if [ -f "models/Xenova/whisper-tiny.en/onnx/encoder_model.onnx" ]; then
  success "Model already cached — skipping download"
else
  npm run download-model
  success "Model downloaded"
fi

# ── Step 4: Generate icons ──
progress "Generating extension icons..."

node scripts/generate-icons.mjs
success "Icons ready"

# ── Step 5: Build extension ──
progress "Building extension..."

npm run build 2>&1 | tail -5
success "Extension built → dist/"

# ── Done ──
echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  Setup complete!${NC}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}To install in Chrome:${NC}"
echo ""
echo "  1. Open ${BOLD}chrome://extensions${NC}"
echo "  2. Enable ${BOLD}Developer mode${NC} (top-right toggle)"
echo "  3. Click ${BOLD}Load unpacked${NC}"
echo "  4. Select this folder:"
echo ""
echo -e "     ${BLUE}$(pwd)/dist${NC}"
echo ""
echo -e "${BOLD}Optional — Enable Gemini Nano for summaries:${NC}"
echo ""
echo "  1. Open ${BOLD}chrome://flags/#optimization-guide-on-device-model${NC}"
echo "  2. Set to ${BOLD}Enabled BypassPerfRequirement${NC}"
echo "  3. Restart Chrome"
echo ""
echo -e "Then click the ${BOLD}AI Note Taker${NC} icon in your toolbar. Done!"
echo ""
