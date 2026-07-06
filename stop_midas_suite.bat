@echo off
setlocal

:: Re-launch hidden when double-clicked (no visible CMD window)
if /I not "%~1"=="hidden" (
  start "" wscript.exe //nologo "%~dp0stop_Vega_suite.vbs"
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Vega-kill.ps1"
exit /b 0
