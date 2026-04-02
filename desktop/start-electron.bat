@echo off
REM ──────────────────────────────────────────────────────────
REM  TicketOps — Electron desktop launcher (Windows)
REM
REM  Usage:
REM    desktop\start-electron.bat
REM ──────────────────────────────────────────────────────────
setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "DESKTOP_DIR=%SCRIPT_DIR%"

REM ── Check prerequisites ──────────────────────────────────
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo [ERROR] Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not installed ^(comes with Node.js^).
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
for /f "tokens=*" %%v in ('npm --version') do set NPM_VER=%%v
echo [INFO]  Node %NODE_VER% / npm %NPM_VER%

REM ── Install npm dependencies if needed ───────────────────
if not exist "%DESKTOP_DIR%node_modules" (
    echo [INFO]  Installing desktop dependencies ...
    pushd "%DESKTOP_DIR%"
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
    popd
)

REM ── Launch Electron ──────────────────────────────────────
echo [INFO]  Launching TicketOps desktop app ...
pushd "%DESKTOP_DIR%"
call npm start
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Electron failed to start.
    pause
    exit /b 1
)
popd
