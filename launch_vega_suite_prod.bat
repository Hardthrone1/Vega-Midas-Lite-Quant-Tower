@echo off
setlocal
cd /d "%~dp0"

if /I not "%~1"=="hidden" (
  start "" wscript.exe //nologo "%~dp0launch_vega_suite_prod.vbs"
  exit /b 0
)

echo [Vega Tower] Starting services (production mode)...
timeout /t 2 >nul

powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath 'node' -ArgumentList 'Vega_Gateway_Server.js' -WorkingDirectory '%CD%' -WindowStyle Hidden"
timeout /t 2 >nul

powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath 'python' -ArgumentList 'MRE_Server.py' -WorkingDirectory '%CD%' -WindowStyle Hidden"
timeout /t 2 >nul

powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npm run build && npm run preview -- --open' -WorkingDirectory '%CD%\midas_code' -WindowStyle Hidden"

echo [Vega Tower] Services started. Open http://localhost:5173
exit /b 0
