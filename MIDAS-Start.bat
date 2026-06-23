@echo off
cd /d "C:\Users\Softthrone\Claude\Dashboard"
echo.
echo ============================================
echo   MIDAS FULL LAUNCHER (Stable)
echo   Gateway + Dashboard + MRE
echo ============================================
echo.

:: Clean shutdown of old processes
echo Killing old services...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
timeout /t 3 >nul

echo [1] Starting Full MIDAS Gateway Server (8001)...
start "MIDAS Gateway" cmd /k "node MIDAS_Gateway_Server.js"
timeout /t 3 >nul

echo [2] Starting Dashboard Web Server (8000)...
start "MIDAS Dashboard" cmd /k "python -m http.server 8000"
timeout /t 3 >nul

echo [3] Starting MRE WebSocket Server (8002)...
start "MRE Server" cmd /k "python MRE_Server.py"
timeout /t 4 >nul

echo [4] Opening MIDAS Dashboard...
start http://localhost:8000/index_ws.html

echo.
echo ============================================
echo   CORE SERVICES LAUNCHED
echo   Dashboard - http://localhost:8000/index_ws.html
echo   Gateway   - http://localhost:8001  (incl. /api/vision)
echo   MRE       - ws://127.0.0.1:8002/ws/stream
echo ============================================
echo   Watch the MRE window for "Uvicorn running".
echo   (TradingView CDP bridge: launch separately for now.)
echo ============================================
echo.
timeout /t 5 >nul
