@echo off
title MIDAS ENGINE COMPREHENSIVE LAUNCHER
cd /d "C:\Users\Softthrone\Claude\Dashboard"

echo.
echo ============================================
echo MIDAS FULL LAUNCHER (React Optimized)
echo Gateway + React Dashboard + MRE
echo ============================================
echo.

:: Clean shutdown of old background tasks before booting
echo 🧹 Clearing old dangling services...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
timeout /t 3 >nul

echo [1] Starting Full MIDAS Gateway Server (8001)...
start "MIDAS Gateway" cmd /k "node MIDAS_Gateway_Server.js"
timeout /t 3 >nul

echo [2] Starting MRE WebSocket Server (8002)...
start "MRE Server" cmd /k "python MRE_Server.py"
timeout /t 3 >nul

echo [3] Initializing Optimized React Dashboard...
cd /d "C:\Users\Softthrone\3D Objects\TradingTools\TradingView-Suite\dashboard"
start /b cmd /c "npm run dev -- --open"

echo.
echo ============================================
echo CORE SERVICES LAUNCHED SUCCESSFULLY
echo React Dashboard - Opening in your default browser...
echo Gateway - http://localhost:8001
echo MRE     - ws://127.0.0.1:8002/ws/stream
echo ============================================
echo.
echo ⏳ Launcher window will close in 5 seconds...
echo ============================================
echo.

timeout /t 5 >nul
exit
