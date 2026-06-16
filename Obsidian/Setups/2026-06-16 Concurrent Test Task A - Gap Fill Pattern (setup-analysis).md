---
title: Concurrent Test Task A - Gap Fill Pattern (setup-analysis)
date: 2026-06-16T21:38:55.391Z
tags: analysis, concurrent, test-a
winRate: null
confidence: 0.82
---

## Analysis
Here is the synthesized quantitative trading thesis, directional bias, and implementation blueprint based on the provided multi-agent analysis.

---

### 1. THESIS: Quantitative Synthesis
The proposed strategy is a **State-Engine Driven Mean Reversion Gap Fill Strategy** implemented in Pine Script v5. The core concept marries technical gap-fill execution with highly optimized state management ("Vault Writes"). Because multiple market gaps can remain unfilled across various lookback horizons simultaneously, the system treats each active gap as an open transaction in a "Vault" (represented by a dynamic Pine Script `array` or `map`). By utilizing Pine Script v5's persistent variables (`var`) to manage these concurrent gap states, the strategy mitigates memory leaks and execution lag. It systematically enters mean-reversion trades when price deviates via a threshold-filtered gap and exits precisely when the price action "writes" a resolution (fill) to the corresponding state in the vault.

---

### 2. DIRECTIONAL BIAS: Neutral (Bi-Directional Mean Reverting)
* **Reasoning:** Gap-fill strategies are structurally market-neutral and rely entirely on short-term mean reversion. The strategy does not hold a macroscopic bullish or bearish bias; instead, it exploits localized price inefficiencies in both directions:
  * **Bullish Bias** is triggered when a **Gap Down** occurs, targeting a move upward to fill the gap back to the previous day's close.
  * **Bearish Bias** is triggered when a **Gap Up** occurs, targeting a short position downward to close the gap back to the previous day's close.

---

### 3. KEY CONFLUENCES
The agents agree on the following three operational pillars:
1. **State Mutation Containment ("The Vault"):** To prevent execution conflicts in Pine Script's single-threaded environment, open gaps must be stored in a centralized, dynamic array structure (`var array`) that acts as the "Vault," ensuring historical bars do not corrupt real-time state calculations.
2. **Threshold-Based Filtering:** Both agents highlight the necessity of a volatility or percentage-based filter (`gapThreshold`) to ignore minor intraday noise and only commit computational resources ("vault writes") to statistically significant gaps.
3. **Dynamic Resolution Tracking:** The strategy must actively loop through the stored "Vault" array on every bar to check if current price action has crossed/filled any historical open gap levels, executing a state mutation (deleting the gap from the array) and closing the corresponding trade concurrently.

---

### 4. PINE SCRIPT RECOMMENDATION

**Type:** `strategy` (Pine Script v5)  
**Execution Logic:** Use an overlay strategy that utilizes a custom User Defined Type (UDT) and a dynamic array to act as the multi-gap "Vault."

#### Recommended Code Architecture:
```pinescript
//@version=5
strategy("Multi-Gap Vault Strategy", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=10)

// 1. User Inputs
gapThreshold = input.float(0.5, title="Gap Threshold (%)", minval=0.1) / 100

// 2. Define the "Vault" State Structure using UDT
type GapInstance
    float openLevel
    float targetLevel
    bool isGapUp
    int barIndex

// Maintain the "Vault" across bars
var GapInstance[] gapVault = array.new<GapInstance>()

// 3. Gap Detection Logic
float prevClose = close[1]
float currOpen = open
float gapSize = (currOpen - prevClose) / prevClose

if math.abs(gapSize) >= gapThreshold
    bool isUp = gapSize > 0
    // "Write" to the Vault
    array.push(gapVault, GapInstance.new(currOpen, prevClose, isUp, bar_index))
    
    // Execute Entry
    if isUp
        strategy.entry("Short_" + str.tostring(bar_index), strategy.short)
    else
        strategy.entry("Long_" + str.tostring(bar_index), strategy.long)

// 4. "Vault" Management & Exit Engine (Concurrent State Resolution)
if array.size(gapVault) > 0
    for i = array.size(gapVault) - 1 to 0 by 1
        GapInstance gap = array.get(gapVault, i)
        bool isFilled = false
        
        if gap.isGapUp and low <= gap.targetLevel
            strategy.close("Short_" + str.tostring(gap.barIndex), comment="Gap Filled")
            isFilled = true
        else if not gap.isGapUp and high >= gap.targetLevel
            strategy.close("Long_" + str.tostring(gap.barIndex), comment="Gap Filled")
            isFilled = true
            
        // Clean up the Vault to optimize memory (garbage collection)
        if isFilled
            array.remove(gapVault, i)
```

