@echo off
echo.
echo ============================================
echo   MIDAS Full Shutdown
echo ============================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0midas-kill.ps1"
echo.
timeout /t 4 >nul
