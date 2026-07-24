---
name: midas-walk-forward
description: >
  Walk-forward optimization over OHLCV bars: rolls in-sample/out-of-sample
  windows across the dataset, grid-searches the gate parameters (pivot_len,
  min/max_opp_breaks) on each IS window via the Pine-parity backtester, then
  judges the winner ONLY on the following OOS bars. Reports per-fold results,
  walk-forward efficiency (WFE), consensus params, and an overfit verdict.
  Trigger: /midas-walk-forward or when the agent must validate that optimized
  parameters survive out-of-sample.
version: 1.0.0
author: MIDAS
license: MIT
dependencies: []
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Walk-Forward, Optimization, Anti-Overfit, OOS, Quant, Runtime Skill]
    skill_id: QBT-002
    runtime_skill: true
---

# MIDAS Walk-Forward — Out-of-Sample Parameter Validation

Rolling walk-forward optimization with the OOS fold as the structural
anti-overfit guard: parameters are *chosen* only on in-sample bars and
*judged* only on the unseen bars that follow.

## When to use

- Before trusting any parameter set that came out of a sweep or GEPA run.
- To measure how much of the in-sample edge survives out-of-sample (WFE).
- To find consensus parameters that win across multiple market windows.

**Do not use** for single-window backtests (use midas-quant) or regime
attribution (use midas-regime-slicer).

## How it works

1. The bar series is split into `--folds` equal spans; each span is
   `--is-ratio` in-sample, remainder out-of-sample (sliding, disjoint).
2. Every valid combo of `pivot_len` (2–8), `min_opp_breaks` (1–4),
   `max_opp_breaks` (2–6, ≥ min) — the same bounds GEPA evolves — is
   backtested on the IS window through `liquidity_sweep_backtester`
   (validated 100% against Pine truth).
3. Scoring is GEPA-shaped (pnl 0.30 · profit factor 0.25 · win rate 0.20 ·
   drawdown penalty 0.15 · trade-volume bonus 0.10). Param sets with fewer
   than `--min-trades` IS trades are disqualified outright.
4. The IS winner runs on the OOS window. Per-fold efficiency = OOS EV/trade
   ÷ IS EV/trade. Aggregate **WFE** is per-bar-normalized OOS pnl ÷ IS pnl.
5. Verdict: `ROBUST` (WFE ≥ 0.5 and ≥ half the folds profitable OOS),
   `MARGINAL` (WFE ≥ 0.25), else `OVERFIT`.

## How to run

From the repo root:

```bash
python skills/midas-walk-forward/midas_walk_forward.py --bars mgc_5m_et.csv --folds 4 --output walk_forward_report.json
```

Or import and call `walk_forward_optimize(bars_path, folds=4, is_ratio=0.7, min_trades=5)`.

## Output

`WalkForwardResult` JSON: `folds[]` (ranges, best_params, is/oos metrics,
efficiency), `consensus_params`, `param_stability` (share of folds won by the
consensus set), `wfe`, `oos_profitable_folds`, `verdict`.
