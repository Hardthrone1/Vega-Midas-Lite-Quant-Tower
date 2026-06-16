# 🔍 MIDAS Debugging Guide

If analysis starts but shows no output, use this guide to diagnose the issue.

---

## Step 1: Verify Services Are Running

### Check Proxy
```powershell
# Should show: CORS Proxy running on localhost:8001
curl http://localhost:8001/api/v1/models -Head

# Or open in browser:
# http://localhost:8001/api/v1/models
```

**If this fails:**
- Proxy is not running
- Run: `node midas-proxy.js`
- Check that port 8001 is not in use

### Check Dashboard
```powershell
curl http://localhost:8000 -Head
# Should return 200 OK
```

---

## Step 2: Test Proxy with Test Page

1. **Open:** http://localhost:8000/test-proxy.html
2. **Click:** "🔄 Check Proxy" button
3. **Should see:** "✓ PROXY OK" (green)

If you see red error:
- Proxy server crashed or not running
- Check proxy terminal for error messages
- Restart: `node midas-proxy.js`

---

## Step 3: Check Browser Console

**Open:** http://localhost:8000 → F12 → Console tab

### You should see:
```
[MIDAS Integration] Setting up HUD hook...
[MIDAS Integration] ✓ window.midas found, patching executeAnalysis
[MIDAS Integration] ✓ HUD hook setup complete
```

### If you see errors:
```
✗ window.midas not found
  → MIDAS_Orchestrator.js didn't load
  → Check <script src="./MIDAS_Orchestrator.js"></script> in index.html

✗ Access to fetch... CORS policy
  → Proxy not running or misconfigured
  → Start: node midas-proxy.js

✗ Failed to fetch
  → Network issue or proxy unreachable
  → Check both services are running
```

---

## Step 4: Run a Test Analysis

1. **Go to:** Trading page
2. **Click:** "🧠 ANALYZE SETUP"
3. **Open console:** F12 → Console
4. **Watch for:**

```
[MIDAS] Analyzing trading setup...
[MIDAS Integration] Task started: strategy-analysis
[MEMORY] Injecting prior learning...
[VAULT] Querying Obsidian for context...
[SWARM] Executing parallel agents...
[MODEL] ✓ Primary model for qwen: qwen/qwen3.6-flash
[MODEL] ✓ Primary model for nemotron: nvidia/nemotron-3-super-120b-a12b:free
[SWARM] Completed 2 agents in parallel (Cost: $0)
[GEMINI] Synthesizing swarm results...
[CLAUDE] Generating Pine Script code...
[REFLEXION] Running post-mortem learning...
[VAULT] Saving analysis to Obsidian...
[MCP] Writing corrected code to workspace...
[MIDAS Integration] Task completed: ✓ Success
[MIDAS Integration] Displaying results in HUD...
```

---

## Step 5: HUD Panel Should Appear

**Expected:** Panel slides in from right showing:
- 📊 Synthesis Thesis
- ⚙️ Backtest Parameters
- 💻 Generated Pine Script
- 📝 Execution Metadata

**If HUD doesn't appear:**

1. **Check console for errors** (F12 → Console)
2. **Scroll page right** - HUD might be off-screen
3. **Check if hidden** - Click any "ANALYZE" button again
4. **Verify result exists** - Add to console:
   ```javascript
   console.log(MIDASIntegration.currentResult)
   ```
   Should show the analysis result object

---

## Common Issues & Fixes

### Issue: "No output, nothing happened"

**Diagnosis:**
1. Open F12 → Console
2. Do you see any error messages? → Go to relevant section below
3. See all logs flow correctly? → Issue is HUD display

**Fix if logs look good:**
```javascript
// In console, manually show HUD
document.getElementById('midas-hud').style.display = 'flex';

// Or force re-render
MIDASIntegration.showResults(MIDASIntegration.currentResult);
```

---

### Issue: "CORS error - Response to preflight request"

**Means:** Proxy not running or API key invalid

**Fix:**
```powershell
# Verify proxy is running
Get-Process node

# If not found, start it:
cd C:\Users\Softthrone\Claude\Dashboard
node midas-proxy.js
```

**If proxy is running but still errors:**
1. Stop proxy (Ctrl+C)
2. Check API key in midas-proxy.js line 8
3. Verify it's valid (should start with `sk-or-v1-`)
4. Restart: `node midas-proxy.js`

---

### Issue: "Failed to fetch"

**Could mean:**
1. Proxy server crashed
2. Network issue
3. Port 8001 in use

**Fix:**
```powershell
# Check if port 8001 is in use
netstat -ano | findstr :8001

# If something is using it:
# Kill the process, then restart proxy
taskkill /PID <number> /F
node midas-proxy.js
```

---

### Issue: "window.midas not ready"

**Means:** MIDAS_Orchestrator.js hasn't loaded yet

**Fix:**
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh (Ctrl+Shift+R)
3. Check MIDAS_Orchestrator.js file exists at:
   ```
   C:\Users\Softthrone\Claude\Dashboard\MIDAS_Orchestrator.js
   ```

---

### Issue: "All 4 agents failed" (swarm errors)

**Possible causes:**
1. API key expired or invalid
2. Models don't exist on OpenRouter
3. API rate limit hit

**Check in console:**
```
[API] Qwen2.5 VL 32B error: Failed to fetch
[API] Nemotron 70B error: Failed to fetch
```

**Fix:**
1. Verify API key is valid
2. Check models exist: http://localhost:8000/test-proxy.html
3. Wait 60 seconds (rate limit reset)

---

## Debug Terminal Output

### Proxy Terminal
Should show:
```
[PROXY] MIDAS CORS Proxy Server
[PROXY] Listening on http://localhost:8001
[PROXY] Forwarding to: https://openrouter.io/api/v1
[PROXY] API Key: sk-or-v1-...
```

When you analyze:
```
[PROXY] POST /api/v1/chat/completions
[PROXY] Chat request: model=qwen/qwen3.6-flash
[PROXY] ✓ Chat completed (200)
```

**If you see errors:**
- `EADDRINUSE` → Port 8001 in use
- `Failed to connect` → Network issue
- `401 Unauthorized` → API key invalid

---

## Advanced Debugging

### See Full API Responses
```javascript
// In browser console:
MIDASIntegration.currentResult
// Shows full response object including all agent outputs
```

### Test Models List
```javascript
// In browser console:
fetch('http://localhost:8001/api/v1/models')
  .then(r => r.json())
  .then(d => console.log('Models:', d.data.slice(0, 5)))
```

### Manually Test an Agent
```javascript
// In browser console:
window.midas.callAgent(window.midas.agents.qwen, 'Hello!')
  .then(r => console.log('Response:', r))
```

---

## If All Else Fails

1. **Clear everything:**
   ```powershell
   # Stop all services
   # Delete browser cache
   # Close all terminals
   ```

2. **Fresh restart:**
   ```powershell
   # Terminal 1: Start proxy
   cd C:\Users\Softthrone\Claude\Dashboard
   node midas-proxy.js
   
   # Terminal 2: Start dashboard
   cd C:\Users\Softthrone\Claude\Dashboard
   python -m http.server 8000
   ```

3. **Test again:**
   - Open http://localhost:8000
   - F12 Console open
   - Go to Trading page
   - Click "🧠 ANALYZE SETUP"
   - Watch console for full flow

---

## Getting Help

When asking for help, include:
1. **Console errors** (F12 → Console)
2. **Proxy terminal output**
3. **Network tab** (F12 → Network)
4. **Which step fails** (proxy test? HUD display?)

---

**Status:** You have all the tools to debug. Start with test-proxy.html! 🔧
