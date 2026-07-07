---
type: community
cohesion: 0.05
members: 93
---

# Backtest Payload Models

**Cohesion:** 0.05 - loosely connected
**Members:** 93 nodes

## Members
- [[.__init__()_1]] - code - parity_engine/engine.py
- [[.__init__()_2]] - code - parity_engine/expressions.py
- [[._atr_length_from_spec()]] - code - parity_engine/engine.py
- [[._bar_context()]] - code - parity_engine/engine.py
- [[._build_fill()]] - code - parity_engine/engine.py
- [[._check_stop_target()]] - code - parity_engine/engine.py
- [[._commission()]] - code - parity_engine/engine.py
- [[._evaluate_entry()]] - code - parity_engine/engine.py
- [[._open_trade()]] - code - parity_engine/engine.py
- [[._resolve_stop()]] - code - parity_engine/engine.py
- [[._resolve_target()]] - code - parity_engine/engine.py
- [[.consume()]] - code - parity_engine/expressions.py
- [[.from_dict()]] - code - parity_engine/contract.py
- [[.gross_pnl()]] - code - parity_engine/engine.py
- [[.is_open()]] - code - parity_engine/engine.py
- [[.net_pnl()]] - code - parity_engine/engine.py
- [[.parse()]] - code - parity_engine/expressions.py
- [[.parse_and()]] - code - parity_engine/expressions.py
- [[.parse_comparison()]] - code - parity_engine/expressions.py
- [[.parse_not()]] - code - parity_engine/expressions.py
- [[.parse_or()]] - code - parity_engine/expressions.py
- [[.parse_primary()]] - code - parity_engine/expressions.py
- [[.peek()]] - code - parity_engine/expressions.py
- [[.run()]] - code - parity_engine/engine.py
- [[.to_dict()_1]] - code - parity_engine/engine.py
- [[Any]] - code
- [[Asset]] - code - parity_engine/contract.py
- [[BacktestPayload]] - code - parity_engine/contract.py
- [[Bar]] - code - parity_engine/engine.py
- [[Build a Fill, applying slippage and commission.]] - rationale - parity_engine/engine.py
- [[Build expression evaluation context for bar i.]] - rationale - parity_engine/engine.py
- [[CLI entry point and parity harness.  Usage     python run.py payload.json ba]] - rationale - parity_engine/run.py
- [[Check intrabar stoptarget touch. Returns exit Fill or None.]] - rationale - parity_engine/engine.py
- [[Compare our trades against a reference (Pine export or prior run).      Return]] - rationale - parity_engine/run.py
- [[Condition]] - code - parity_engine/contract.py
- [[Convert a list of plain dicts (from CSV or JSON) into Bar objects.]] - rationale - parity_engine/engine.py
- [[Create and return a Trade by filling pending at bar open or close.]] - rationale - parity_engine/engine.py
- [[Deterministic indicators that must match TradingView's `ta.` semantics.  Pine]] - rationale - parity_engine/indicators.py
- [[Edge metrics — same definitions the Quant Lab dashboard displays.  Consumes En]] - rationale - parity_engine/metrics.py
- [[Engine]] - code - parity_engine/engine.py
- [[EngineResult]] - code - parity_engine/engine.py
- [[Entry]] - code - parity_engine/contract.py
- [[Evaluate a boolean expression against a context of indicator values.]] - rationale - parity_engine/expressions.py
- [[Execution]] - code - parity_engine/contract.py
- [[Exit]] - code - parity_engine/contract.py
- [[ExpressionError]] - code - parity_engine/expressions.py
- [[Fill]] - code - parity_engine/engine.py
- [[Package init for parity_engine.]] - rationale - parity_engine/__init__.py
- [[Parser]] - code - parity_engine/expressions.py
- [[Return 'long''short' if entry conditions fire, else None.]] - rationale - parity_engine/engine.py
- [[Return (tickSize, pointValue), filling from INSTRUMENT_DEFAULTS by prefix.]] - rationale - parity_engine/contract.py
- [[Returns a flat dict of all edge metrics.     Trades are Trade objects from engi]] - rationale - parity_engine/metrics.py
- [[Returns float  bool depending on context. Comparisons always return bool.]] - rationale - parity_engine/expressions.py
- [[Safe evaluator for spec entry-condition `expression` strings.  The spec stores]] - rationale - parity_engine/expressions.py
- [[Session]] - code - parity_engine/contract.py
- [[Sizing]] - code - parity_engine/contract.py
- [[Smoke-test for the parity engine — run with python -m parity_engine.smoketest]] - rationale - parity_engine/smoketest.py
- [[Trade_1]] - code - parity_engine/engine.py
- [[Trade_2]] - code
- [[Typed Python mirror of the dashboard's PythonBacktestPayload contract.  Source]] - rationale - parity_engine/contract.py
- [[ValueError]] - code
- [[Vega Parity Engine — bar-by-bar strategy executor.  Mirrors TradingView Pine]] - rationale - parity_engine/engine.py
- [[Wilder's RMA — exactly what Pine's ta.atr  ta.rma use.]] - rationale - parity_engine/indicators.py
- [[__init__.py]] - code - parity_engine/__init__.py
- [[_cvar()]] - code - parity_engine/metrics.py
- [[_empty_metrics()]] - code - parity_engine/metrics.py
- [[_sharpe()]] - code - parity_engine/metrics.py
- [[_sortino()]] - code - parity_engine/metrics.py
- [[_trade_to_dict()]] - code - parity_engine/engine.py
- [[_var()]] - code - parity_engine/metrics.py
- [[atr()]] - code - parity_engine/indicators.py
- [[bars_from_dicts()]] - code - parity_engine/engine.py
- [[compute_metrics()]] - code - parity_engine/metrics.py
- [[contract.py]] - code - parity_engine/contract.py
- [[ema()]] - code - parity_engine/indicators.py
- [[engine.py]] - code - parity_engine/engine.py
- [[eval_node()]] - code - parity_engine/expressions.py
- [[evaluate()]] - code - parity_engine/expressions.py
- [[expressions.py]] - code - parity_engine/expressions.py
- [[indicators.py]] - code - parity_engine/indicators.py
- [[load_bars_csv()]] - code - parity_engine/run.py
- [[main()_2]] - code - parity_engine/run.py
- [[metrics.py]] - code - parity_engine/metrics.py
- [[parity_check()]] - code - parity_engine/run.py
- [[parse_expression()]] - code - parity_engine/expressions.py
- [[resolve_economics()]] - code - parity_engine/contract.py
- [[rma()]] - code - parity_engine/indicators.py
- [[run.py]] - code - parity_engine/run.py
- [[sma()]] - code - parity_engine/indicators.py
- [[smoketest.py]] - code - parity_engine/smoketest.py
- [[ta.atr(length) — RMA of true range.]] - rationale - parity_engine/indicators.py
- [[tokenize()]] - code - parity_engine/expressions.py
- [[true_range()]] - code - parity_engine/indicators.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Backtest_Payload_Models
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_Parity Bridge Utility]]
- 1 edge to [[_COMMUNITY_Parity Validation Engine]]

## Top bridge nodes
- [[Any]] - degree 7, connects to 2 communities