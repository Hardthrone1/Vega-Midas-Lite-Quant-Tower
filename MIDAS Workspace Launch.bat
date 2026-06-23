@echo off
REM ================================================
REM MIDAS Workspace Launcher - FIXED & CLEAN
REM ================================================

echo.
echo  ╔═══════════════════════════════════════╗
echo  ║     MIDAS QUANT COMMAND CENTER        ║
echo  ║          Hardened Launcher v2         ║
echo  ╚═══════════════════════════════════════╝
echo.

:: Force correct directory
cd /d "C:\Users\Softthrone\Claude\Dashboard"

echo [OK] Working directory: %CD%

REM Check Node
where node >nul 2>nul
if errorlevel 1 (
    echo ❌ Node.js not found!
    pause
    exit /b 1
)

REM Kill old processes
echo [1/4] Cleaning old processes...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo [2/4] Starting MIDAS CORS Proxy (port 8001)...
start "MIDAS Proxy" cmd /k "node secure_proxy.js"

timeout /t 2 /nobreak >nul

echo [3/4] Starting Dashboard Web Server (port 8000)...
start "MIDAS Dashboard" cmd /k "python -m http.server 8000"

timeout /t 2 /nobreak >nul

echo [4/4] Opening Dashboard...
start http://localhost:8000/index_ws.html

echo.
echo ✅ MIDAS SERVICES LAUNCHED
echo Dashboard → http://localhost:8000/index_ws.html
echo Proxy     → http://localhost:8001
echo.
pause