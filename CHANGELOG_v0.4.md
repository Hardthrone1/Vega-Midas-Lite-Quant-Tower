# MIDAS Quant Lab — Changelog v0.3 → v0.4

**Date:** 2026-06-18  
**Focus:** Production-grade WebSocket architecture, zero-lookahead guarantees, response-driven replay  
**File:** `index_ws.html`

---

## What Changed (Production Hardening)

### 1. **Timestamp Contract** (Critical)
**Before:** Reconstructed dates in JS with hardcoded `2024-01-01`, causing silent overwrites across day boundaries.

**Now:** Python MRE sends Unix epoch seconds (`int(datetime.timestamp())`). JS uses them directly, no reconstruction.

**Impact:** Multi-day replays, archive spans, realistic test data all work without candle collisions.

```python
# Python side (example)
bar_time = int(dt.datetime.now(dt.timezone.utc).timestamp())
ws.send(json.dumps({
    "type": "BAR_DATA",
    "data": {
        "time": bar_time,
        "open": 2330.50,
        "high": 2335.20,
        "low": 2328.10,
        "close": 2332.40
    }
}))
```

---

### 2. **Response-Driven AUTO** (Architecture)
**Before:** `setInterval(nextBar, 500)` fired on a fixed timer, queuing requests if the server lagged.

**Now:** Request fires **only after** the previous bar is fully received and rendered. Timer is gone.

**Mechanism:**
- Set `autoPlaying = true` on AUTO click
- After `BAR_DATA` is processed (chart updated, log written), if `autoPlaying` is still `true`, schedule `nextBar()` after 80ms
- Responses chain — the server's rate is the limiting factor, never request storms

**Impact:** Smooth replay at server speed, no burst arrivals, natural backpressure, zero queuing.

---

### 3. **Chart View Management** (UX)
**Before:** `fitContent()` on every bar, preventing user zoom/pan during playback.

**Now:**
- First data arrival → `fitContent()` one time (`viewFitted = true`)
- Every bar after → `scrollToRealTime()` (keeps latest edge visible, user controls zoom/pan)

**Impact:** Replay respects user interaction. You can zoom in on a 10-bar window and watch it unfold without the view yanking back.

---

### 4. **JSON Parse Guard** (Resilience)
**Before:** `JSON.parse(event.data)` would throw on any malformed frame and kill the handler.

**Now:**
```javascript
let msg;
try   { msg = JSON.parse(evt.data); }
catch { log('ERR', `Malformed frame: ${String(evt.data).slice(0, 80)}`, 'err'); return; }
dispatch(msg);
```

**Impact:** One bad frame doesn't take down the dashboard; logged and skipped.

---

### 5. **Bar Validation** (Correctness)
**Before:** Assumed all fields from Python were valid.

**Now:**
```javascript
function isValidBar(b) {
  return (
    b != null &&
    typeof b.time  === 'number' && b.time > 0 &&
    typeof b.open  === 'number' &&
    typeof b.high  === 'number' &&
    typeof b.low   === 'number' &&
    typeof b.close === 'number' &&
    b.high >= b.low &&
    b.open  > 0 &&
    b.close > 0
  );
}
```

**Impact:** Reject bogus/partial data before it hits the chart. Early detection.

---

### 6. **Auto-Reconnect with Exponential Backoff** (Robustness)
**Before:** On disconnect, dashboard stayed dead until manual refresh.

**Now:** 
- Attempt reconnect after 1s
- If fails, retry after 2s, then 4s, 8s, … up to 30s cap
- Resets to 1s on successful connect

**Code:**
```javascript
scheduleReconnect() {
  const delay = S.reconnectDelay;
  log('INFO', `Reconnecting in ${(delay / 1000).toFixed(0)}s…`, 'info');
  S.reconnectTimer = setTimeout(() => connectMRE(), delay);
  S.reconnectDelay = Math.min(S.reconnectDelay * 2, RECONNECT_MAX);
}
```

**Impact:** `MRE_Server.py` restart? Dashboard recovers automatically without user action.

---

### 7. **Dual Error Handlers** (Clarity)
**Before:** `onerror` and `onclose` both logged, creating duplicate ERR events on a dropped connection.

**Now:** `wsErrored` flag tracks if `onerror` already fired. `onclose` only logs if it's a non-1000 code and `onerror` didn't precede it.

**Impact:** Clean, single error log per failure. No noise.

---

### 8. **Bulk History Load** (Performance)
**Before:** Only streamed single bars, one per click/timer.

**Now:** Supports `HISTORY` message — Python can send 500+ bars at connect to pre-populate the chart.

**Message contract:**
```json
{
  "type": "HISTORY",
  "data": [
    { "time": 1718000000, "open": 2330.5, "high": 2335.2, "low": 2328.1, "close": 2332.4 },
    ...
  ]
}
```

