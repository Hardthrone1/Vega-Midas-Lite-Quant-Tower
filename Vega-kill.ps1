# midas-kill.ps1 — stop MIDAS services (hidden launcher; no CMD windows required)
$ErrorActionPreference = 'SilentlyContinue'

$patterns = @(
    'MIDAS_Gateway_Server.js',
    'midas-proxy.js',
    'http.server 8000',
    'MRE_Server.py',
    'vite',
    'midas_code'
)

Write-Host "[1] Stopping MIDAS processes..."
$killed = 0
foreach ($procName in @('node.exe', 'python.exe', 'cmd.exe')) {
    Get-CimInstance Win32_Process -Filter "Name='$procName'" | ForEach-Object {
        $cl = $_.CommandLine
        if (-not $cl) { return }
        foreach ($p in $patterns) {
            if ($cl -like "*$p*") {
                Stop-Process -Id $_.ProcessId -Force
                Write-Host "    - stopped $procName : $p"
                $killed++
                break
            }
        }
    }
}
if ($killed -eq 0) { Write-Host "    - no MIDAS processes matched by command line" }

Write-Host ""
Write-Host "[2] Port sweep (5173 . 8000 . 8001 . 8002 . 9222)..."
foreach ($port in 5173, 8000, 8001, 8002, 9222) {
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
Write-Host "  MIDAS stopped. Services down, ports clear."
Write-Host "============================================"