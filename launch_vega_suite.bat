@echo off
setlocal
cd /d "%~dp0"

:: Usage:
::   launch_vega_suite.bat hidden       — dev server (default, hot reload)
::   launch_vega_suite.bat hidden prod  — production build + vite preview (use for Lighthouse / traces)

set "MODE=dev"
if /I "%~2"=="prod" set "MODE=prod"

:: Re-launch hidden when double-clicked (no visible CMD window)
if /I not "%~1"=="hidden" (
  start "" wscript.exe //nologo "%~dp0launch_vega_suite.vbs"
  exit /b 0
)

:: [1] Gateway (8001) — hidden
powershell -NoProfile -WindowStyle Hidden -Command ^
  "Start-Process -FilePath 'node' -ArgumentList 'Vega_Gateway_Server.js' -WorkingDirectory '%CD%' -WindowStyle Hidden"
timeout /t 3 >nul

:: [2] MRE WebSocket (8002) — hidden
powershell -NoProfile -WindowStyle Hidden -Command ^
  "Start-Process -FilePath 'python' -ArgumentList 'MRE_Server.py' -WorkingDirectory '%CD%' -WindowStyle Hidden"
timeout /t 3 >nul

:: [3] React dashboard (5173) — hidden, opens browser
if /I "%MODE%"=="prod" (
  powershell -NoProfile -WindowStyle Hidden -Command ^
    "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npm run build && npm run preview -- --open' -WorkingDirectory '%CD%\midas_code' -WindowStyle Hidden"
) else (
  powershell -NoProfile -WindowStyle Hidden -Command ^
    "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npm run dev -- --open' -WorkingDirectory '%CD%\midas_code' -WindowStyle Hidden"
)

exit /b 0