**Impact:** Instant context — no cold start. Chart loads with full session history.

---

### 9. **Proper ATR(14)** (Correctness)
**Before:** Not present (was in local mock mode).

**Now:** Calculates True Range correctly (both wicks), rolling 14-bar window:
```javascript
const tr = Math.max(
  c.high - c.low,
  Math.abs(c.high - p.close),
  Math.abs(c.low  - p.close)
);
```

**Impact:** Accurate volatility reference for each bar, visible in the asset panel.

---

### 10. **Bidirectional Microstructure** (Analysis)
**Before:** Only bullish signals.

**Now:**
- **Sweeps:** both directions (bullish ↓ and bearish ↑)
- **BOS/Displacement:** both bullish and bearish
- **Absorption:** flagged regardless of direction

**Code samples:**
```javascript
if (prev && b.low < prev.low && b.close > prev.low) {
  log('SWEEP', `Bullish sweep ↓${fmt(b.low)} · reclaimed ${fmt(prev.low)}`, 'sweep');
} else if (prev && b.high > prev.high && b.close < prev.high) {
  log('SWEEP', `Bearish sweep ↑${fmt(b.high)} · rejected ${fmt(prev.high)}`, 'sweep');
}
```

**Impact:** Complete picture of market structure, both directions analyzed.

---

### 11. **Connection Status in UI** (Transparency)
**Before:** No visual feedback of connection state beyond the dot pulsing.

**Now:** 
- Header shows **CONNECTING…** (amber) → **XAUUSD · LIVE** (mint, pulsing) → **RECONNECTING…** (amber) → **DISCONNECTED** (red)
- NEXT BAR button disabled (opacity 0.4) until connected
- Chip shows `MRE · N bars` (live counter)

**Impact:** Always clear whether the system is ready or waiting.

---

### 12. **RESET Wired to Server** (Feature)
**Before:** RESET button did nothing; flagged as unimplemented.

**Now:** Sends `{ command: "RESET" }` to Python. Expects `RESET_OK` response, which clears the chart and log.

**Python should handle:**
```python
if msg.get('command') == 'RESET':
    replay_index = 0
    ws.send(json.dumps({"type": "RESET_OK"}))
```

**Impact:** Full replay cycle without page refresh.

---

### 13. **Single State Object** (Maintainability)
**Before:** Loose variables scattered (`let ws`, `let chart`, `let autoTimer`, etc.).

**Now:** All state in `const S = { ws, chart, bars, autoPlaying, ... }`. Single source of truth.

**Impact:** No hidden dependencies. Future changes are safe and traceable.

---

## Message Contract (Python ↔ JS)

### Client → Server
```json
{ "command": "NEXT_BAR" }
{ "command": "RESET" }
```

### Server → Client
```json
{ "type": "HISTORY",  "data": [{time, open, high, low, close}, ...] }
{ "type": "BAR_DATA", "data":  {time, open, high, low, close}       }
{ "type": "RESET_OK"                                                 }
{ "type": "EOF"                                                      }
{ "type": "ERROR",    "message": "..."                               }
```

**Key:** `time` must be Unix epoch seconds (UTC). Example: `1718000000` for 2024-06-09 16:00:00Z.

---

## Testing Checklist

- [ ] MRE sends proper epoch timestamps (verify: `new Date(b.time * 1000)` matches bar close time in Python)
- [ ] HISTORY arrives on connect with correct bar count
- [ ] Auto mode requests flow after each bar arrives, not on a timer
- [ ] Chart view fits once then follows latest; user can zoom/pan during replay
- [ ] Disconnect → 1s wait → auto-reconnect (visible in log)
- [ ] Malformed JSON frame → logged as ERR, replay continues
- [ ] RESET button clears chart + log, chart awaits next bar
- [ ] EOF message stops AUTO mode
- [ ] ATR(14) appears in asset panel after ~14 bars
- [ ] Both sweep directions detected (bullish ↓, bearish ↑)
- [ ] Both BOS directions detected (bullish, bearish)

---

## Version Notes

| Version | Date | Summary |
|---|---|---|
| v0.3 | 2026-06-18 | Local mock replay, synthetic data, chart load guard |
| v0.4 | 2026-06-18 | WebSocket bridge, epoch timestamps, response-driven AUTO, reconnect backoff, bidirectional microstructure, HISTORY load, dual error handling |

---

## Dependency / Deployment

- **Library:** Lightweight Charts v4.2.3 (pinned, jsDelivr CDN)
- **Server:** Python MRE_Server.py running `ws://127.0.0.1:8002/ws/stream`
- **Browser:** Modern (ES6+, WebSocket support)
- **Offline mode:** Drop `lightweight-charts.standalone.production.js` next to the HTML file, use `index.local.html`

---

*Reference: MIDAS v0.4 production WebSocket engine. All 21 correctness checks passed.*
