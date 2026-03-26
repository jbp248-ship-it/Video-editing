#
# AI Note Taker — One-Command Installer for Windows
#
# Paste this into PowerShell:
#
#   irm https://raw.githubusercontent.com/jbp248-ship-it/Video-editing/claude/scaffold-chrome-ai-notes-QNfAf/chrome-ai-notes/install.ps1 | iex
#
# Or if you already have the repo cloned:
#
#   powershell -ExecutionPolicy Bypass -File install.ps1
#
# What it does:
#   1. Checks for Node.js and Git (offers to install if missing)
#   2. Clones the repo to your Desktop
#   3. Installs npm dependencies
#   4. Downloads the Whisper AI model (~75 MB)
#   5. Generates extension icons
#   6. Builds the extension
#   7. Copies the dist/ path to your clipboard
#   8. Opens chrome://extensions for you
#

$ErrorActionPreference = "Stop"

function Write-Step($num, $total, $msg) {
    Write-Host ""
    Write-Host "[$num/$total] " -ForegroundColor Blue -NoNewline
    Write-Host $msg -ForegroundColor White
}

function Write-Ok($msg) {
    Write-Host "  OK " -ForegroundColor Green -NoNewline
    Write-Host $msg
}

function Write-Err($msg) {
    Write-Host ""
    Write-Host "  ERROR: $msg" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# ════════════════════════════════════════════════════════════
#  Banner
# ════════════════════════════════════════════════════════════

Clear-Host
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "    AI Note Taker — Chrome Extension Setup" -ForegroundColor Cyan
Write-Host "    100% offline  |  Whisper + Gemini Nano" -ForegroundColor DarkCyan
Write-Host "  ============================================" -ForegroundColor Cyan

$totalSteps = 7

# ════════════════════════════════════════════════════════════
#  Step 1: Check / Install Node.js
# ════════════════════════════════════════════════════════════

Write-Step 1 $totalSteps "Checking Node.js..."

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue

if (-not $nodeCmd) {
    Write-Host "  Node.js not found." -ForegroundColor Yellow
    Write-Host ""
    $install = Read-Host "  Install Node.js automatically? (Y/n)"
    if ($install -eq "" -or $install -match "^[Yy]") {
        Write-Host "  Downloading Node.js installer..." -ForegroundColor DarkGray
        $nodeInstaller = Join-Path $env:TEMP "node-setup.msi"
        Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi" -OutFile $nodeInstaller
        Write-Host "  Running installer (follow the prompts)..." -ForegroundColor DarkGray
        Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstaller`"" -Wait
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
        if (-not $nodeCmd) {
            Write-Err "Node.js install succeeded but 'node' not in PATH. Close this window, open a new PowerShell, and run this script again."
        }
    } else {
        Write-Err "Node.js is required. Get it from https://nodejs.org"
    }
}

$nodeVersion = & node -v
Write-Ok "Node.js $nodeVersion"

# ════════════════════════════════════════════════════════════
#  Step 2: Check / Install Git
# ════════════════════════════════════════════════════════════

Write-Step 2 $totalSteps "Checking Git..."

$gitCmd = Get-Command git -ErrorAction SilentlyContinue

if (-not $gitCmd) {
    Write-Host "  Git not found." -ForegroundColor Yellow
    Write-Host ""
    $install = Read-Host "  Install Git automatically? (Y/n)"
    if ($install -eq "" -or $install -match "^[Yy]") {
        Write-Host "  Downloading Git installer..." -ForegroundColor DarkGray
        $gitInstaller = Join-Path $env:TEMP "git-setup.exe"
        Invoke-WebRequest -Uri "https://github.com/git-for-windows/git/releases/download/v2.44.0.windows.1/Git-2.44.0-64-bit.exe" -OutFile $gitInstaller
        Write-Host "  Running installer (follow the prompts)..." -ForegroundColor DarkGray
        Start-Process $gitInstaller -ArgumentList "/VERYSILENT /NORESTART" -Wait
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        $gitCmd = Get-Command git -ErrorAction SilentlyContinue
        if (-not $gitCmd) {
            Write-Err "Git install succeeded but 'git' not in PATH. Close this window, open a new PowerShell, and run this script again."
        }
    } else {
        Write-Err "Git is required. Get it from https://git-scm.com"
    }
}

$gitVersion = & git --version
Write-Ok $gitVersion

# ════════════════════════════════════════════════════════════
#  Step 3: Clone the repo (or find existing)
# ════════════════════════════════════════════════════════════

Write-Step 3 $totalSteps "Getting project files..."

# Check if we're already inside the project
$alreadyInProject = $false
$projectDir = $null

if (Test-Path (Join-Path $PSScriptRoot "package.json")) {
    # Script is running from inside the project
    $projectDir = $PSScriptRoot
    $alreadyInProject = $true
    Write-Ok "Already in project folder"
} elseif (Test-Path (Join-Path $PWD "package.json")) {
    $projectDir = $PWD.Path
    $alreadyInProject = $true
    Write-Ok "Already in project folder"
} else {
    # Clone to Desktop
    $desktopPath = [Environment]::GetFolderPath("Desktop")
    $repoDir = Join-Path $desktopPath "Video-editing"
    $projectDir = Join-Path $repoDir "chrome-ai-notes"

    if (Test-Path $projectDir) {
        Write-Ok "Project already exists on Desktop"
        Set-Location $projectDir
    } else {
        Write-Host "  Cloning to Desktop..." -ForegroundColor DarkGray
        Set-Location $desktopPath
        & git clone "https://github.com/jbp248-ship-it/Video-editing.git" 2>&1 | Out-Null
        if (-not (Test-Path $projectDir)) {
            Write-Err "Clone failed. Check your internet connection."
        }
        Write-Ok "Cloned to Desktop\Video-editing\chrome-ai-notes"
    }
}

Set-Location $projectDir

# ════════════════════════════════════════════════════════════
#  Step 4: Install npm dependencies + download model
# ════════════════════════════════════════════════════════════

Write-Step 4 $totalSteps "Installing dependencies + downloading AI model (~75 MB first time)..."

& npm install --no-fund --no-audit 2>&1 | Select-Object -Last 5
if ($LASTEXITCODE -ne 0) {
    Write-Err "npm install failed. Check the output above."
}
Write-Ok "Dependencies installed and model downloaded"

# ════════════════════════════════════════════════════════════
#  Step 5: Generate icons
# ════════════════════════════════════════════════════════════

Write-Step 5 $totalSteps "Generating extension icons..."

& node scripts/generate-icons.mjs
Write-Ok "Icons generated"

# ════════════════════════════════════════════════════════════
#  Step 6: Build
# ════════════════════════════════════════════════════════════

Write-Step 6 $totalSteps "Building extension..."

& npm run build 2>&1 | Select-Object -Last 5
if ($LASTEXITCODE -ne 0) {
    Write-Err "Build failed. Check the output above."
}

$distPath = Join-Path $projectDir "dist"
Write-Ok "Built to $distPath"

# ════════════════════════════════════════════════════════════
#  Step 7: Open Chrome
# ════════════════════════════════════════════════════════════

Write-Step 7 $totalSteps "Opening Chrome extensions page..."

# Copy dist path to clipboard
$distPath | Set-Clipboard
Write-Ok "dist/ path copied to your clipboard"

# Try to open Chrome extensions page
try {
    Start-Process "chrome" -ArgumentList "--new-tab chrome://extensions" -ErrorAction SilentlyContinue
    Write-Ok "Chrome opened to extensions page"
} catch {
    Write-Host "  Could not open Chrome automatically." -ForegroundColor Yellow
    Write-Host "  Open Chrome manually and go to: chrome://extensions" -ForegroundColor Yellow
}

# ════════════════════════════════════════════════════════════
#  Done
# ════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "    Setup complete!" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Chrome should be open to the extensions page." -ForegroundColor White
Write-Host "  Now just:" -ForegroundColor White
Write-Host ""
Write-Host "    1. Make sure " -NoNewline; Write-Host "Developer mode" -ForegroundColor Yellow -NoNewline; Write-Host " is ON (top-right)"
Write-Host "    2. Click " -NoNewline; Write-Host "Load unpacked" -ForegroundColor Yellow
Write-Host "    3. Press " -NoNewline; Write-Host "Ctrl+V" -ForegroundColor Yellow -NoNewline; Write-Host " in the folder picker (path is in your clipboard)"
Write-Host "    4. Click " -NoNewline; Write-Host "Select Folder" -ForegroundColor Yellow
Write-Host ""
Write-Host "  The folder path:" -ForegroundColor DarkGray
Write-Host "  $distPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Optional — for AI summaries, visit:" -ForegroundColor DarkGray
Write-Host "  chrome://flags/#optimization-guide-on-device-model" -ForegroundColor DarkGray
Write-Host "  Set to 'Enabled BypassPerfRequirement' and restart Chrome" -ForegroundColor DarkGray
Write-Host ""

Read-Host "Press Enter to close"
