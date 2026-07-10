# Headroom Integration Verification Report

## Status: ✅ Ready for Live Testing

Headroom v0.31.0 (headroom-ai[mcp]) has been successfully installed and configured. Ready for deployment on user's local Windows machine.

---

## Installation Summary

✅ **Package:** `pip install --break-system-packages "headroom-ai[all]"`
- Installed v0.31.0 with MCP server support + proxy dependencies
- 60–95% compression on JSON data (trades, backtests, metrics)
- Reversible CCR (Compress-Cache-Retrieve): originals stored locally, retrievable on demand

✅ **MCP Registration:** `headroom mcp install`
- Auto-registered with Claude Code
- Tools available: `headroom_compress`, `headroom_retrieve`, `headroom_stats`
- Configured in `.vscode/settings.json`

✅ **Proxy Mode:** `headroom proxy`
- Listens on `http://127.0.0.1:8787`
- Routes: `/v1/messages` (Anthropic), `/v1/chat/completions` (OpenAI), others
- Compression enabled by default (cache + optimization)

---

## How to Verify (On Your Windows Machine)

### Test 1: MCP Tool (On-Demand Compression)

```powershell
# Start Claude Code with Headroom MCP available
claude -p "Compress this backtest JSON: {156 trades, $-652 PnL, 44.2% win rate}"

# Claude Code will show available MCP tools in sidebar
# You can call /headroom-compress "<text>" directly
```

### Test 2: Proxy Mode (Automatic Interception)

```powershell
# Terminal 1: Start Headroom proxy
headroom proxy
# Should show:
#   Starting proxy server...
#   URL: http://127.0.0.1:8787
#   Mode: cache
#   Optimization: ENABLED

# Terminal 2: Route Claude Code through proxy
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:8787"
claude -p "Write a trading strategy comment for a 5m MGC bar" --output-format json --max-turns 1

# All API calls now compressed automatically
```

### Test 3: MIDAS Services with Compression

```powershell
# Use the startup script (requires bash or convert to PowerShell):
./start-midas-with-headroom.sh

# Or manually:
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:8787"
headroom proxy &
node Vega_Gateway_Server.js &
python MRE_Server.py &
hermes "/midas-trading-loop test with MGC 5m bar data"
```

### Test 4: Monitor Compression

```powershell
# While proxy is running, in another terminal:
curl http://127.0.0.1:8787/stats | ConvertFrom-Json | ConvertTo-Json -Depth 10

# Shows:
#   - total_requests
#   - cache_hits
#   - compression_ratio
#   - tokens_saved
#   - cost_savings_usd
```

### Test 5: Retrieve Original (If Needed)

```powershell
# Using Claude Code with MCP:
claude -p "Use the headroom_retrieve tool to get original from cache ID: xyz"
# Or via direct API:
curl http://127.0.0.1:8787/retrieve?id=xyz
```

---

## Expected Compression Results

Based on Headroom's documented performance:

| Data Type | Compression | Example |
|-----------|-------------|---------|
| JSON (trades, metrics) | 60–95% | 30KB backtest → 1–12KB |
| Code + outputs | 15–20% | Agent trace with code → 20% smaller |
| Chat history | 40–70% | Tool outputs, logs → significant savings |
| Repeated patterns | up to 95% | Same timestamps, prices repeated → 95% |

**MIDAS target:** Backtest payloads (30KB+) → 2–12KB compressed.

---

## Metrics to Track

### Before/After Comparison

```
WITHOUT Headroom:
  Backtest payload: 30,535 bytes
  Claude tokens used: ~7,000 (estimated)
  API cost: ~$0.07

WITH Headroom:
  Backtest payload: 1,500–3,000 bytes (95% reduction target)
  Claude tokens used: ~2,100 (70% reduction)
  API cost: ~$0.02
```

### Live Monitoring

1. **MCP Tool Stats:**
   ```powershell
   claude -p "Show headroom_stats output"
   ```

2. **Proxy Metrics:**
   ```
   http://127.0.0.1:8787/stats
   http://127.0.0.1:8787/stats-history
   http://127.0.0.1:8787/metrics (Prometheus format)
   ```

3. **Cache Location:**
   ```
   ~/.headroom/cache/     # Stores compressed data + originals
   ```

---

## Known Limitations

- **Proxy mode only:** ANTHROPIC_BASE_URL must be set (env var, no GUI option)
- **Loopback-only:** Proxy binds to 127.0.0.1, not routable over network
- **License:** OSS mode (free); no license key in use
- **Memory:** Proxy disabled (can enable with flag if needed)
- **Code-Aware:** Not installed (pip install headroom-ai[code] to enable AST-based code compression)

---

## Next Steps

1. **On Windows:** Run Test 1 (MCP tool) to verify on Claude Code
2. **Monitor:** Use proxy /stats endpoint during first parity run
3. **MIDAS Bundle:** Once compression verified, integrate into skill registry (AGT-011)
4. **Hermes Loop:** Compression becomes automatic for all agent outputs

---

## Rollback / Troubleshooting

**Proxy not starting:**
```powershell
# Check dependencies
pip list | grep headroom
pip list | grep fastapi

# Reinstall if needed
pip install --upgrade "headroom-ai[all]"
```

**Compression not showing:**
- Check `$env:ANTHROPIC_BASE_URL` is set
- Verify proxy is listening: `curl http://127.0.0.1:8787/health`
- Monitor: `tail -f ~/.headroom/proxy.log`

**Cache size growing:**
- Clear cache: `rm -r ~/.headroom/cache`
- Or: `headroom memory clear`

---

## Files Updated

- `.vscode/settings.json` — MCP server configuration (Headroom auto-registered)
- `start-midas-with-headroom.sh` — One-command startup with proxy
- `MIDAS_INSTRUCTIONS.md` — Deployment modes + usage docs
- `HEADROOM_VERIFICATION.md` — This file (verification guide)

**Next session:** After you verify compression working on your Windows machine, update this document with actual metrics and we'll wire it into the skill registry.
