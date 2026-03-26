@echo off
REM ══════════════════════════════════════
REM   AI Note Taker — Windows Setup
REM ══════════════════════════════════════
REM
REM Usage: Double-click this file, or run from CMD/PowerShell:
REM   setup.bat
REM

echo.
echo ======================================
echo   AI Note Taker - Extension Setup
echo ======================================
echo.

REM ── Check Node.js ──
echo [1/5] Checking Node.js...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js not found.
    echo Download it from https://nodejs.org ^(v18+^)
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do echo   Found Node.js %%i

where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm not found. Reinstall Node.js from https://nodejs.org
    pause
    exit /b 1
)
echo.

REM ── Install dependencies ──
echo [2/5] Installing dependencies...
call npm install --no-fund --no-audit
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
)
echo.

REM ── Download Whisper model ──
echo [3/5] Downloading Whisper model (~75 MB, cached on repeat runs)...
if exist "models\Xenova\whisper-tiny.en\onnx\encoder_model.onnx" (
    echo   Model already cached - skipping download
) else (
    call npm run download-model
)
echo.

REM ── Generate icons ──
echo [4/5] Generating extension icons...
node scripts\generate-icons.mjs
echo.

REM ── Build ──
echo [5/5] Building extension...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: Build failed.
    pause
    exit /b 1
)

echo.
echo ======================================
echo   Setup complete!
echo ======================================
echo.
echo To install in Chrome:
echo.
echo   1. Open chrome://extensions
echo   2. Enable "Developer mode" (top-right toggle)
echo   3. Click "Load unpacked"
echo   4. Select this folder:
echo.
echo      %CD%\dist
echo.
echo Optional - Enable Gemini Nano for summaries:
echo.
echo   1. Open chrome://flags/#optimization-guide-on-device-model
echo   2. Set to "Enabled BypassPerfRequirement"
echo   3. Restart Chrome
echo.
echo Then click the AI Note Taker icon in your toolbar!
echo.
pause
