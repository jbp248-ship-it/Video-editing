# Resale Terminal - One-Time Installer
# Run this once: Right-click -> Run with PowerShell

$ErrorActionPreference = "Stop"
$AppDir = $PSScriptRoot

Write-Host ""
Write-Host "  RESALE TERMINAL INSTALLER" -ForegroundColor Cyan
Write-Host "  --------------------------" -ForegroundColor DarkGray
Write-Host ""

# --- Step 1: Install Node.js if not present ---
$nodePath = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-Not $nodePath) {
    Write-Host "[1/4] Downloading Node.js (this takes ~1 minute)..." -ForegroundColor Yellow
    $nodeUrl = "https://nodejs.org/dist/v20.18.3/node-v20.18.3-x64.msi"
    $nodeMsi = "$env:TEMP\node_install.msi"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi -UseBasicParsing
    Write-Host "      Installing Node.js silently..." -ForegroundColor Yellow
    Start-Process msiexec.exe -Wait -ArgumentList "/I `"$nodeMsi`" /quiet /norestart"
    Remove-Item $nodeMsi -Force
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Write-Host "      Node.js installed." -ForegroundColor Green
} else {
    Write-Host "[1/4] Node.js already installed. Skipping." -ForegroundColor Green
}

# --- Step 2: Install npm dependencies ---
Write-Host "[2/4] Installing app dependencies..." -ForegroundColor Yellow
Set-Location $AppDir
npm install --silent
Write-Host "      Done." -ForegroundColor Green

# --- Step 3: Set up .env file ---
Write-Host "[3/4] Setting up config file..." -ForegroundColor Yellow
if (-Not (Test-Path "$AppDir\.env")) {
    Copy-Item "$AppDir\.env.example" "$AppDir\.env"
    Write-Host ""
    Write-Host "  -----------------------------------------------" -ForegroundColor Yellow
    Write-Host "  Add your 3 API keys to the file that opens now" -ForegroundColor Yellow
    Write-Host "  -----------------------------------------------" -ForegroundColor Yellow
    Write-Host ""
    Start-Process notepad "$AppDir\.env" -Wait
}
Write-Host "      Config ready." -ForegroundColor Green

# --- Step 4: Create Desktop Shortcut ---
Write-Host "[4/4] Creating desktop shortcut..." -ForegroundColor Yellow
$shortcutPath = "$env:USERPROFILE\Desktop\Resale Terminal.lnk"
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$AppDir\start.ps1`""
$Shortcut.WorkingDirectory = $AppDir
$Shortcut.IconLocation = "powershell.exe,0"
$Shortcut.Description = "Launch Resale Terminal"
$Shortcut.Save()
Write-Host "      Shortcut created on Desktop." -ForegroundColor Green

Write-Host ""
Write-Host "  INSTALL COMPLETE" -ForegroundColor Cyan
Write-Host "  Double-click 'Resale Terminal' on your Desktop to launch." -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to launch the app now"

# Launch the app
& "$AppDir\start.ps1"
