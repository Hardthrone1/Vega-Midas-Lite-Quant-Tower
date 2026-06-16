---
title: Support Zone Bounce Strategy (setup-analysis)
date: 2026-06-16T10:12:32.819Z
tags: analysis, bounce, support
winRate: null
confidence: 0.82
---

## Analysis
### 1. THESIS
The trading thesis centers on a systematic, high-probability mean-reversion strategy designed to exploit bullish reversals off validated structural demand zones. Rather than treating support as a static price line, the strategy mathematically defines support as a dynamic price range—using ATR or fractal-based bands—that has been verified through multiple distinct touches without a confirmed breakdown (a close below the zone). By filtering out noise through anti-clustering logic (minimum bars between touches) and requiring confirmation via momentum oscillators or candlestick patterns, the strategy aims to capture highly asymmetric long entries at major structural inflections, targeting overhead resistance zones with tight, well-defined risk parameters.

---

### 2. DIRECTIONAL BIAS
**BULLISH**  
The core mechanics of both analyses focus exclusively on identifying, validating, and trading a "bounce" from a major support zone. The strategy is structured to buy at local or structural market discounts (demand zones) where buying pressure historically overwhelms selling pressure, anticipating an upward reversal back toward resistance. 

---

### 3. KEY CONFLUENCES
1. **Dynamic Zone Definition over Static Lines:** Both agents agree that support must be modeled as a price band `[Zone_Low, Zone_High]` rather than a single horizontal coordinate. Nemotron suggests utilizing ATR multiples or percentage-based widths, while Qwen highlights consolidation areas and trendline ranges.
2. **Multi-Touch Validation with Anti-Clustering:** A valid support zone requires multiple distinct tests (touches) to prove its strength. Crucially, the agents agree on filtering out consecutive candles touching the zone (clustering) by enforcing a minimum time/bar distance between touches to ensure genuine structural significance.
3. **Trigger Confirmation (No Blind Limit Orders):** Both analyses emphasize that entering a trade requires more than just price entering the zone. The entry must be triggered by a confirmation signal, such as a momentum oscillator reversal (e.g., RSI exiting oversold territory) or a bullish candlestick pattern, ensuring the downward momentum has stalled before capital is committed.

---

### 4. PINE SCRIPT RECOMMENDATION
**Pine Script v5 Backtesting Strategy (`strategy()`)**  
To implement this systematically, code a robust backtesting script utilizing the following architecture:
* **Zone Engine:** Use Pivot Points / Fractals (`ta.pivothollow()`) to identify historical swing lows. Use an ATR-based multiplier (e.g., `1.5 * ta.atr(14)`) to plot the upper and lower boundaries of the active Support Zone.
* **Touch Counter:** Implement a loop that counts how many times `high >= Zone_Low` and `low <= Zone_High` within a defined lookback period (`lookback_period`), incorporating a bar-index filter (e.g., `bar_index - last_touch_bar > 5`) to prevent double-counting the same consolidation range.
* **Execution Logic:** 
  * **Entry:** Trigger `strategy.entry("Long")` when price is within the zone AND a bullish confirmation occurs (e.g., a close above the 5-period EMA or RSI crossing back above 30).
  * **Risk Management:** Place a hard stop-loss slightly below `Zone_Low` (e.g., `Zone_Low - 0.5 * ATR`). Set the take-profit (`strategy.exit`) at the nearest upper swing high (resistance zone).

---

### 5. CONFIDENCE
**0.95 / 1.0**  
The confidence level is exceptionally high. Both analyses are in complete conceptual and structural alignment. Qwen provides the foundational market logic, while Nemotron provides the exact mathematical parameters needed to translate the concepts into clean, executable Pine Script v5 code. The only minor variance is the specific method of zone calculation, which can be easily resolved through parameter optimization (backtesting ATR-based vs. fractal-based zones).

