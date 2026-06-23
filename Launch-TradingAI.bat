cd C:\Users\Softthrone\Claude\Dashboard
@'
@echo off
REM ============================================
REM  Launch-TradingAI.bat
REM  Starts Chrome with CDP on port 9222 for
REM  TradingView bridge (tradesdontlie CDP).
REM  Uses a dedicated profile so it does NOT
REM  collide with your normal Chrome session.
REM ============================================

set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

if not exist "%CHROME%" (
  echo [ERROR] Chrome not found at either Program Files location.
  echo Edit this file and set CHROME to your chrome.exe path.
  pause
  exit /b 1
)

echo [CDP] Launching Chrome on port 9222...
start "" "%CHROME%" --remote-debugging-port=9222 --user-data-dir="%~dp0.chrome-cdp-profile" "https://www.tradingview.com/chart/"

echo [CDP] Chrome launching. Verify with: http://localhost:9222/json/version
'@ | Set-Content -Path "Launch-TradingAI.bat" -Encoding ASCII
Write-Host "✓ Launch-TradingAI.bat created" -ForegroundColor Green