# Resale Terminal - Update Script
# Run this to pull the latest version

$ErrorActionPreference = "Stop"
$AppDir = $PSScriptRoot

Write-Host ""
Write-Host "  RESALE TERMINAL UPDATER" -ForegroundColor Cyan
Write-Host "  ------------------------" -ForegroundColor DarkGray
Write-Host ""

Set-Location $AppDir

# Pull latest code
Write-Host "[1/3] Pulling latest updates from GitHub..." -ForegroundColor Yellow
git pull origin claude/build-resale-terminal-pwa-w5lbc
Write-Host "      Done." -ForegroundColor Green

# Re-install dependencies if package.json changed
Write-Host "[2/3] Updating dependencies..." -ForegroundColor Yellow
npm install --silent
Write-Host "      Done." -ForegroundColor Green

Write-Host "[3/3] Update complete." -ForegroundColor Green
Write-Host ""
Write-Host "  Launch the app from your Desktop shortcut." -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to close"
