---
title: Support Zone Bounce Strategy (setup-analysis)
date: 2026-06-16T09:01:47.960Z
tags: analysis, bounce, support
winRate: null
confidence: 0.82
---

## Analysis
Based on the synthesized intelligence from the Qwen and Nemotron analyses, here is the unified quantitative trading thesis and implementation framework.

---

### 1. THESIS
The **Support Zone Bounce Strategy** must be transitioned from a naive retail chart-pattern approach into a dynamic, institutional-grade quantitative model. By synthesizing macro-structural support identification (higher-timeframe pivot lows) with micro-structural execution filters (Volume Profile, VWAP bands, and Volume Delta), we can exploit localized liquidity pools. Rather than treating support as a static horizontal line, this thesis treats support as a **dynamic liquidity zone**. Execution is triggered only when a zone achieves a high "Zone Score" and exhibits clear absorption characteristics (positive Volume Delta divergence on the test), significantly reducing the risk of catching "falling knives" during structural breakdowns.

---

### 2. DIRECTIONAL BIAS
**BULLISH**  
The core architecture of both analyses is structurally engineered to capture market bottoms, demand absorption, and bullish reversals. The strategy capitalizes on mean-reversion tendencies at major structural boundaries, using volume-weighted validation to confirm that selling pressure has exhausted and institutional buying (order block activation) has commenced.

---

### 3. KEY CONFLUENCES
1. **Dynamic Zone Multi-Factor Scoring (Structure + Liquidity):** Merging historical, multi-tested pivot lows (Qwen) with Volume Profile High Volume Nodes (HVNs) and VWAP/Standard Deviation bands (Nemotron) to map a high-probability "Zone Score" (0–100) instead of relying on a single price line.
2. **Volume Delta & Order Flow Validation:** Rather than counting simple touches of a level, utilizing Volume Delta (Buy vs. Sell pressure) during the touch to confirm institutional absorption (Nemotron) before triggering an entry.
3. **Multi-Timeframe Structural Alignment:** Identifying major support zones on daily/4-hour macro charts to establish structural significance (Qwen), while drilling down to lower timeframes for precise, volume-confirmed execution.

---

### 4. PINE SCRIPT RECOMMENDATION
**Type:** Pine Script v5 Strategy (`strategy()`)  
**Implementation Architecture:**
*   **Zone Engine:** Use `ta.pivothollow()` to dynamically track historical swing lows. Create a custom function to calculate a "Zone Score" based on the proximity of these pivots to the current Volume Profile Value Area Low (VAL) or VWAP -2 Standard Deviation band.
*   **Volume Delta Filter:** Code an intraday volume delta tracker: 
    $$\text{Delta} = \text{volume} \times \frac{\text{close} - \text{low}}{\text{high} - \text{low}}$$
    Require cumulative positive delta divergence while price is within the designated support zone.
*   **Execution Trigger:** Enter long on a Pine Script-defined bullish reversal candlestick (e.g., Hammer, Bullish Engulfing) occurring *exclusively* when the Zone Score is $> 70$ and Volume Delta confirms buying pressure.
*   **Risk Management:** Program an ATR-based trailing stop-loss placed just below the lowest boundary of the dynamic support zone to protect against structural invalidation.

---

### 5. CONFIDENCE SCORE
**0.85 / 1.0**  
*Reason for Score:* The agents exhibit exceptional synergy. Qwen provides the robust macro structural foundation (the "where" to look), while Nemotron provides the mathematical and quantitative filters (the "how" and "when" to execute). This combination mitigates the primary vulnerability of support-bounce strategies (false breakouts/liquidation runs) through strict volume and order-flow validation.

