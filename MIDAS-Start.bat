@echo off
setlocal EnableDelayedExpansion
title MIDAS Launcher
color 0B

:: ════════════════════════════════════════════════════════════════════
::  MIDAS-Start.bat  ·  Unified stack launcher (ordered + health-checked)
::
::  Boot order:  TradingView+CDP -> Bridge -> MRE(8002) -> Gateway(8001) -> Browser
::  Each server runs in its OWN named window so MIDAS-Stop.bat can target
::  only these — never a blanket taskkill.
::
::  NOTE: This does NOT kill all node.exe. It only starts what is missing.
:: ════════════════════════════════════════════════════════════════════

:: ── PATHS (edit here if anything moves) ──────────────────────────────
set "BRIDGE_DIR=C:\Users\Softthrone\3D Objects\TradingTools\tradingview-mcp-jackson"
set "DASH_DIR=C:\Users\Softthrone\Claude\Dashboard"
set "PYTHON=C:\Users\Softthrone\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe"
set "CHROME_PROFILE=C:\Users\Softthrone\TradingView_AI_Profile"
set "DASHBOARD_HTML=%DASH_DIR%\index_ws.html"
set "CDP_PORT=9222"
set "MRE_PORT=8002"
set "GW_PORT=8001"

echo ========================================================
echo            MIDAS UNIFIED STACK LAUNCHER
echo ========================================================
echo.

:: ── PRE-FLIGHT: verify critical files exist ──────────────────────────
echo [0/5] Pre-flight checks...
set "PREFLIGHT_OK=1"
if not exist "%BRIDGE_DIR%\src\server.js" ( echo   [X] Bridge not found: %BRIDGE_DIR%\src\server.js & set "PREFLIGHT_OK=0" )
if not exist "%DASH_DIR%\MIDAS_Gateway_Server.js" ( echo   [X] Gateway not found in %DASH_DIR% & set "PREFLIGHT_OK=0" )
if not exist "%DASH_DIR%\MRE_Server.py" ( echo   [X] MRE_Server.py not found in %DASH_DIR% & set "PREFLIGHT_OK=0" )
if not exist "%PYTHON%" ( echo   [X] Python not found: %PYTHON% & set "PREFLIGHT_OK=0" )
if not exist "%DASHBOARD_HTML%" ( echo   [X] Dashboard HTML not found: %DASHBOARD_HTML% & set "PREFLIGHT_OK=0" )
if "!PREFLIGHT_OK!"=="0" (
  echo.
  echo   Pre-flight FAILED. Fix the paths above and re-run.
  echo.
  pause
  exit /b 1
)
echo   [OK] All critical files present.
echo.

:: ── 1. TradingView + CDP ─────────────────────────────────────────────
echo [1/5] TradingView App-Frame ^(CDP port %CDP_PORT%^)...
call :PortInUse %CDP_PORT%
if "!PORT_BUSY!"=="1" (
  echo   [SKIP] Something already listening on %CDP_PORT% ^(TradingView likely already up^).
) else (
  start "" chrome.exe --app="https://www.tradingview.com/chart" --remote-debugging-port=%CDP_PORT% --user-data-dir="%CHROME_PROFILE%"
  echo   [START] Chrome App-Frame launching...
)
timeout /t 4 /nobreak >nul

:: ── 2. TradingView MCP bridge daemon ─────────────────────────────────
echo [2/5] TradingView MCP bridge...
start "MIDAS-Bridge" /d "%BRIDGE_DIR%" cmd /c "node src\server.js & echo. & echo [Bridge exited] & pause"
echo   [START] Bridge daemon (window: MIDAS-Bridge)
timeout /t 2 /nobreak >nul

:: ── 3. MRE replay server (Python, port %MRE_PORT%) ───────────────────
echo [3/5] MRE replay server ^(port %MRE_PORT%^)...
start "MIDAS-MRE" /d "%DASH_DIR%" cmd /c "\"%PYTHON%\" MRE_Server.py & echo. & echo [MRE exited] & pause"
echo   [START] MRE server (window: MIDAS-MRE)
timeout /t 3 /nobreak >nul

:: ── 4. Gateway (Node, port %GW_PORT%) ────────────────────────────────
echo [4/5] MIDAS Gateway ^(port %GW_PORT%^)...
start "MIDAS-Gateway" /d "%DASH_DIR%" cmd /c "node MIDAS_Gateway_Server.js & echo. & echo [Gateway exited] & pause"
echo   [START] Gateway (window: MIDAS-Gateway)
timeout /t 3 /nobreak >nul

:: ── 5. Health checks ─────────────────────────────────────────────────
echo.
echo [5/5] Health checks...
set "HEALTH_OK=1"

call :CheckPort %CDP_PORT% "TradingView CDP"
if "!CHECK_RESULT!"=="0" set "HEALTH_OK=0"

call :CheckPort %MRE_PORT% "MRE replay server"
if "!CHECK_RESULT!"=="0" set "HEALTH_OK=0"

call :CheckHttp http://127.0.0.1:%GW_PORT%/api/health "Gateway"
if "!CHECK_RESULT!"=="0" set "HEALTH_OK=0"

echo.
if "!HEALTH_OK!"=="1" (
  color 0A
  echo ========================================================
  echo            ALL SERVICES HEALTHY
  echo ========================================================
  echo   Opening dashboard...
  start "" "%DASHBOARD_HTML%"
) else (
  color 0E
  echo ========================================================
  echo      SOME SERVICES FAILED ^(see [X] above^)
  echo ========================================================
  echo   Dashboard NOT opened automatically.
  echo   Check the named windows (MIDAS-Bridge / MIDAS-MRE / MIDAS-Gateway)
  echo   for error output, then re-run, or open the dashboard manually:
  echo   %DASHBOARD_HTML%
)
echo.
echo   To stop everything: run MIDAS-Stop.bat
echo.
pause
exit /b 0

:: ════════════════════════════════════════════════════════════════════
::  HELPERS
:: ════════════════════════════════════════════════════════════════════

:: Sets PORT_BUSY=1 if a port is already LISTENING
:PortInUse
set "PORT_BUSY=0"
for /f "tokens=*" %%A in ('netstat -ano ^| findstr ":%~1 " ^| findstr "LISTENING" 2^>nul') do set "PORT_BUSY=1"
exit /b

:: Health check a TCP port. Sets CHECK_RESULT=1 ok / 0 fail
:CheckPort
set "CHECK_RESULT=0"
for /f "tokens=*" %%A in ('netstat -ano ^| findstr ":%~1 " ^| findstr "LISTENING" 2^>nul') do set "CHECK_RESULT=1"
if "!CHECK_RESULT!"=="1" ( echo   [OK] %~2 listening on %~1 ) else ( echo   [X]  %~2 NOT listening on %~1 )
exit /b

:: Health check an HTTP endpoint via PowerShell. Sets CHECK_RESULT=1 ok / 0 fail
:CheckHttp
set "CHECK_RESULT=0"
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%~1' -TimeoutSec 4 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 ( set "CHECK_RESULT=1" & echo   [OK] %~2 responding at %~1 ) else ( echo   [X]  %~2 NOT responding at %~1 )
exit /b