---

### 5. CONFIDENCE SCORE: 0.85 / 1.0
* **Justification:** The logic is highly cohesive. The translation of software engineering "vault writes" to Pine Script's array-based state tracking is a robust solution to a classic trading problem: tracking multiple overlapping unfilled gaps. The score is capped at 0.85 because high-frequency gap situations or extreme market regimes (e.g., runaway trends that never fill gaps) can clog the array/vault, requiring strict stop-loss logic to prevent capital degradation.

## Claude Audit
```pinescript
//@version=5
strategy("State-Engine Gap Fill Vault [Production]", 
     overlay=true, 
     initial_capital=10000, 
     currency=currency.USD,
     default_qty_type=strategy.percent_of_equity, 
     default_qty_value=10, 
     commission_type=strategy.commission.percent, 
     commission_value=0.04, 
     slippage=2,
     process_orders_on_close=true,      // Execute on next bar open (realistic)
     calc_on_every_tick=true,           // Required for precise intrabar exit logic (SL/TP)
     calc_on_order_fills=true,          // Recalculate immediately after fill
     max_bars_back=2000)                // Ensure enough history for array/vault ops

// =============================================================================
// 1. USER INPUTS & CONFIGURATION
// =============================================================================
grp_gap      = "Gap Detection Settings"
grp_risk     = "Risk Management & Sizing"
grp_vault    = "Vault & State Management"
grp_vis      = "Visuals & Debugging"

// --- Gap Detection ---
gapThresholdPct   = input.float(0.5, "Min Gap Threshold (%)", minval=0.01, step=0.05, group=grp_gap) / 100
useVolatilityFilter = input.bool(true, "Volatility Filter (ATR)", group=grp_gap)
atrLen            = input.int(14, "ATR Length", minval=1, group=grp_gap)
atrMult           = input.float(1.5, "Gap Min Size (x ATR)", step=0.1, group=grp_gap)
sessionFilter     = input.session("0930-1600", "Trading Session (Exchange Time)", group=grp_gap)
gapTimeframe      = input.timeframe("D", "Gap Calculation Timeframe", group=grp_gap)

// --- Risk Management ---
riskPerTradePct   = input.float(1.0, "Risk Per Trade (% Equity)", minval=0.1, maxval=10, step=0.1, group=grp_risk) / 100
stopLossType      = input.string("ATR", "Stop Loss Type", options=["ATR", "Fixed %", "Gap Edge"], group=grp_risk)
slAtrMult         = input.float(2.0, "SL ATR Multiplier", step=0.1, group=grp_risk)
slFixedPct        = input.float(2.0, "SL Fixed %", step=0.1, group=grp_risk) / 100
tpType            = input.string("Gap Fill", "Take Profit Type", options=["Gap Fill", "Risk:Reward", "None"], group=grp_risk)
rrRatio           = input.float(2.0, "Risk:Reward Ratio", step=0.1, group=grp_risk)
maxHoldBars       = input.int(20, "Max Hold Bars (Time Stop)", minval=1, group=grp_risk)
maxConcurrentGaps = input.int(5, "Max Concurrent Gaps (Vault Capacity)", minval=1, maxval=20, group=grp_vault)

// --- Visuals ---
showGapLabels     = input.bool(true, "Show Gap Labels", group=grp_vis)
showVaultTable    = input.bool(true, "Show Vault Status Table", group=grp_vis)
plotSLTP          = input.bool(true, "Plot Active SL/TP Levels", group=grp_vis)

// =============================================================================
// 2. USER DEFINED TYPE (UDT) - THE VAULT RECORD
// =============================================================================
// Represents a single "Open Transaction" in the Vault.
type GapInstance
    string  id           // Unique ID (e.g., "Gap_1700000000")
    float   entryPrice   // Theoretical Entry (Open Price)
    float   targetPrice  // Gap Fill Target (Prev Close)
    float   stopPrice    // Calculated Stop Loss
    int     direction    // 1 = Long (Gap Down), -1 = Short (Gap Up)
    int     entryBar     // Bar index of entry (for time stop)
    float   qty          // Calculated position size
    bool    isActive     // State flag (redundant but explicit)

// ==============================================================

