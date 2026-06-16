---
title: Concurrent Test Task B - Breakout Signal (setup-analysis)
date: 2026-06-16T21:09:27.278Z
tags: analysis, concurrent, test-b
winRate: null
confidence: 0.82
---

## Analysis
### 1. Trading Thesis
This setup represents an institutional-grade, multi-vault concurrent breakout strategy designed to exploit volatility expansion. Rather than relying on simple retail chart patterns, the strategy executes parallel breakout analyses across multiple timeframes or assets (simulated by "concurrent vault writes"). By identifying periods of extreme price compression (using historical highs/lows) and executing automated capital allocations into the outperforming "vaults" upon breakout confirmation, the system seeks to capture high-momentum, directional trend-initiation phases while minimizing execution latency and capital drag.

---

### 2. Directional Bias
**Neutral to Bullish (Volatility-Expansion Biased)**
* **Reasoning:** Breakout systems are inherently direction-agnostic; however, institutional vault-allocation strategies typically exhibit a structural bias toward **upside expansion (Bullish)** due to asymmetrical upside potential and momentum persistence in risk assets. The strategy remains neutral during consolidation phases, deploying capital dynamically only when a clear directional breakout (either support or resistance breach) is confirmed by volume and volatility expansion.

---

### 3. Key Confluences
The analysis agents agreed on the following core operational signals:
1. **Volatility Squeeze & Range Expansion:** The necessity of tracking historical extremes (highest highs/lowest lows over a specific lookback period) to identify the transition from low-volatility compression to high-volatility breakout.
2. **Multi-Timeframe/Multi-Asset Synchronization:** The requirement to process concurrent data streams in parallel to confirm that a breakout on a lower timeframe aligns with higher-timeframe structural trends.
3. **Execution Efficiency & State Tracking:** The critical need for optimized state-tracking (simulating concurrent vault writes) to ensure capital is allocated to the breakout signal instantly without lag, repainting, or execution delays.

---

### 4. Pine Script Recommendation
**Strategy Type:** Quantitative Multi-Timeframe Volatility Breakout Strategy (`strategy()`)

**Key Architectural Features to Code:**
* **Engine:** Use a **Donchian Channel** or **Bollinger Band Squeeze** framework to define the breakout boundaries.
* **Concurrency Emulation:** Implement `request.security_lower_tf()` to analyze lower-timeframe price action within the current bar, simulating high-frequency concurrent checks.
* **Optimization:** 
  * Use **user-defined types (UDTs)** and **arrays** to track the state of multiple "virtual vaults" (assets/timeframes) within a single script.
  * Utilize `varip` variables to track intra-bar execution states and prevent double-triggering during rapid, concurrent market movements.
  * Minimize historical referencing (`[x]`) where possible to optimize execution speed.

---

### 5. Confidence Score
**0.75 / 1.0**
* *Reasoning:* Both agents show high structural agreement regarding the institutional nature of the setup (parallel execution, high/low breakout mechanics, and performance optimization). The score is capped at 0.75 solely because the precise source code was not provided, requiring architectural assumptions regarding the exact mechanics of the "vault writes."

## Claude Audit
```pinescript
//@version=5
strategy("Institutional Multi-Vault Volatility Breakout System", 
     overlay=true, 
     initial_capital=100000, 
     default_qty_type=strategy.percent_of_equity, 
     default_qty_value=10, // 10% equity per vault max
     currency=currency.USD,
     commission_type=strategy.commission.percent,
     commission_value=0.04, // 0.04% per side (typical futures/low fee spot)
     slippage=2,            // 2 ticks slippage
     process_orders_on_close=true,
     calc_on_every_tick=true, // Critical for varip intra-bar logic
     max_labels_count=500,
     max_lines_count=500)

/*
  =============================================================================
  INSTITUTIONAL MULTI-VAULT VOLATILITY BREAKOUT STRATEGY (PINE SCRIPT V5)
  =============================================================================
  
  ARCHITECTURE OVERVIEW:
  1.  **Multi-Vault Concurrency**: Simulates parallel capital allocation across 
      three distinct volatility regimes (Fast/Noise, Medium/Trend, Slow/Macro) 
      using Donchian Channels with unique lookbacks.
  2.  **Intra-Bar Execution (varip)**: Uses `calc_on_every_tick=true` and `varip` 
      to detect breakouts *inside* the current chart bar, simulating HFT "vault writes" 
      without repainting.
  3.  **Lower-TF Confirmation**: Uses `request.security_lower_tf` to validate 
      breakout conviction on a faster timeframe (e.g., 1m on 15m chart) before 
      committing capital.
  4.  **Dynamic Risk Management**: ATR-based Stop Loss, R:R Take Profit, and 
      Volatility-Adjusted Position Sizing (Kelly-lite fraction).
  5.  **State Management**: User-Defined Types (UDTs) + Arrays track each vault's 
      lifecycle independently (Entry, SL, TP, Trail, Cooldown).
*/

// =============================================================================
// 1. USER DEFINED TYPES (UDT) & CONFIGURATION
// =============================================================================

// --- Vault State Object ---
type VaultState
    int     id              // Unique Vault ID
    string  name            // Descriptive Name
    int     lookback        // Donchian Lookback
    float   atrMult         // SL ATR Multiplier
    float   rrTarget        // Risk:Reward Target
    bool    useTrail        // Enable Trailing Stop
    float   trailMult       // Trail ATR Multiplier
    int     cooldownBars    // Bars to wait after exit
    // Runtime State (varip updated intra-bar)
    bool    activeLong      // Currently in Long
    bool    activeShort     // Currently in Short
    float   entryPrice      // Avg Entry Price
    float   stopPrice       // Current Stop Price
    float   targetPrice     // Current Target Price
    float   positionSize    // Current Contract/Qty Size
    int     entryBar        // Bar index of entry
    int     lastExitBar     // Bar index of last exit (for cooldown)
    bool    breakoutArmed   // Intra-bar flag: Breakout detected, awaiting LTF confirm
    float   breakoutLevel   // The level that was breached
    int     breakoutDir     // 1=Long, -1=Short
    // Visuals
    color   plotColor

// --- Global Settings ---
grp_main      = "⚙️ CORE ENGINE SETTINGS"
grp_vaults    = "🏦 VAULT CONFIGURATION (3 Concurrent Regimes)"
grp_risk      = "🛡️ RISK & SIZING"
grp_ltf       = "🔬 LOWER TIMEFRAME CONFIRMATION"
grp_vis       = "🎨 VISUALS & DEBUG"

// Core
src           = input.source(close, "Price Source", group=grp_main)
useLTFConfirm = input.bool(true, "Enable 

