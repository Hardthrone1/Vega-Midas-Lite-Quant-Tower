@echo off
title MIDAS Full Shutdown
echo.
echo ============================================
echo MIDAS Full Shutdown Sequence Activating...
echo ============================================
echo.

:: Fires your custom PowerShell termination backend script
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0midas-kill.ps1"

echo.
echo ✅ All trading operations killed cleanly.
timeout /t 4 >nul
exit
