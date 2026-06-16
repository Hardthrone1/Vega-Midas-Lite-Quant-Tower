---
title: Concurrent Test Task B - Breakout Signal (setup-analysis)
date: 2026-06-16T21:37:58.038Z
tags: analysis, concurrent, test-b
winRate: null
confidence: 0.82
---

## Analysis
### 1. Trading Thesis
The "Concurrent Test Task B - Breakout Signal" represents a high-performance, state-persistent breakout strategy designed to execute across parallel trading vaults (multi-asset/multi-timeframe) without execution lag or state corruption. By integrating classic structural breakout detection (identifying price movements beyond defined lookback channels) with high-efficiency state-management ("Vault Writes"), the strategy ensures that concurrent signals are captured and written to memory reliably. The primary alpha source is the exploitation of sudden volatility expansions, while the structural edge lies in the system’s ability to handle parallel execution streams using optimized Pine Script v5 state variables to prevent race conditions or computational overhead.

---

### 2. Directional Bias
*   **BIAS:** **Neutral (Bi-directional / Volatility Expansion)**
*   **REASONING:** Because this is a pure breakout strategy designed to operate within a multi-instance execution framework, it does not carry an inherent bullish or bearish bias. Instead, it is a volatility-capture model. The system remains neutral during consolidation phases and dynamically shifts to a tactical Bullish bias upon an upside breach of the lookback high, or a tactical Bearish bias upon a downside breach of the lookback low. 

---

### 3. Key Confluences
1.  **Structural Channel Breaches:** Both analyses prioritize identifying when price moves beyond a defined lookback period's boundaries (High/Low channel), which serves as the primary trigger for trend initiation.
2.  **State-Persistent "Vault Writes":** Both agents identify the need to store and track execution states ("vaults") continuously. This translates to using persistent memory structures in Pine Script to track active signals, prevent duplicate executions, and manage historical breakout states across bars.
3.  **Concurrency & Computational Efficiency:** The agents agree that the strategy must be optimized for multi-symbol/multi-instance execution, requiring lightweight code structures that avoid execution limits (such as loop overflows or redundant security calls) during high-volatility events.

---

### 4. Pine Script Recommendation
*   **Type:** **Pine Script v5 Strategy**
*   **Architecture:** A state-heavy, multi-symbol breakout strategy utilizing `var` and `varip` variables to simulate "Vault Writes" (persistent state tracking).
*   **Key Coding Features:**
    *   Use `ta.highest()` and `ta.lowest()` over an optimized lookback parameter for breakout detection.
    *   Implement `varip` (variable persistent intra-bar) to track execution states and signal logs in real-time, simulating parallel vault writes without lagging on historical bar recalculations.
    *   Utilize Pine Script **Arrays** or **Matrices** to store concurrent signal states for multiple assets if deployed on a parent chart, ensuring clean, non-overlapping execution queries.

---

### 5. Confidence Score
*   **Score:** **0.85 / 1.0**
*   **Reasoning:** There is exceptionally strong technical alignment between the agents on how to translate a system engineering concept ("concurrent vault writes") into a high-performance Pine Script architecture. The confidence is slightly capped at 0.85 only because the prompt source material originates from a system integration test case rather than a specific, asset-class-driven market inefficiency.

## Claude Audit
```pinescript
//@version=5
strategy("Concurrent Breakout Vault System [v5]", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=10, currency=currency.USD, commission_type=strategy.commission.percent, commission_value=0.04, slippage=1, process_orders_on_close=true, calc_on_every_tick=true, pyramiding=10, max_bars_back=2000)

// =============================================================================
// 1. CONFIGURATION & INPUTS
// =============================================================================
grp_main      = "Core Breakout Settings"
len_lookback  = input.int(20, "Lookback Period (Donchian)", minval=1, group=grp_main)
use_atr       = input.bool(true, "Use ATR for Stops/Targets?", group=grp_main)
len_atr       = input.int(14, "ATR Length", minval=1, group=grp_main)
mult_sl       = input.float(1.5, "Stop Loss ATR Mult", step=0.1, group=grp_main)
mult_tp       = input.float(3.0, "Take Profit ATR Mult", step=0.1, group=grp_main)
risk_pct      = input.float(1.0, "Risk Per Trade (% Equity)", step=0.1, group=grp_main) / 100.0
max_pos       = input.int(3, "Max Concurrent Positions (Vault Slots)", minval=1, maxval=20, group=grp_main)

grp_filters   = "Volatility & Session Filters"
use_vol_filter= input.bool(true, "Enable Volatility Contraction Filter (Squeeze)", group=grp_filters)
len_bb        = input.int(20, "BB/KC Length", group=grp_filters)
mult_bb       = input.float(2.0, "BB Mult", group=grp_filters)
mult_kc       = input.float(1.5, "KC Mult", group=grp_filters)
use_session   = input.bool(false, "Use Session Filter (RTH Only)", group=grp_filters)
sess_spec     = input.session("0930-1600", "Trading Session", group=grp_filters)

grp_vault     = "Vault State Management (Concurrency Engine)"
debug_vault   = input.bool(false, "Debug Vault State (Label Logs)", group=grp_vault)

// =============================================================================
// 2. CORE INDICATOR CALCULATIONS (Lightweight, No Loops)
// =============================================================================
// Donchian Channels (Breakout Levels)
upper_dc = ta.highest(high, len_lookback)[1] // [1] prevents repainting on current bar breakout
lower_dc = ta.lowest(low, len_lookback)[1]

// ATR for Risk Management
atr_val = use_atr ? ta.atr(len_atr) : na

// Volatility Contraction (Bollinger Band Width inside Keltner Channel)
// High performance: Single pass calculation
bb_mid   = ta.sma(close, len_bb)
bb_dev   = mult_bb * ta.stdev(close, len_bb)
bb_upper = bb_mid + bb_dev
bb_lower = bb_mid - bb_dev

kc_mid   = ta.sma(close, len_bb) // Typically EMA, SMA used for speed parity
kc_range = mult_kc * ta.atr(len_bb)
kc_upper = kc_mid + kc_range
kc_lower = kc_mid - kc_range

is_squeeze = (bb_upper < kc_upper) and (bb_lower > kc_lower) // Volatility Contraction
vol_ok     = not use_vol_filter or is_squeeze // True if filter off OR squeeze active

// Session Filter
in_session = not use_session or time(timeframe.period, sess_spec)

// =============================================================================
// 3. VAULT ARCHITECTURE (STATE PERSISTENCE & CONCURRENCY)
// =============================================================================
/*
 * VAULT DESIGN PATTERN:
 * We use a Matrix (Rows = Vault Slots, Cols = State Fields) to simulate 
 * "Concurrent Vault Writes". This avoids variable explosion and allows 
 * dynamic management of N concurrent positions/signals without 
 * hardcoding variables

