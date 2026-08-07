@echo off
setlocal
cd /d "%~dp0"
echo.
echo ARC LOCAL UI TEST
echo =================
echo This opens a small local web server for testing navigation and browser storage.
echo AI providers, Cloudflare Access, D1, R2, CourtListener and Firecrawl still require deployment.
echo.
where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://127.0.0.1:8080/index.html?arcLocal=1"
  py -m http.server 8080 --bind 127.0.0.1
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://127.0.0.1:8080/index.html?arcLocal=1"
  python -m http.server 8080 --bind 127.0.0.1
  goto :eof
)
echo Python was not found. You can still double-click index.html; navigation now uses local-safe relative paths.
pause
