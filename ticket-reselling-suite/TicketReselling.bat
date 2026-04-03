@echo off
cd /d "%~dp0"
taskkill /F /IM electron.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3099 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak >nul
start "" /min cmd /c "cd /d "%~dp0" && npx electron . 2>nul"
exit
