@echo off
title ARC MOTION Local Server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the current LTS from https://nodejs.org/en/download
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies - first run only...
  call npm install --no-audit --no-fund
)
if not exist .env (
  copy .env.example .env >nul
)
echo.
echo Starting ARC MOTION at http://127.0.0.1:8790
echo Keep this window open while working. Close it to stop the application.
start "" http://127.0.0.1:8790
node server\server.mjs
pause
