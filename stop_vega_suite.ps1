# stop_vega_suite.ps1 - Stop all VEGA services
# Usage: powershell -ExecutionPolicy Bypass -File stop_vega_suite.ps1

$ErrorActionPreference = 'SilentlyContinue'

Write-Host "[VEGA Tower] Stopping all services..." -ForegroundColor Yellow

# Ports the suite owns: 5173 frontend (Vite), 8001 gateway, 8002 MRE server.
$VegaPorts = 5173, 8001, 8002

# Command-line fingerprints of suite processes. We match on these instead of
# blindly killing every node/python process -- that would take down VS Code's
# node, other dev servers, and any unrelated Python you have running.
$Patterns = @(
  'Vega_Gateway_Server.js',
  'MRE_Server.py',
  'vite',
  'midas_code'
)

# --- 1. Stop suite processes matched by command line -----------------------
Write-Host "[VEGA Tower] Stopping suite processes (node / python)..." -ForegroundColor Yellow
$killed = 0
foreach ($procName in @('node.exe', 'python.exe')) {
  Get-CimInstance Win32_Process -Filter "Name='$procName'" | ForEach-Object {
    $cl = $_.CommandLine
    if (-not $cl) { return }
    foreach ($p in $Patterns) {
      if ($cl -like "*$p*") {
        Stop-Process -Id $_.ProcessId -Force
        Write-Host "    - stopped $procName : $p" -ForegroundColor Green
        $killed++
        break
      }
    }
  }
}
if ($killed -eq 0) { Write-Host "    - no suite processes matched by command line" -ForegroundColor DarkGray }

# --- 2. Port sweep: kill whatever still holds the suite ports ---------------
Write-Host "[VEGA Tower] Port sweep (5173, 8001, 8002)..." -ForegroundColor Yellow
foreach ($port in $VegaPorts) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($conns) {
    $conns | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
      if ($_ -and $_ -ne 0) {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        Write-Host "    [$port] stopped PID $_" -ForegroundColor Green
      }
    }
  } else {
    Write-Host "    [$port] clear" -ForegroundColor DarkGray
  }
}

Write-Host "[VEGA Tower] All services stopped. Ports clear." -ForegroundColor Cyan
