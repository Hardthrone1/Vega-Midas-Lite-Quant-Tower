# launch_vega_suite.ps1 - Ultra-fast parallel launcher
# Usage: powershell -ExecutionPolicy Bypass -File launch_vega_suite.ps1 [dev|prod]

param([string]$Mode = "dev")

Push-Location $PSScriptRoot

# Suppress progress bars (they're slow in subprocess calls)
$ProgressPreference = 'SilentlyContinue'

Write-Host "[VEGA Tower] Launching services in parallel..." -ForegroundColor Cyan

# Start all backend services as background jobs (truly parallel, no wait)
$jobs = @()

# Node.js services
$jobs += Start-Job -ScriptBlock { node Vega_Gateway_Server.js } -Name "Vega-Gateway"
$jobs += Start-Job -ScriptBlock { node Vega_Orchestrator.js } -Name "Vega-Orchestrator"

# Python MRE server
$jobs += Start-Job -ScriptBlock { python MRE_Server.py } -Name "MRE-Server"

Write-Host "[VEGA Tower] Backend services started (PID: $($jobs.Id -join ', '))" -ForegroundColor Green

# Frontend (blocks until complete or user stops)
Push-Location midas_code
try {
  if ($Mode -eq "prod") {
    Write-Host "[VEGA Tower] Building for production..." -ForegroundColor Yellow
    npm run build --quiet
    npm run preview -- --open
  } else {
    Write-Host "[VEGA Tower] Starting dev server..." -ForegroundColor Yellow
    npm run dev -- --open
  }
}
finally {
  Pop-Location
}

Write-Host "[VEGA Tower] Frontend stopped. Cleaning up..." -ForegroundColor Yellow
$jobs | Stop-Job -PassThru | Remove-Job

Write-Host "[VEGA Tower] All services stopped." -ForegroundColor Cyan
Pop-Location
