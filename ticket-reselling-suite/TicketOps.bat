@echo off
title TicketOps
cd /d "%~dp0"
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul
npm run electron:dev
