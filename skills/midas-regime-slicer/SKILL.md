---
name: midas-regime-slicer
description: >
  Regime-conditional backtest slicer: classifies every bar into one of four
  regimes (TREND_UP, TREND_DOWN, RANGE_QUIET, RANGE_VOLATILE) using
  trailing-only efficiency ratio + ATR percentile, runs the Pine-parity
  backtester (or slices an existing trade list), and reports the strategy's
  metrics broken out by the regime in force at each trade's entry.
  Trigger: /midas-regime-slicer or when the agent must know WHERE a
  strategy's edge lives and where it bleeds.
version: 1.0.0
author: MIDAS
license: MIT
dependencies: []
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Regime, Slicer, Attribution, Trend, Volatility, Quant, Runtime Skill]
    skill_id: QBT-003
    runtime_skill: true
---

# MIDAS Regime Slicer — Performance by Market Regime

Breaks a backtest out by the market regime in force at each entry, so a
single headline PnL can't hide "all the edge is in one regime and the other
three bleed."

## The four regimes

Trend gate first (Kaufman efficiency ratio over `--er-window` bars),
volatility split inside range (ATR(14) percentile over `--vol-lookback` bars):

| Regime | Condition |
|---|---|
| `TREND_UP` | ER ≥ threshold, net drift up |
| `TREND_DOWN` | ER ≥ threshold, net drift down |
| `RANGE_QUIET` | ER < threshold, ATR percentile < 0.5 |
| `RANGE_VOLATILE` | ER < threshold, ATR percentile ≥ 0.5 |

Classification is **trailing-only** — the label at bar *i* uses nothing after
bar *i* — so slicing entries by it introduces no lookahead.

## When to use

- After midas-quant or midas-walk-forward, to attribute the edge by regime.
- To decide regime filters (e.g. disable entries in the bleeding regime).
- To compare GEPA candidates on *where* they make money, not just how much.

**Do not use** for parameter search (midas-walk-forward) or plain backtests
(midas-quant).

## How to run

Run the backtester and slice its trades:

```bash
python skills/midas-regime-slicer/midas_regime_slicer.py --bars mgc_5m_et.csv --output regime_report.json
```

Slice an existing trade list (e.g. the committed parity run):

```bash
python skills/midas-regime-slicer/midas_regime_slicer.py --bars mgc_5m_et.csv --trades-json backtest_payload.json
```

Or import and call `regime_slice(bars_path, params=None, trades_json=None)`.

## Output

`RegimeSliceResult` JSON: `regime_coverage` (share of bars per regime),
`regimes` (per-regime trade_count, net_pnl, win_rate, profit_factor,
ev_per_trade, avg_win/loss, max_drawdown), `best_regime`, `worst_regime`,
classifier settings, and unclassified-trade count (warmup entries).
