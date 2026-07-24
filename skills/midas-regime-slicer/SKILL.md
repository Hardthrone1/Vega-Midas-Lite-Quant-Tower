---
name: midas-regime-slicer
description: >
  Regime-conditional backtest slicer: a faithful Python port of
  MIDAS_Regime_Filter.pine (v6). Classifies every bar into one of four
  confirmed regimes (TRENDING_EXPANDING, TRENDING_QUIET, RANGING_VOLATILE,
  RANGING_QUIET) via Kaufman efficiency ratio + Wilder ADX + an ATR fast/slow
  ratio with persistBars hysteresis, then reports the strategy's metrics
  broken out by the regime in force at each trade's entry.
  Trigger: /midas-regime-slicer or when the agent must know WHERE a
  strategy's edge lives and where it bleeds.
version: 1.1.0
author: MIDAS
license: MIT
dependencies: []
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Regime, Slicer, Attribution, Trend, Volatility, ADX, Quant, Runtime Skill]
    skill_id: QBT-003
    runtime_skill: true
---

# MIDAS Regime Slicer — Performance by Market Regime

Breaks a backtest out by the market regime in force at each entry, so a
single headline PnL can't hide "all the edge is in one regime and the other
three bleed."

## Canonical definition

The regimes are defined by **`MIDAS_Regime_Filter.pine`** (v6) in this
directory; `midas_regime_slicer.py` is a bit-for-bit Python port — same
inputs, same ER + ADX trend gate, same ATR fast/slow vol split, same
hysteresis. Keep the two in lockstep (the ADX leg is verified against an
independent Wilder ADX to 4 decimals).

## The four regimes

Trend gate = Kaufman **efficiency ratio** (`--er-len`, default 14) AND Wilder
**ADX** (`ta.dmi`, `--adx-len`). Volatility split = **ATR-fast / ATR-slow**
ratio (`ta.atr`, 14/100). A raw state must persist `--persist-bars` (3) bars
to confirm; the confirmed regime holds its last value until a new one confirms.

| Code | Regime | Condition |
|---|---|---|
| 1 | `TRENDING_EXPANDING` | ER ≥ 0.35 · ADX ≥ 20 · volRatio ≥ 1.15 |
| 2 | `TRENDING_QUIET` | trending, contracting (or neither) |
| 3 | `RANGING_VOLATILE` | ER ≤ 0.20 · ADX < 20 · volRatio ≥ 1.15 |
| 4 | `RANGING_QUIET` | ranging, contracting (or neither) |
| 0 | `UNCONFIRMED` | dead zone between thresholds, or warmup |

Classification is **trailing-only** — the label at bar *i* uses nothing after
bar *i* — so slicing entries by it introduces no lookahead. Trades on
`UNCONFIRMED` bars are reported as unclassified.

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

All Pine inputs are exposed as flags (`--er-len`, `--er-trend-min`,
`--er-range-max`, `--adx-len`, `--adx-trend-min`, `--atr-fast-len`,
`--atr-slow-len`, `--vol-expand-min`, `--vol-contract-max`, `--persist-bars`).
Or import and call `regime_slice(bars_path, settings=RegimeSettings(...))`.

## Output

`RegimeSliceResult` JSON: `regime_coverage` (share of confirmed bars per
regime), `regimes` (per-regime trade_count, net_pnl, win_rate, profit_factor,
ev_per_trade, avg_win/loss, max_drawdown), `best_regime`, `worst_regime`,
the full classifier settings, `unconfirmed_bar_share`, and unclassified-trade
count.
