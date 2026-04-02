@echo off
REM ──────────────────────────────────────────────────────────
REM  TicketOps — Electron desktop launcher (Windows)
REM
REM  Usage:
REM    desktop\start-electron.bat
REM ──────────────────────────────────────────────────────────
setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
REM Remove trailing backslash for cleaner paths
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "DESKTOP_DIR=%SCRIPT_DIR%"

for %%I in ("%SCRIPT_DIR%\..") do set "PROJECT_DIR=%%~fI"

REM ── Check Node.js ───────────────────────────────────────
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo [ERROR] Install Node.js 18+ from https://nodejs.org/
    echo.
    echo [INFO]  Fallback: run  python start.py  to use the browser-based UI instead.
    pause
    exit /b 1
)

REM ── Check npm ───────────────────────────────────────────
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not installed ^(it ships with Node.js^).
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set "NODE_VER=%%v"
for /f "tokens=*" %%v in ('npm --version') do set "NPM_VER=%%v"
echo [INFO]  Node %NODE_VER% / npm %NPM_VER%

REM ── Install npm dependencies if missing ─────────────────
if not exist "%DESKTOP_DIR%\node_modules" (
    echo [INFO]  Installing desktop dependencies ^(first run^) ...
    pushd "%DESKTOP_DIR%"
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed. Check the output above for details.
        popd
        pause
        exit /b 1
    )
    popd
    echo [INFO]  Dependencies installed.
)

REM ── Check Python backend is available ───────────────────
if not exist "%PROJECT_DIR%\app.py" (
    echo [ERROR] app.py not found in %PROJECT_DIR%
    echo [ERROR] Make sure you are running this from the project root.
    pause
    exit /b 1
)

REM ── Launch Electron ─────────────────────────────────────
echo [INFO]  Launching TicketOps desktop app ...
pushd "%DESKTOP_DIR%"
call npm start
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Electron failed to start.
    popd
    pause
    exit /b 1
)
popd
