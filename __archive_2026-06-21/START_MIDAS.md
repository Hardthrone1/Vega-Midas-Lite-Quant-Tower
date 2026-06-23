# 🚀 Starting MIDAS Dashboard with CORS Proxy

## Problem Solved ✅
Browser security (CORS) blocks direct calls from `http://localhost:8000` to `https://openrouter.io`. 

**Solution:** Local proxy server on port 8001 forwards requests and adds API key.

---

## Setup (One-Time)

### 1. Check Node.js is Installed
```powershell
node --version
npm --version
```

If not installed, download from https://nodejs.org

### 2. Set Environment Variable (Optional)
The proxy reads API key from environment or hardcoded. To use env var:

```powershell
# Add to your system environment variables
$env:OPENROUTER_API_KEY = "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"
```

---

## Starting Services

### Option A: Two Terminal Windows (Recommended)

**Terminal 1 - Dashboard Server:**
```powershell
cd C:\Users\Softthrone\Claude\Dashboard
python -m http.server 8000
# or if you have another server:
# node server.js
# npm start
```

**Terminal 2 - CORS Proxy:**
```powershell
cd C:\Users\Softthrone\Claude\Dashboard
node midas-proxy.js
```

**Output should show:**
```
[PROXY] MIDAS CORS Proxy Server
[PROXY] Listening on http://localhost:8001
[PROXY] Forwarding to: https://openrouter.io/api/v1
```

---

### Option B: Single Terminal with Background Process

**PowerShell:**
```powershell
# Start proxy in background
Start-Job -FilePath {
  cd C:\Users\Softthrone\Claude\Dashboard
  node midas-proxy.js
}

# Start dashboard
cd C:\Users\Softthrone\Claude\Dashboard
python -m http.server 8000
```

---

### Option C: Both in One Script

Create `start-midas.bat`:
```batch
@echo off
cd C:\Users\Softthrone\Claude\Dashboard

REM Start proxy in new window
start "MIDAS Proxy" cmd /k "node midas-proxy.js"

REM Wait for proxy to start
timeout /t 2

REM Start dashboard in new window
start "MIDAS Dashboard" cmd /k "python -m http.server 8000"

echo.
echo MIDAS is starting...
echo Dashboard: http://localhost:8000
echo Proxy: http://localhost:8001
echo.
pause
```

---

## Testing

### 1. Verify Both Services Running

**Check Proxy:**
```powershell
curl http://localhost:8001/api/v1/models -H "Content-Type: application/json" | head
```

**Check Dashboard:**
```powershell
curl http://localhost:8000
```

### 2. Test MIDAS Analysis

1. Open: http://localhost:8000
2. Go to: **Trading** page
3. Click: **"🧠 ANALYZE SETUP"**
4. Watch console (F12 → Console tab)

**Should see (no CORS errors):**
```
[MIDAS] Analyzing trading setup...
[MEMORY] Injecting prior learning...
[VAULT] Querying Obsidian for context...
[SWARM] Executing parallel agents...
[MODEL] ✓ Primary model for qwen: qwen/qwen3.6-flash
[MODEL] ✓ Primary model for nemotron: nvidia/nemotron-3-super-120b-a12b:free
[GEMINI] Synthesizing swarm results...
[CLAUDE] Generating Pine Script code...
[REFLEXION] Running post-mortem learning...
[VAULT] Saving analysis to Obsidian...
[MCP] Writing corrected code to workspace...
```

**HUD panel should slide in from right with results!**

---

## Architecture

```
Browser (http://localhost:8000)
    ↓ [MIDAS Analysis Click]
    ↓
JavaScript (window.midas.executeAnalysis)
    ↓ [API Call]
    ↓
Local Proxy (http://localhost:8001)
    ↓ [Add Authorization Header]
    ↓
OpenRouter API (https://openrouter.io/api/v1)
    ↓ [Response]
    ↓
Local Proxy (CORS-enabled response)
    ↓ [Response]
    ↓
Browser HUD Panel [Display Results]
```

---

## Troubleshooting

### "Cannot find node.js"
```powershell
# Check if installed
where node

# If not found, install from: https://nodejs.org
```

### "Port 8001 already in use"
```powershell
# Find what's using port 8001
netstat -ano | findstr :8001

# Kill the process (replace PID with the number)
taskkill /PID <PID> /F

# Restart proxy
node midas-proxy.js
```

### "Cannot GET /api/v1/models"
Make sure:
1. Proxy is running on port 8001
2. OpenRouter API key is valid
3. Network connection is active

### "401 Unauthorized"
Check API key in `midas-proxy.js` line 7:
```javascript
const API_KEY = process.env.OPENROUTER_API_KEY || 'sk-or-v1-...';
```

---

## Stopping Services

**Terminal Window:**
- Press `Ctrl+C` to stop dashboard
- In second terminal, also `Ctrl+C` to stop proxy

**PowerShell Background Job:**
```powershell
Stop-Job -Name "MIDAS Proxy"
Remove-Job -Name "MIDAS Proxy"
```

---

## Files

| File | Purpose |
|------|---------|
| `midas-proxy.js` | CORS proxy server (run on port 8001) |
| `index.html` | Dashboard with MIDAS integration |
| `MIDAS_Orchestrator.js` | 9-step orchestrator (updated to use proxy) |
| `START_MIDAS.md` | This file |

---

## Status ✅

- ✅ CORS Proxy created
- ✅ Orchestrator updated to use proxy
- ✅ Dashboard ready
- ✅ Ready for production testing

**Next Step:** Run the servers and test an analysis! 🚀
