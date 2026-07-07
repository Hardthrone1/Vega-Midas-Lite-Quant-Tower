---
type: community
cohesion: 0.27
members: 12
---

# Parity Validation Engine

**Cohesion:** 0.27 - loosely connected
**Members:** 12 nodes

## Members
- [[Load Pine CSV truth export.]] - rationale - parity_validator.py
- [[Load backtest payload.]] - rationale - parity_validator.py
- [[Match Python trades to Pine trades.     Returns (matched, unmatched_python, unma]] - rationale - parity_validator.py
- [[Normalize datetime for comparison (ignore timezonemicroseconds).]] - rationale - parity_validator.py
- [[Parity Validator Compare Python backtest vs Pine truth  Loads backtest_payload.]] - rationale - parity_validator.py
- [[Trade_3]] - code - parity_validator.py
- [[load_payload()]] - code - parity_validator.py
- [[load_pine_truth()]] - code - parity_validator.py
- [[main()_3]] - code - parity_validator.py
- [[match_trades()]] - code - parity_validator.py
- [[normalize_dt()]] - code - parity_validator.py
- [[parity_validator.py]] - code - parity_validator.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Parity_Validation_Engine
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_Backtest Payload Models]]

## Top bridge nodes
- [[load_payload()]] - degree 4, connects to 1 community