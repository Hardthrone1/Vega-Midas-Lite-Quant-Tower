# Vega Parity Engine

The **Python half** of the backtest→live bridge. The dashboard
(`Vega_code/src/shared/adapters/pythonBacktestAdapter.ts`) already emits a
deterministic `PythonBacktestPayload` JSON object from the canonical spec. This
package is the engine that **consumes that exact contract** and executes it
bar-by-bar the same way TradingView's Pine `strategy()` engine does.

> Why this exists: a TradingView backtest that "looks good" but "falls apart
> live" almost always fails because of three implicit assumptions — when an
> order is *evaluated* (bar close vs intrabar), when it is *filled* (this bar's
> close vs next bar's open), and what *slippage/commission* really cost. This
> engine makes all three explicit and identical to what you'll run live, so the
> backtest and the live path cannot silently diverge.

## The parity principle

```
canonical spec  ──►  Pine code      (deployed to TradingView)
      │
      └──────────►  PythonBacktestPayload  ──►  this engine
                                                    │
                          parity_harness compares ──┘  ►  divergence report
```

Pine and Python are both generated from the **same spec**, then a harness runs
both on the **same OHLCV** and fails the build if entry bar, exit bar, fill
price, or PnL diverge beyond tolerance.

## Files

| File | Role |
|---|---|
| `contract.py` | Typed mirror of `PythonBacktestPayload` (the TS contract). |
| `engine.py` | Bar-by-bar execution engine. Confirmed-bar gating, next-bar fills, ATR/RR stops, slippage, commission. |
| `indicators.py` | Deterministic indicators (ATR, SMA, EMA) — must match Pine's `ta.*`. |
| `expressions.py` | Safe evaluator for spec entry-condition `expression` strings. |
| `metrics.py` | +EV, R-multiple, profit factor, Sharpe, Sortino, max DD, Kelly, VaR. |
| `parity_harness.py` | Runs engine vs a Pine reference export, emits divergence report. |
| `run.py` | CLI: `python run.py payload.json bars.csv` → trades + metrics JSON. |

## Quick start

```bash
cd parity_engine
python run.py samples/payload.example.json samples/bars.example.csv
```

No third-party dependencies — pure standard library so it runs anywhere the
dashboard's gateway runs.

## How the engine mirrors Pine (the rules that close the gap)

1. **Evaluate on confirmed bars only** when `execution.confirmOnBarClose` is
   true. Signals are computed using bar `i`'s *closed* values; this matches
   Pine's `barstate.isconfirmed` live-safety gate.
2. **Fill on the next bar's open** unless `processOrdersOnClose` is true (then
   fill at the signal bar's close). This is the single most common cause of
   "great backtest, bad live": Pine fills market orders on the *next* bar by
   default.
3. **Slippage** is applied in the trade's direction, in ticks × tickSize.
4. **Commission** (`cash_per_contract` / `cash_per_order` / `percent`) is
   charged per fill, both entry and exit.
5. **Stops/targets** use the same ATR length/multiplier and RR multiple the spec
   carries, evaluated against the bar's high/low (intrabar touch) so live
   stop-outs match.
