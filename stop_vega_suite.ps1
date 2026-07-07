# stop_vega_suite.ps1 - Stop all VEGA services
# Usage: powershell -ExecutionPolicy Bypass -File stop_vega_suite.ps1

Write-Host "[VEGA Tower] Stopping all services..." -ForegroundColor Yellow

# Stop any lingering Node.js processes
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "[VEGA Tower] Stopped Node.js services" -ForegroundColor Green

# Stop any lingering Python processes
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "[VEGA Tower] Stopped Python services" -ForegroundColor Green

# Stop any vite dev server processes
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*vite*" } | Stop-Process -Force

# Kill anything on the backend ports
netstat -ano | Select-String "8001|8002|5173" | ForEach-Object {
  if ($_ -match '(\d+)\s+LISTENING') {
    $pid = [int]$matches[1]
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "[VEGA Tower] All services stopped." -ForegroundColor Cyan
