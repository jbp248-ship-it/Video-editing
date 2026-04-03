# Resale Terminal - Bootstrap Installer
# Run this with: irm https://raw.githubusercontent.com/jbp248-ship-it/Video-editing/claude/build-resale-terminal-pwa-w5lbc/resale-terminal/bootstrap.ps1 | iex

$ErrorActionPreference = "Stop"
$InstallDir = "$env:USERPROFILE\ResaleTerminal"

Write-Host ""
Write-Host "  ================================" -ForegroundColor Cyan
Write-Host "   RESALE TERMINAL  -  Installing" -ForegroundColor Cyan
Write-Host "  ================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Install Node.js silently if missing
if (-Not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  Downloading Node.js (1-2 min)..." -ForegroundColor Yellow
    $msi = "$env:TEMP\node.msi"
    Invoke-WebRequest "https://nodejs.org/dist/v20.18.3/node-v20.18.3-x64.msi" -OutFile $msi -UseBasicParsing
    Start-Process msiexec.exe -Wait -ArgumentList "/I `"$msi`" /quiet /norestart"
    Remove-Item $msi -Force
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Write-Host "  Node.js ready." -ForegroundColor Green
}

# Step 2: Download the app
Write-Host "  Downloading Resale Terminal..." -ForegroundColor Yellow
$zip = "$env:TEMP\resale-terminal.zip"
Invoke-WebRequest "https://github.com/jbp248-ship-it/Video-editing/archive/refs/heads/claude/build-resale-terminal-pwa-w5lbc.zip" -OutFile $zip -UseBasicParsing
Expand-Archive $zip "$env:TEMP\rt-extract" -Force
Remove-Item $zip -Force
if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
Move-Item "$env:TEMP\rt-extract\*\resale-terminal" $InstallDir
Remove-Item "$env:TEMP\rt-extract" -Recurse -Force
Write-Host "  App downloaded." -ForegroundColor Green

# Step 3: Install npm packages
Write-Host "  Installing packages (1-2 min)..." -ForegroundColor Yellow
Set-Location $InstallDir
npm install --silent 2>$null
Write-Host "  Packages ready." -ForegroundColor Green

# Step 4: Set up API keys
if (-Not (Test-Path "$InstallDir\.env")) {
    Copy-Item "$InstallDir\.env.example" "$InstallDir\.env"
    Write-Host ""
    Write-Host "  =============================================" -ForegroundColor Yellow
    Write-Host "   LAST STEP: Paste your 3 API keys into the" -ForegroundColor Yellow
    Write-Host "   file that's about to open, then SAVE it." -ForegroundColor Yellow
    Write-Host "  =============================================" -ForegroundColor Yellow
    Write-Host ""
    Start-Process notepad "$InstallDir\.env" -Wait
}

# Step 5: Create Desktop shortcut
$startScript = "$InstallDir\start.ps1"
$shortcut = "$env:USERPROFILE\Desktop\Resale Terminal.lnk"
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($shortcut)
$lnk.TargetPath = "powershell.exe"
$lnk.Arguments = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`""
$lnk.WorkingDirectory = $InstallDir
$lnk.Description = "Resale Terminal"
$lnk.Save()

Write-Host ""
Write-Host "  ================================" -ForegroundColor Green
Write-Host "   DONE! Launching now..." -ForegroundColor Green
Write-Host "   A shortcut is on your Desktop." -ForegroundColor Green
Write-Host "  ================================" -ForegroundColor Green
Write-Host ""

Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File `"$startScript`""
