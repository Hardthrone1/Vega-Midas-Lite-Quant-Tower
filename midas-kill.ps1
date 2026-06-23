# midas-kill.ps1 — closes MIDAS launcher cmd windows by command line, then sweeps ports.
$ErrorActionPreference = 'SilentlyContinue'

Write-Host "[1] Closing MIDAS launcher windows (by command line)..."
$patterns = 'MIDAS_Gateway_Server.js','midas-proxy.js','http.server 8000','MRE_Server.py'
$killed = 0
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | ForEach-Object {
    $cl = $_.CommandLine
    if ($cl) {
        foreach ($p in $patterns) {
            if ($cl -like "*$p*") {
                Stop-Process -Id $_.ProcessId -Force
                Write-Host "    - closed: $p"
                $killed++
                break
            }
        }
    }
}
if ($killed -eq 0) { Write-Host "    - no MIDAS launcher windows found" }

Write-Host ""
Write-Host "[2] Port sweep (8000 . 8001 . 8002 . 9222)..."
foreach ($port in 8000,8001,8002,9222) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        $conns | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
            if ($_ -and $_ -ne 0) {
                Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
                Write-Host "    [$port] stopped PID $_"
            }
        }
    } else {
        Write-Host "    [$port] clear"
    }
}

Write-Host ""
Write-Host "============================================"
Write-Host "  MIDAS stopped. Windows closed, ports clear."
Write-Host "============================================"
