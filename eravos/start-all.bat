@echo off
setlocal EnableDelayedExpansion
title Eravos

REM ===========================================================================
REM  Eravos - start (v0.29.1)
REM
REM  REWRITTEN. The previous version started TWO processes: a relay on 8787
REM  and serve-eravos.js on 8080. That layout has been wrong since v0.15.0,
REM  when the relay was consolidated onto the app's own port at /relay. The
REM  browser DERIVES its relay URL from the page it is served from
REM  (host:port/relay), so booting the old way gave an app on 8080 whose
REM  relay URL pointed at a port with no relay behind it. That presents as
REM  "the app works fine, she just never comes online" and nothing says why.
REM
REM  ONE process, ONE port. eravos-serve.js serves the app, the relay and
REM  Emergence together.
REM ===========================================================================

cd /d "%~dp0"

echo.
echo   Eravos
echo   ==========================================================

where node >nul 2>&1
if errorlevel 1 (
  echo   [X] node is not on PATH. Install Node 22+ from nodejs.org.
  echo.
  pause
  exit /b 1
)

REM node:sqlite (DatabaseSync) needs Node 22+. Say so here rather than
REM letting the relay's persistence layer throw halfway through boot.
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODEMAJ=%%v
if !NODEMAJ! LSS 22 (
  echo   [X] Node !NODEMAJ! detected. Eravos needs Node 22+ ^(node:sqlite^).
  echo.
  pause
  exit /b 1
)

REM Port is config, not a literal here - one source of truth.
for /f "delims=" %%p in ('node -p "try{require('./eravos/config/options.json').server.port}catch(e){4020}"') do set PORT=%%p
echo   port      !PORT!  ^(from eravos/config/options.json^)

REM --------------------------------------------------------------------------
REM  Is the port taken, and BY WHAT? "Port in use" with no name is a dead end.
REM --------------------------------------------------------------------------
set SQUATTER=
for /f "tokens=5" %%a in ('netstat -ano -p TCP ^| findstr /r /c:"LISTENING" ^| findstr /r /c:":!PORT! "') do set SQUATTER=%%a

if defined SQUATTER (
  set OWNER=unknown
  for /f "tokens=1" %%n in ('tasklist /fi "PID eq !SQUATTER!" /nh 2^>nul') do set OWNER=%%n
  echo.
  echo   [X] Port !PORT! is already held by PID !SQUATTER!  ^(!OWNER!^)
  echo.
  if /i "!OWNER!"=="System" (
    echo       That is http.sys - IIS or another Windows HTTP service.
    echo         net stop http /y            ^(as Administrator^)
  ) else (
    echo       Full path of the process holding it:
    echo         powershell -c "Get-Process -Id !SQUATTER! ^| Select-Object Name,Path"
    echo.
    echo       Stop it, or run Eravos elsewhere:
    echo         node eravos-serve.js --port=4020
  )
  echo.
  echo       If it is your own NEXUS stack: its proxy engine binds httpPort
  echo       from nexus\conf\proxy.conf, which defaults to 80.
  echo.
  pause
  exit /b 1
)

echo.
echo   Starting...
echo   ----------------------------------------------------------
echo   Watch for:   relay ... /relay       with NO "NOT ATTACHED"
echo   That one line is the whole co-creation path. If it says
echo   NOT ATTACHED, pairing cannot work - and nothing will say
echo   so again later.
echo.

start "Eravos" cmd /k "cd /d %~dp0 && node eravos-serve.js"

REM Let it bind before opening a browser at nothing.
timeout /t 3 /nobreak >nul
start http://localhost:!PORT!

echo   Opened http://localhost:!PORT!
echo   To stop: stop-all.bat, or close the Eravos window.
echo.
endlocal
