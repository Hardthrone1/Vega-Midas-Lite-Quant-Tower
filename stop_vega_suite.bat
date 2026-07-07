@echo off
setlocal

if /I not "%~1"=="hidden" (
  start "" wscript.exe //nologo "%~dp0stop_vega_suite.vbs"
  exit /b 0
)

echo [Vega Tower] Stopping services...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Vega-kill.ps1"
echo [Vega Tower] Services stopped.
exit /b 0
