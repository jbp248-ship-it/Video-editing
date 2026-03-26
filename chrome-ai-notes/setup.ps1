#
# AI Note Taker — PowerShell Setup
#
# Usage (from the chrome-ai-notes folder):
#   powershell -ExecutionPolicy Bypass -File setup.ps1
#
# Or if execution policy allows:
#   .\setup.ps1
#

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  AI Note Taker - Extension Setup" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Check Node.js ──
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Blue

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "ERROR: Node.js not found." -ForegroundColor Red
    Write-Host "Download it from https://nodejs.org (v18+)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$nodeVersion = & node -v
Write-Host "  Found Node.js $nodeVersion" -ForegroundColor Green

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Host "ERROR: npm not found. Reinstall Node.js." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$npmVersion = & npm -v
Write-Host "  Found npm $npmVersion" -ForegroundColor Green
Write-Host ""

# ── Step 2: Install dependencies ──
Write-Host "[2/5] Installing dependencies..." -ForegroundColor Blue
& npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm install failed." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host ""

# ── Step 3: Download Whisper model ──
Write-Host "[3/5] Downloading Whisper model (~75 MB, cached on repeat runs)..." -ForegroundColor Blue

$modelPath = Join-Path $PSScriptRoot "models\Xenova\whisper-tiny.en\onnx\encoder_model.onnx"
if (Test-Path $modelPath) {
    Write-Host "  Model already cached - skipping download" -ForegroundColor Green
} else {
    & npm run download-model
}
Write-Host ""

# ── Step 4: Generate icons ──
Write-Host "[4/5] Generating extension icons..." -ForegroundColor Blue
& node scripts/generate-icons.mjs
Write-Host ""

# ── Step 5: Build ──
Write-Host "[5/5] Building extension..." -ForegroundColor Blue
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$distPath = Join-Path $PSScriptRoot "dist"

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "To install in Chrome:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Open " -NoNewline; Write-Host "chrome://extensions" -ForegroundColor Yellow
Write-Host "  2. Enable " -NoNewline; Write-Host "Developer mode" -ForegroundColor Yellow -NoNewline; Write-Host " (top-right toggle)"
Write-Host "  3. Click " -NoNewline; Write-Host "Load unpacked" -ForegroundColor Yellow
Write-Host "  4. Select this folder:"
Write-Host ""
Write-Host "     $distPath" -ForegroundColor Cyan
Write-Host ""

# Copy path to clipboard
$distPath | Set-Clipboard
Write-Host "  (Path copied to clipboard!)" -ForegroundColor DarkGray
Write-Host ""

Write-Host "Optional - Enable Gemini Nano for summaries:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Open " -NoNewline; Write-Host "chrome://flags/#optimization-guide-on-device-model" -ForegroundColor Yellow
Write-Host "  2. Set to " -NoNewline; Write-Host "Enabled BypassPerfRequirement" -ForegroundColor Yellow
Write-Host "  3. Restart Chrome"
Write-Host ""
Write-Host "Then click the AI Note Taker icon in your toolbar!" -ForegroundColor White
Write-Host ""

Read-Host "Press Enter to close"
