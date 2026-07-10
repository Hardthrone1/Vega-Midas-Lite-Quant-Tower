---
name: midas-quant
description: >
  Run a backtest on OHLCV bars using the parity engine, compute edge metrics
  (win rate, profit factor, Sharpe, max drawdown, Kelly), and optionally validate
  against Pine Script truth trades. Returns a JSON QunatResult with trades, metrics,
  and parity status. Trigger: /midas-quant or when the agent needs backtest analytics.
version: 1.0.0
author: MIDAS
license: MIT
dependencies: []
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Backtest, Quant, Parity, Metrics, Edge Analysis, Runtime Skill]
    skill_id: AGT-QNT-001
    runtime_skill: true
---

# MIDAS Quant — Backtest & Edge Analytics

Run backtests via the parity engine and compute full edge metrics. Optionally
validate Python trades against Pine Script truth for parity assurance.

## When to use

- Run a backtest on new bar data and get trade list + metrics.
- Compute edge analytics (EV, R-multiple, Sharpe, Sortino, Kelly, VaR/CVaR).
- Validate Python backtest output against Pine Script truth CSV.
- Feed quant results into Synthesis skill for decision aggregation.

**Do not use** for market structure analysis (use midas-structure) or
Pine Script generation (use claude-code-print).

## How to run

From the directory containing this SKILL.md:

```bash
python midas_quant.py --bars path/to/bars.csv --payload path/to/payload.json --output quant_result.json
```

Optional parity validation:

```bash
python midas_quant.py --bars bars.csv --payload payload.json --pine-truth pine_truth.csv --output quant_result.json
```

Or import and call `run_quant(bars_path, payload_path, pine_truth_path=None)`.

## Result contract

```json
{
  "skill_id": "AGT-QNT-001",
  "ok": true,
  "trade_count": 156,
  "metrics": {
    "net_pnl": -652.5,
    "win_rate": 0.442,
    "profit_factor": 0.93,
    "max_drawdown": -1387.5,
    "sharpe": -0.12,
    "sortino": -0.08,
    "kelly": 0.02,
    "ev_per_trade": -4.18
  },
  "parity": {
    "matched": 156,
    "unmatched": 1,
    "pass": false
  }
}
```