## Claude Audit
```pine
//@version=5
strategy(
     title                = "Support Zone Bounce Strategy v5",
     shorttitle           = "SZB-v5",
     overlay              = true,
     initial_capital      = 100000,
     default_qty_type     = strategy.percent_of_equity,
     default_qty_value    = 2,
     commission_type      = strategy.commission.percent,
     commission_value     = 0.05,
     slippage             = 2,
     max_bars_back        = 500
     )

// ============================================================
// SECTION 1 – USER INPUTS
// ============================================================

// --- Pivot / Zone Engine ---
i_pivotLen      = input.int (10,   "Pivot Lookback Length",        group = "Zone Engine",   minval = 3,  maxval = 50)
i_zoneBuffer    = input.float(0.5, "Zone Buffer (ATR multiplier)", group = "Zone Engine",   minval = 0.1, maxval = 3.0, step = 0.1)
i_maxZones      = input.int (3,    "Max Active Support Zones",     group = "Zone Engine",   minval = 1,  maxval = 5)
i_zoneLookback  = input.int (200,  "Zone History (bars)",          group = "Zone Engine",   minval = 50, maxval = 500)

// --- VWAP / Standard Deviation ---
i_vwapSrc       = input.source(hlc3, "VWAP Source",                group = "VWAP Bands")
i_sdMult1       = input.float(1.0, "SD Band 1 Multiplier",         group = "VWAP Bands",   minval = 0.5, step = 0.25)
i_sdMult2       = input.float(2.0, "SD Band 2 Multiplier",         group = "VWAP Bands",   minval = 1.0, step = 0.25)

// --- Volume Delta Filter ---
i_deltaLookback = input.int (14,   "Volume Delta Lookback",        group = "Volume Delta",  minval = 3,  maxval = 50)
i_deltaThresh   = input.float(0.0, "Minimum Cumulative Delta",     group = "Volume Delta",  step = 0.1,
     tooltip = "Positive = require net buying pressure during zone test")

// --- Zone Score Thresholds ---
i_scoreEntry    = input.int (70,   "Minimum Zone Score for Entry", group = "Zone Score",    minval = 50, maxval = 95)
i_scoreBonus    = input.int (10,   "VWAP Band Proximity Bonus",    group = "Zone Score",    minval = 0,  maxval = 30)

// --- Candlestick Pattern ---
i_useHammer     = input.bool(true,  "Use Hammer Pattern",          group = "Entry Patterns")
i_useEngulf     = input.bool(true,  "Use Bullish Engulfing",       group = "Entry Patterns")
i_bodyRatio     = input.float(0.35, "Max Body/Range Ratio (Hammer)",group= "Entry Patterns",minval = 0.1, maxval = 0.6, step = 0.05)
i_wickRatio     = input.float(2.0,  "Min Lower Wick/Body Ratio",   group = "Entry Patterns",minval = 1.0, maxval = 5.0, step = 0.25)

// --- Risk Management ---
i_atrLen        = input.int (14,   "ATR Length",                   group = "Risk Mgmt",     minval = 5,  maxval = 50)
i_slAtr         = input.float(1.5, "Stop Loss (ATR below zone)",   group = "Risk Mgmt",     minval = 0.5, maxval = 5.0, step = 0.25)
i_tp1R          = input.float(1.5, "Take Profit 1 (R-multiple)",   group = "Risk Mgmt",     minval = 0.5, maxval = 10.0, step = 0.25)
i_tp2R          = input.float(3.0, "Take Profit 2 (R-multiple)",   group = "Risk Mgmt",     minval = 1.0, maxval = 15.0, step = 0.25)
i_tp1Pct        = input.float(50,  "% Closed at TP1",              group = "Risk Mgmt",     minval = 10,  maxval = 90,  step = 5)
i_trailAtr      = input.float(1.0, "Trailing Stop (ATR)",          group = "Risk Mgmt",     minval = 0.25, maxval = 3.0, step = 0.25)
i_maxRiskPct    = input.float(1.0, "Max Risk per Trade (% equity)",group = "Risk Mgmt",     minval = 0.25, maxval = 5.0,

