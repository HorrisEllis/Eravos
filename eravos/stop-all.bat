@echo off
setlocal EnableDelayedExpansion
title Eravos - stop

REM ===========================================================================
REM  Eravos - stop (v0.29.1)
REM
REM  Kills the REAL process by the pid in .eravos.lock, which eravos-serve.js
REM  writes on every successful bind. The previous version killed by window
REM  title only, so an Eravos started any other way (npm start, VS Code, a
REM  service) survived and kept the port - which then looked like "port in
REM  use by something that is not Eravos" on the next start.
REM ===========================================================================

cd /d "%~dp0"

echo.
echo   Eravos - stopping
echo   ==========================================================

set LOCKPID=
if exist ".eravos.lock" (
  for /f "delims=" %%p in ('node -p "try{require('./.eravos.lock').pid}catch(e){''}" 2^>nul') do set LOCKPID=%%p
)

if defined LOCKPID (
  tasklist /fi "PID eq !LOCKPID!" /nh 2>nul | findstr /i "node electron" >nul
  if errorlevel 1 (
    echo   lock names pid !LOCKPID!, but no node/electron is running as it.
    echo   Stale lock - removing.
    del ".eravos.lock" >nul 2>&1
  ) else (
    echo   Stopping Eravos, pid !LOCKPID! ...
    taskkill /PID !LOCKPID! /T /F >nul 2>&1
    if errorlevel 1 (
      echo   [!] taskkill failed. Try an Administrator prompt.
    ) else (
      echo   Stopped.
      del ".eravos.lock" >nul 2>&1
    )
  )
) else (
  echo   No .eravos.lock found - Eravos may not be running, or was started
  echo   from another folder.
)

REM Fallback for windows this script itself opened.
taskkill /FI "WINDOWTITLE eq Eravos*" /T /F >nul 2>&1

echo.
echo   Done.
echo.
endlocal
