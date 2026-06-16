---
title: Liquidity Imbalance Reversal on Daily (setup-analysis)
date: 2026-06-16T07:50:00.568Z
tags: liquidity, reversal, analysis
winRate: null
confidence: 0.85
---

## Analysis
Price swept down 150 pips below key support, institutional buyer absorbed supply, reversal likely within 4H. Confluence: weekly level + volume profile node + stochastic divergence.

## Agent Results
## Claude Audit
//@version=5
strategy("Liquidity Imbalance Reversal", overlay=true)

// Strategy: Detect institutional liquidity sweeps
lookback = input(20, "Lookback Bars")

// Entry: Price reverses from imbalance level
entry_level = ta.lowest(low, lookback)
if close > entry_level + 50 and close[1] < entry_level
    strategy.entry("Long", strategy.long)

strategy.exit("TP", "Long", profit=150)

