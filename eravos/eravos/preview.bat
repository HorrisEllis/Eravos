@echo off
REM Quick local preview only — for real deployment, drop this whole folder
REM into Apache (or any web server) instead. This just avoids the
REM file:// / fetch() browser restriction for local testing.
cd /d "%~dp0"
set PORT=8080
echo Starting local preview server on http://localhost:%PORT% ...

where npx >nul 2>nul
if %errorlevel%==0 (
  start http://localhost:%PORT%
  npx --yes http-server -p %PORT%
  goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
  start http://localhost:%PORT%
  python -m http.server %PORT%
  goto :eof
)

echo Need Node.js or Python installed to run a local preview server.
pause
