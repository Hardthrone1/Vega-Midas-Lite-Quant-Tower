---
title: Concurrent Test Task A - Gap Fill Pattern (setup-analysis)
date: 2026-06-16T21:06:33.231Z
tags: analysis, concurrent, test-a
winRate: null
confidence: 0.82
---

## Analysis
### 1. THESIS
The trading thesis centers on exploiting short-term liquidity voids and market inefficiencies through a systematic **Mean-Reverting Gap Fill Strategy** implemented in Pine Script. The core objective is to programmatically identify structural price gaps at session opens or high-volatility transitions (where the opening price of the current bar deviates significantly from the prior bar’s close/high/low) and trade the high-probability reversion back to the gap's origin. By tracking the real-time boundary levels of the gap, the strategy automates counter-trend entries with precise, predefined targets set at the historical gap boundaries, capitalizing on the market's tendency to fill liquidity imbalances.

---

### 2. DIRECTIONAL BIAS
**NEUTRAL (Mean-Reverting)**
* **Reasoning:** A gap-fill strategy is inherently bi-directional and non-trend-biased. The directional bias is dynamically established on a bar-by-bar or session-by-session basis:
  * **Bearish Bias** is triggered upon a **Gap Up** (price opens above the previous bar's high/close), signaling an overextended market and prompting a short entry to capture the downward fill.
  * **Bullish Bias** is triggered upon a **Gap Down** (price opens below the previous bar's low/close), signaling an oversold state and prompting a long entry to capture the upward fill.

---

### 3. KEY CONFLUENCES
*Due to the absence of a response from Nemotron, the confluences are derived from the structural requirements and logical parameters outlined in Qwen’s setup:*

1. **Structural Gap Boundary Identification:** The precise mapping of the gap zone—specifically, the distance between the previous bar's close (or high/low) and the current bar's open. This establishes the exact mathematical "void" to be traded.
2. **Mean-Reversion Trigger (Price Action Reversal):** Confirmation of price reverting back into the gap zone rather than continuing in the direction of the gap (avoiding "breakaway" or runaway gaps).
3. **Target Level Convergence (The "Fill" Line):** The historical closing or extreme price of the pre-gap candle acts as a highly confluent support/resistance level, serving as a natural magnet for price action and an objective take-profit target.

---

### 4. PINE SCRIPT RECOMMENDATION
**Type:** **Quantitative Mean-Reversion Strategy (`strategy()`)**

#### Recommended Implementation Details:
* **Gap Detection Engine:** Use `ta.atr()` or a percentage-based threshold to filter out market noise and identify statistically significant gaps.
* **State Management:** Utilize `var` variables to store the gap's upper bound (`gap_high`) and lower bound (`gap_low`) upon detection, ensuring these levels persist across bars until the gap is officially filled.
* **Execution Logic:**
  * **Short Entry:** If `open > high[1] + (ATR * Multiplier)`, entry limit/market short. Target: `high[1]`. Stop Loss: Set above the opening bar's high.
  * **Long Entry:** If `open < low[1] - (ATR * Multiplier)`, entry limit/market long. Target: `low[1]`. Stop Loss: Set below the opening bar's low.
* **Intraday Session Filter:** Implement a time-based filter to restrict gap detection to the market open (e.g., `sess = input.session("0930-1600")`) and automatically close unfilled positions at the end of the trading session to mitigate overnight risk.

---

### 5. CONFIDENCE SCORE
**0.4 / 1.0**
* **Reasoning:** While the gap-fill architecture proposed by the active agent (Qwen) is structurally sound and highly suited for Pine Script automation, the overall confidence is capped at 0.4 due to the complete lack of response from Nemotron. Without multi-agent cross-verification, alternative filter methods (such as volume or trend-state checks) could not be synthesized.

## Claude Audit
```pinescript
//@version=5
strategy("Mean-Reverting Gap Fill Strategy [Production]", 
     overlay=true, 
     initial_capital=100000, 
     default_qty_type=strategy.percent_of_equity, 
     default_qty_value=10, // % of equity per trade (adjustable via risk mgmt below)
     currency=currency.USD,
     commission_type=strategy.commission.percent,
     commission_value=0.04, // 0.04% per side (typical futures/forex)
     slippage=1,            // 1 tick slippage
     process_orders_on_close=true,
     calc_on_every_tick=true,
     max_bars_back=500)

// =============================================================================
// 1. INPUTS & CONFIGURATION
// =============================================================================
grp_gap      = "Gap Detection Parameters"
grp_risk     = "Risk Management & Sizing"
grp_session  = "Session & Time Filters"
grp_vis      = "Visuals & Debugging"

// --- Gap Detection ---
atr_len      = input.int(14, "ATR Length", minval=1, group=grp_gap, tooltip="Period for volatility measurement")
atr_mult     = input.float(1.5, "ATR Multiplier (Gap Threshold)", step=0.1, minval=0.1, group=grp_gap, tooltip="Min gap size = ATR * Mult. Filters noise.")
use_prev_high_low = input.bool(true, "Use Prev High/Low vs Close", group=grp_gap, tooltip="True: Gap vs Prev High/Low. False: Gap vs Prev Close.")
min_gap_pct  = input.float(0.1, "Min Gap % (Fallback)", step=0.01, minval=0, group=grp_gap, tooltip="Minimum gap % if ATR filter too small (0=disable)")

// --- Risk Management ---
risk_pct     = input.float(1.0, "Risk Per Trade (% Equity)", step=0.1, minval=0.1, maxval=10, group=grp_risk)
rr_ratio     = input.float(1.5, "Risk:Reward Ratio (Target Mult)", step=0.1, minval=0.5, group=grp_risk, tooltip="Target distance = Risk * RR. Overrides Gap Boundary if RR hit first.")
max_trades_day = input.int(2, "Max Trades Per Session", minval=1, group=grp_risk)
use_atr_sl   = input.bool(false, "Use ATR Stop Loss (vs Structural)", group=grp_risk, tooltip="If true, SL = Entry +/- ATR*Mult. If false, SL = Gap Bar High/Low.")

// --- Session ---
session_str  = input.session("0930-1600", "Trading Session (Exchange Time)", group=grp_session)
tz           = input.string("America/New_York", "Timezone", group=grp_session)
flatten_time = input.string("15:55", "Flatten Positions Time (HH:MM)", group=grp_session, tooltip="Force close all open positions before session end")

// --- Visuals ---
show_levels  = input.bool(true, "Show Gap Levels & Targets", group=grp_vis)
show_labels  = input.bool(true, "Show Trade Labels", group=grp_vis)

// =============================================================================
// 2. CORE FUNCTIONS & STATE MANAGEMENT
// =============================================================================

// Time Utilities
in_session(sess, tz_str) => 
    not na(time(timeframe.period, sess, tz_str))

is_new_session(sess, tz_str) =>
    ta.change(time(timeframe.period, sess, tz_str)) > 0

// Session Flatten Time Logic
[flatten_h, flatten_m] = str.split(flatten_time, ":")
flatten_sec = int(flatten_h) * 3600 + int(flatten_m) * 60
is_flatten_time => 
    sec = second(timenow) + 60 * (minute(timenow) + 60 * hour(timenow))
    sec >= flatten_sec

// ATR Calculation
atr_val = ta.atr(atr_len)

// State Variables (Persist across bars)
var float gap_upper_level     = na      // Resistance (Prev High/Close) -> Short Target
var float gap_lower_level     = na      // Support (Prev Low/Close)   -> Long Target
var float

