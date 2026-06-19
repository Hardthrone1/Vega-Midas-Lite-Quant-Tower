@echo off
setlocal EnableDelayedExpansion
title MIDAS Stopper
color 0C

:: ════════════════════════════════════════════════════════════════════
::  MIDAS-Stop.bat  ·  Scoped teardown
::
::  Kills ONLY the MIDAS-owned windows by title:
::     MIDAS-Bridge, MIDAS-MRE, MIDAS-Gateway
::  plus the CDP Chrome App-Frame (by its remote-debugging flag).
::
::  Does NOT run `taskkill /f /im node.exe`.
::  Your other Node / Python / Chrome processes are left untouched.
:: ════════════════════════════════════════════════════════════════════

set "CDP_PORT=9222"

echo ========================================================
echo            MIDAS SCOPED SHUTDOWN
echo ========================================================
echo.

:: ── Kill named server windows ────────────────────────────────────────
:: The named cmd windows spawned by MIDAS-Start. Killing the window tree
:: (/T) takes down the node/python child it launched.
echo [1/4] Stopping MIDAS-Gateway...
taskkill /fi "WINDOWTITLE eq MIDAS-Gateway*" /t /f >nul 2>&1 && echo   [OK] Gateway stopped. || echo   [--] Gateway window not found.

echo [2/4] Stopping MIDAS-MRE...
taskkill /fi "WINDOWTITLE eq MIDAS-MRE*" /t /f >nul 2>&1 && echo   [OK] MRE stopped. || echo   [--] MRE window not found.

echo [3/4] Stopping MIDAS-Bridge...
taskkill /fi "WINDOWTITLE eq MIDAS-Bridge*" /t /f >nul 2>&1 && echo   [OK] Bridge stopped. || echo   [--] Bridge window not found.

:: ── Kill the CDP Chrome App-Frame only ───────────────────────────────
:: Targets ONLY the chrome.exe started with our remote-debugging port,
:: by matching the command line. Other Chrome windows are untouched.
echo [4/4] Closing TradingView CDP App-Frame ^(port %CDP_PORT%^)...
set "CHROME_KILLED=0"
for /f "tokens=*" %%P in ('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*--remote-debugging-port=%CDP_PORT%*' } | Select-Object -ExpandProperty ProcessId" 2^>nul') do (
  taskkill /pid %%P /t /f >nul 2>&1 && set "CHROME_KILLED=1"
)
if "!CHROME_KILLED!"=="1" ( echo   [OK] CDP Chrome closed. ) else ( echo   [--] No CDP Chrome found on port %CDP_PORT%. )

echo.
echo ========================================================
echo            MIDAS STACK STOPPED
echo ========================================================
echo   Other Node / Python / Chrome processes were NOT touched.
echo.

:: ── Verify ports are released ────────────────────────────────────────
echo Verifying ports released...
call :PortFree 8001 "Gateway"
call :PortFree 8002 "MRE"
call :PortFree %CDP_PORT% "CDP"
echo.
timeout /t 3 /nobreak >nul
exit /b 0

:PortFree
set "STILL=0"
for /f "tokens=*" %%A in ('netstat -ano ^| findstr ":%~1 " ^| findstr "LISTENING" 2^>nul') do set "STILL=1"
if "!STILL!"=="0" ( echo   [OK] Port %~1 ^(%~2^) free. ) else ( echo   [!]  Port %~1 ^(%~2^) STILL in use — a process may have detached. )
exit /b
