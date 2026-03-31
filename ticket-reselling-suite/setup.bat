@echo off
cd /d "%~dp0"
echo ============================================
echo   TicketOps - Ticket Reselling Dashboard
echo ============================================
echo.
echo Installing dependencies...
call npm install
echo.
echo Setting up database...
call npx prisma generate
call npx prisma db push
echo.
echo ============================================
echo   Setup complete!
echo.
echo   To launch the desktop app, run:
echo     npm run electron:dev
echo ============================================
pause
