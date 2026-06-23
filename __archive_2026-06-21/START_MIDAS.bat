@echo off
REM ════════ MIDAS Dashboard Launcher ════════
REM Starts both dashboard and CORS proxy

echo.
echo  ╔═══════════════════════════════════════╗
echo  ║  🧠 MIDAS DASHBOARD LAUNCHER          ║
echo  ║  Quant Command Center                 ║
echo  ╚═══════════════════════════════════════╝
echo.

REM Get script directory
cd /d "%~dp0"

REM Check if Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
    echo ❌ ERROR: Node.js not found
    echo.
    echo Install from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo ✓ Node.js found:
node --version
echo.

REM Check if Python is installed
where python >nul 2>nul
if errorlevel 1 (
    echo ⚠️  WARNING: Python not found - dashboard server may not start
    echo.
)

echo Starting services...
echo.

REM Start CORS Proxy in new window
echo [1] Starting MIDAS CORS Proxy on port 8001...
start "MIDAS CORS Proxy" cmd /k "node midas-proxy.js"

REM Wait for proxy to initialize
timeout /t 2 /nobreak

REM Start Dashboard in new window
echo [2] Starting Dashboard Server on port 8000...
start "MIDAS Dashboard" cmd /k "python -m http.server 8000"

REM Wait a moment for dashboard to start
timeout /t 2 /nobreak

REM Display info
echo.
echo ═══════════════════════════════════════════
echo  ✅ SERVICES STARTED
echo ═══════════════════════════════════════════
echo.
echo 🌐 Dashboard:  http://localhost:8000
echo 🔌 Proxy:      http://localhost:8001
echo.
echo 📝 NEXT STEPS:
echo   1. Open browser to http://localhost:8000
echo   2. Go to "Trading" page
echo   3. Click "🧠 ANALYZE SETUP" button
echo   4. Watch console (F12) for execution
echo   5. HUD panel will slide in with results
echo.
echo ⚠️  IMPORTANT: Do NOT close these console windows!
echo   Close this window to stop all services.
echo.
echo ═══════════════════════════════════════════
echo.

pause
