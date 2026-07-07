# launch_vega_suite.ps1 - Ultra-fast parallel launcher
# Usage: powershell -ExecutionPolicy Bypass -File launch_vega_suite.ps1 [dev|prod]

param([string]$Mode = "dev")

Push-Location $PSScriptRoot

# Suppress progress bars (they're slow in subprocess calls)
$ProgressPreference = 'SilentlyContinue'

Write-Host "[VEGA Tower] Launching services in parallel..." -ForegroundColor Cyan

# Start all backend services as background jobs (truly parallel, no wait)
$jobs = @()

try {
  # Node.js services
  Write-Host "[VEGA Tower] Starting Gateway..." -ForegroundColor Green
  $jobs += Start-Job -ScriptBlock { cd $using:PSScriptRoot; node Vega_Gateway_Server.js } -Name "Vega-Gateway" -ErrorAction Stop
  
  Write-Host "[VEGA Tower] Starting Orchestrator..." -ForegroundColor Green
  $jobs += Start-Job -ScriptBlock { cd $using:PSScriptRoot; node Vega_Orchestrator.js } -Name "Vega-Orchestrator" -ErrorAction Stop

  # Python MRE server
  Write-Host "[VEGA Tower] Starting MRE Server..." -ForegroundColor Green
  $jobs += Start-Job -ScriptBlock { cd $using:PSScriptRoot; python MRE_Server.py } -Name "MRE-Server" -ErrorAction Stop

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
  catch {
    Write-Host "[VEGA Tower] ERROR: $_" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    throw
  }
  finally {
    Pop-Location
  }

  Write-Host "[VEGA Tower] Frontend stopped. Cleaning up..." -ForegroundColor Yellow
  $jobs | Stop-Job -PassThru | Remove-Job

  Write-Host "[VEGA Tower] All services stopped." -ForegroundColor Cyan
}
catch {
  Write-Host "[VEGA Tower] STARTUP FAILED: $_" -ForegroundColor Red
  Write-Host "[VEGA Tower] Stopping background jobs..." -ForegroundColor Yellow
  $jobs | Stop-Job -ErrorAction SilentlyContinue | Remove-Job -ErrorAction SilentlyContinue
  Read-Host "Press Enter to exit"
  exit 1
}
finally {
  Pop-Location
}

