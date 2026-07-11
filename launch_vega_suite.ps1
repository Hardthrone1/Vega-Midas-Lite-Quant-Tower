# launch_vega_suite.ps1 - Ultra-fast parallel launcher
# Usage: powershell -ExecutionPolicy Bypass -File launch_vega_suite.ps1 [dev|prod]

param([string]$Mode = "dev")

Push-Location $PSScriptRoot

# Suppress progress bars (they're slow in subprocess calls)
$ProgressPreference = 'SilentlyContinue'

# Ports the suite owns: 5173 frontend (Vite), 8001 gateway, 8002 MRE server.
$VegaPorts = 5173, 8001, 8002

# Free a set of TCP ports by killing whatever is listening on them. This is the
# key to a clean start: if a stale Vite server is still holding 5173, Vite would
# silently bump to 5174/5175 -- and the gateway CORS origin would no longer match,
# so the health check fails and the Gateway shows offline. Reclaiming 5173 first
# keeps the frontend origin stable and in sync with the backend.
function Clear-VegaPorts {
  param([int[]]$Ports)
  foreach ($port in $Ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
      $conns | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        if ($_ -and $_ -ne 0) {
          Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
          Write-Host "    [$port] freed (stopped PID $_)" -ForegroundColor DarkYellow
        }
      }
    } else {
      Write-Host "    [$port] clear" -ForegroundColor DarkGray
    }
  }
}

Write-Host "[VEGA Tower] Pre-flight: freeing suite ports (5173, 8001, 8002)..." -ForegroundColor Cyan
Clear-VegaPorts -Ports $VegaPorts

# Regenerate the runtime artifacts the Codegen (03) and Hermes (09) blades read.
# gen_runtime_artifacts.py emits codegen_output.json + hermes_state.json from the
# live codegen/ and hermes/ modules, so those panels reflect the CURRENT spec and
# GEPA state instead of a stale snapshot. Best-effort: if Python isn't on PATH or
# the script errors, we warn and continue -- the committed artifacts (synced into
# public/data by npm's predev/prebuild hook) remain a working fallback.
Write-Host "[VEGA Tower] Pre-flight: regenerating runtime artifacts (codegen + hermes)..." -ForegroundColor Cyan
try {
  python gen_runtime_artifacts.py
  if ($LASTEXITCODE -eq 0) {
    Write-Host "    codegen_output.json + hermes_state.json refreshed" -ForegroundColor DarkGreen
  } else {
    Write-Host "    gen_runtime_artifacts.py exited $LASTEXITCODE -- using committed artifacts" -ForegroundColor DarkYellow
  }
} catch {
  Write-Host "    skipped ($_) -- using committed artifacts" -ForegroundColor DarkYellow
}

Write-Host "[VEGA Tower] Launching services in parallel..." -ForegroundColor Cyan

# Start all backend services as background jobs (truly parallel, no wait)
$jobs = @()

try {
  # Node.js services
  Write-Host "[VEGA Tower] Starting Gateway..." -ForegroundColor Green
  $jobs += Start-Job -ScriptBlock { cd $using:PSScriptRoot; node Vega_Gateway_Server.js } -Name "Vega-Gateway" -ErrorAction Stop

  # NOTE: Vega_Orchestrator was removed from the launch set -- it's a class
  # library with no Node entry point (see archive/Vega_Orchestrator.legacy.js),
  # so running it as a service did nothing. Re-add a job here only if it's
  # revived as a real standalone service.

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
      Write-Host "[VEGA Tower] Starting dev server on port 5173..." -ForegroundColor Yellow
      # --strictPort makes Vite fail loudly if 5173 is taken instead of silently
      # drifting to another port (which would break the gateway CORS origin).
      npm run dev -- --open --strictPort
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

  # Belt-and-suspenders: make sure the backend ports are actually released.
  Clear-VegaPorts -Ports $VegaPorts

  Write-Host "[VEGA Tower] All services stopped." -ForegroundColor Cyan
}
catch {
  Write-Host "[VEGA Tower] STARTUP FAILED: $_" -ForegroundColor Red
  Write-Host "[VEGA Tower] Stopping background jobs..." -ForegroundColor Yellow
  $jobs | Stop-Job -ErrorAction SilentlyContinue | Remove-Job -ErrorAction SilentlyContinue
  Clear-VegaPorts -Ports $VegaPorts
  Read-Host "Press Enter to exit"
  exit 1
}
finally {
  Pop-Location
}
