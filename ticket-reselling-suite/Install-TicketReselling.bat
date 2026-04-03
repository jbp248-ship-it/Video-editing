@echo off
title TicketReselling Installer
echo.
echo   ========================================
echo      Installing TicketReselling...
echo   ========================================
echo.

cd /d "%~dp0"

:: Kill any running instances
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM electron.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Install dependencies
echo   [1/4] Installing packages...
call npm install 2>nul

:: Verify Electron installed
echo   [2/4] Verifying Electron...
call npx electron --version >nul 2>&1
if errorlevel 1 (
  echo   Reinstalling Electron...
  rmdir /s /q node_modules\electron 2>nul
  call npm install electron 2>nul
)

:: Setup database
echo   [3/4] Setting up database...
call npx prisma generate 2>nul
call npx prisma db push --accept-data-loss 2>nul

:: Create desktop shortcut
echo   [4/4] Creating desktop shortcut...
set SHORTCUT=%USERPROFILE%\Desktop\TicketReselling.lnk
set TARGET=%~dp0TicketReselling.bat
set ICON=%~dp0public\icon.png

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%TARGET%'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'TicketReselling - Ticket Reselling Suite'; $s.Save()"

echo.
echo   ========================================
echo      TicketReselling installed!
echo      A shortcut has been added to your Desktop.
echo      Double-click "TicketReselling" on your desktop to launch.
echo   ========================================
echo.
pause
