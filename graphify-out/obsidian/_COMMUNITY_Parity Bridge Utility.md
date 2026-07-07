---
type: community
cohesion: 0.20
members: 14
---

# Parity Bridge Utility

**Cohesion:** 0.20 - loosely connected
**Members:** 14 nodes

## Members
- [[BacktestConfig]] - code - backtest_to_parity.py
- [[ClosedTrade]] - code - backtest_to_parity.py
- [[ContractSpec]] - code - backtest_to_parity.py
- [[Full payload for parity validation.]] - rationale - backtest_to_parity.py
- [[Instrument tick economics.]] - rationale - backtest_to_parity.py
- [[Liquidity Sweep → Parity Engine Bridge  Runs liquidity_sweep backtester and feed]] - rationale - backtest_to_parity.py
- [[PythonBacktestPayload]] - code - backtest_to_parity.py
- [[Run backtest and build full payload for parity validation.]] - rationale - backtest_to_parity.py
- [[Run liquidity_sweep backtest, return closed trades.     This mirrors liquidity_s]] - rationale - backtest_to_parity.py
- [[Trade record from backtester.]] - rationale - backtest_to_parity.py
- [[backtest_to_parity.py]] - code - backtest_to_parity.py
- [[build_payload()]] - code - backtest_to_parity.py
- [[main()]] - code - backtest_to_parity.py
- [[run_backtest()]] - code - backtest_to_parity.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Parity_Bridge_Utility
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_Backtest Payload Models]]

## Top bridge nodes
- [[run_backtest()]] - degree 5, connects to 1 community