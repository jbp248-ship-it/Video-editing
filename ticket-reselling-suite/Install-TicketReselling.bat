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
echo   [1/3] Installing packages...
call npm install 2>nul

:: Setup database
echo   [2/3] Setting up database...
call npx prisma generate 2>nul
call npx prisma db push --accept-data-loss 2>nul

:: Create desktop shortcut
echo   [3/3] Creating desktop shortcut...
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
