# MIDAS Quant Lab — Chart Dependency & Recovery Note

> **Purpose:** Single source of truth for the Lightweight Charts dependency in the MIDAS Quant Lab dashboard (`index.html`). Use this to revert, diagnose a blank/broken chart, or migrate versions without re-discovering everything.
>
> **File:** `C:\Users\Softthrone\Claude\Dashboard\index.html`
> **Last verified:** 2026-06-18
> **Current pinned library:** `lightweight-charts@4.2.3` (jsDelivr)

---

## TL;DR

- The chart is rendered by **TradingView Lightweight Charts**, loaded from a CDN `<script>` tag.
- It is currently **pinned to v4.2.3**. Do **not** use an unversioned URL — it floats to v5.x and breaks.
- If the chart panel is blank or the console shows `LightweightCharts is not defined`, jump to [Recovery Playbook](#recovery-playbook).

---

## The current (working) setup

**Script tag — in `<head>`:**

```html
<script src="https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js"></script>
```

**Series creation — inside `initChart()` (v4 form, this is what the file uses):**

```javascript
candle = chart.addCandlestickSeries({
  upColor: '#2dd4a7', downColor: '#f0506e',
  wickUpColor: '#2dd4a7', wickDownColor: '#f0506e',
  borderVisible: false,
});
```

**Load guard — inside the `window 'load'` handler (top of it):**

```javascript
if (typeof LightweightCharts === 'undefined') {
  $('chart').innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:var(--bear);font-size:13px;text-align:center;padding:20px">Chart library failed to load · check network / CDN access, then refresh.</div>';
  log('ERR', 'LightweightCharts CDN unreachable · chart disabled.', 'err');
  return;
}
```

---

## Why it broke (root cause history)

| Symptom | Cause | Fix applied |
|---|---|---|
| `Uncaught ReferenceError: LightweightCharts is not defined` | Unversioned CDN URL (`.../lightweight-charts/dist/...`) auto-resolved to **v5.2.0**, which (a) sometimes failed to load and (b) **removed `addCandlestickSeries`** | Pinned URL to `@4.2.3`, added load guard |
| Chart blank even when script loads | v5 API change: series are created via `chart.addSeries(LightweightCharts.CandlestickSeries, opts)` — the old `chart.addCandlestickSeries(opts)` throws | Stayed on v4 so existing calls work unchanged |

**Key fact:** v4 and v5 have **incompatible series APIs**. Pinning the version is the real fix; the load guard just makes failure loud instead of silent.

---

## Version compatibility cheat-sheet

| | **v4.x (current)** | **v5.x** |
|---|---|---|
| Create candles | `chart.addCandlestickSeries({...})` | `chart.addSeries(LightweightCharts.CandlestickSeries, {...})` |
| Update last bar | `series.update(bar)` | `series.update(bar)` (same) |
| Set all data | `series.setData(arr)` | `series.setData(arr)` (same) |
| Markers | `series.setMarkers([...])` | `createSeriesMarkers(series, [...])` |
| Global name | `LightweightCharts` | `LightweightCharts` (same) |

The dashboard relies on `addCandlestickSeries`, `.update()`, `.setData()`, `createChart`, and `CrosshairMode` — all v4-native.

---

## Recovery Playbook

Work top to bottom. Stop when the chart renders.

### 1. Confirm it's a load failure
Open DevTools (F12) → Console.
- `LightweightCharts is not defined` → CDN didn't load. Go to step 2.
- `addCandlestickSeries is not a function` → wrong version (v5 loaded). Go to step 3.
- Candles render but data looks wrong → not a dependency issue; check `genData()` / replay feed.

### 2. CDN unreachable (network / firewall on the VPS)
Try, in order:

**a. Swap to the unpkg mirror (same version):**
```html
<script src="https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js"></script>
```

**b. Go fully offline (most robust — recommended for production):**
1. Download the file once on any machine with internet:
   `https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js`
2. Save it next to `index.html` as `lightweight-charts.standalone.production.js`
3. Change the tag to a relative path:
```html
<script src="lightweight-charts.standalone.production.js"></script>
```
This removes the CDN as a point of failure entirely.

### 3. Wrong version loaded (v5 came down)
Re-pin the URL to `@4.2.3` exactly (see [current setup](#the-current-working-setup)). Never use the bare `lightweight-charts` path without `@version`.

### 4. "If v4 itself breaks / disappears"
v4.2.3 is published and immutable on npm/jsDelivr/unpkg, so it won't vanish. But if you ever need to move:
- **Safest:** keep a **local copy** of the v4.2.3 `.js` (step 2b). Nothing external can break it.
- **If forced to v5:** change the one series-creation line to:
  ```javascript
  candle = chart.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: '#2dd4a7', downColor: '#f0506e',
    wickUpColor: '#2dd4a7', wickDownColor: '#f0506e',
    borderVisible: false,
  });
  ```
  and migrate any `setMarkers` calls to `createSeriesMarkers`. Everything else (`createChart`, `.update`, `.setData`, `CrosshairMode`) is unchanged.

---

## Known-good URLs (copy-paste ready)

```text
# Primary (current)
https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js

# Mirror (fallback, identical file)
https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js
```

---

## Change log

| Date | Change | Risk | Notes |
|---|---|---|---|
| 2026-06-18 | Pinned CDN `latest` → `@4.2.3`; added load guard | Low | Root cause = floating version resolving to v5.2.0 |
| 2026-06-18 | Rebuilt dashboard UI (palette, real candle data, AUTO replay, OHLC/ATR readouts) | — | Visual redesign, no dependency change |

---

## Validation checklist (after any change here)

- [ ] Open `index.html` directly — candles render within ~1s.
- [ ] Console is clean (no `ReferenceError`, no `is not a function`).
- [ ] **NEXT BAR** advances one candle and appends a log line.
- [ ] **AUTO** toggles play/pause; **RESET** returns to the warmup boundary.
- [ ] Kill network → refresh → you see the red "Chart library failed to load" notice (guard works), not a blank panel.

---

*Reference note for MIDAS Quant Lab. Keep alongside `index.html` or in the Obsidian vault under Dashboard/Dependencies.*
