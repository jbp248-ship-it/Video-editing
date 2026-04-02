@echo off
title TicketReselling Setup
echo ========================================
echo   TicketReselling - First Time Setup
echo ========================================
echo.
cd /d "%~dp0"

echo Installing dependencies...
call npm install --ignore-scripts

echo.
echo Setting up database...
call npx prisma generate
call npx prisma db push --accept-data-loss

echo.
echo ========================================
echo   Setup complete!
echo   Double-click TicketReselling.bat to launch.
echo ========================================
echo.
pause