## Claude Audit
```pinescript
//@version=5
strategy("Mean Reversion: Validated Demand Zone Strategy", 
     overlay=true, 
     initial_capital=10000, 
     default_qty_type=strategy.percent_of_equity, 
     default_qty_value=10, 
     currency=currency.USD, 
     commission_type=strategy.commission.percent, 
     commission_value=0.04, 
     slippage=2, 
     process_orders_on_close=true,
     calc_on_every_tick=false,
     max_bars_back=5000)

// =============================================================================
// --- INPUTS & CONFIGURATION ---
// =============================================================================
grp_zone     = "Zone Detection Engine"
grp_val      = "Zone Validation (Anti-Clustering)"
grp_entry    = "Entry Trigger & Confirmation"
grp_risk     = "Risk Management & Exits"
grp_vis      = "Visuals & Debugging"

// --- Zone Engine ---
len_pivot    = input.int(10, "Pivot Lookback (Left/Right)", minval=3, group=grp_zone, tooltip="Bars required on each side to confirm a swing low (Fractal). Higher = more significant zones.")
atr_len      = input.int(14, "ATR Length", minval=1, group=grp_zone)
atr_mult     = input.float(1.5, "ATR Multiplier (Zone Half-Width)", step=0.1, minval=0.1, group=grp_zone, tooltip="Zone = [PivotLow - ATR*Mult, PivotLow + ATR*Mult]")
lookback_zb  = input.int(200, "Zone Lookback (Bars)", minval=50, group=grp_zone, tooltip="How far back to search for valid pivot lows to build zones.")

// --- Validation ---
min_touches  = input.int(2, "Minimum Touches Required", minval=1, group=grp_val, tooltip="Number of distinct price interactions with zone to validate it.")
min_bars_btw = input.int(8, "Min Bars Between Touches", minval=1, group=grp_val, tooltip="Anti-clustering: Minimum bars separating two valid touches.")
zone_expiry  = input.int(150, "Zone Expiry (Bars Since Last Touch)", minval=10, group=grp_val, tooltip="Invalidate zone if price hasn't interacted in this many bars.")

// --- Entry Confirmation ---
use_rsi_conf = input.bool(true, "Use RSI Confirmation (Cross Up 30)", group=grp_entry)
rsi_len      = input.int(14, "RSI Length", group=grp_entry)
rsi_ob       = input.int(30, "RSI Oversold Threshold", group=grp_entry)
use_ema_conf = input.bool(true, "Use EMA Reclaim Confirmation", group=grp_entry)
ema_len      = input.int(20, "EMA Length (Trend Filter)", group=grp_entry)
use_candle_conf = input.bool(false, "Use Bullish Engulfing / Hammer", group=grp_entry)

// --- Risk Management ---
sl_atr_mult  = input.float(0.5, "Stop Loss ATR Buffer (Below Zone Low)", step=0.1, minval=0.1, group=grp_risk)
tp_rr        = input.float(2.5, "Take Profit Risk:Reward Ratio", step=0.1, minval=0.5, group=grp_risk)
use_struct_tp = input.bool(true, "Target Structural Resistance (Swing High)", group=grp_risk, tooltip="If true, TP at nearest Swing High. If false, use Fixed R:R.")
max_hold_bars = input.int(30, "Max Hold Bars (Time Stop)", minval=1, group=grp_risk)
pyramiding   = input.int(1, "Max Entries Per Zone (Pyramiding)", minval=1, maxval=3, group=grp_risk)

// --- Visuals ---
show_zones   = input.bool(true, "Show Valid Zones", group=grp_vis)
show_touches = input.bool(true, "Show Touch Labels", group=grp_vis)
show_signals = input.bool(true, "Show Entry/Exit Labels", group=grp_vis)
debug_mode   = input.bool(false, "Debug Mode (Print Logs)", group=grp_vis)

// =============================================================================
// --- CORE CALCULATIONS ---
// ===================================================

