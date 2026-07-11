---
name: midas-codegen
description: >
  Generate Pine Script v5 and Python backtest code from a single canonical
  StrategySpec. Prevents Pine/Python drift by producing both outputs from one
  source of truth. Includes anti-cheat linting (barstate.isconfirmed, no
  lookahead, trap detection).
  Trigger: /midas-codegen or when generating strategy code for parity validation.
version: 1.0.0
author: MIDAS
license: MIT
dependencies: []
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Code Generation, Pine Script, Python, Parity, Strategy Spec, Runtime Skill]
    skill_id: AGT-CDG-001
    runtime_skill: true
---

# MIDAS Codegen — Canonical Pine/Python Strategy Generator

Generate both Pine Script v5 and Python backtest code from a single
`StrategySpec` so they cannot drift apart.

## When to use

- Generating a new strategy for TradingView (Pine) and parity_engine (Python)
- Updating strategy parameters and regenerating both outputs
- Linting Pine Script for anti-cheat violations before deployment

## How to run

From the directory containing this SKILL.md:

```bash
python midas_codegen.py --preset mgc --output-dir ./output
```

Or import:

```python
from codegen.strategy_spec import StrategySpec
from codegen.pine_gen import generate as pine_gen
from codegen.python_gen import generate_payload

spec = StrategySpec.liquidity_sweep_mgc()
pine_code = pine_gen(spec)
payload = generate_payload(spec)
```

## Result contract

```json
{
  "skill_id": "AGT-CDG-001",
  "ok": true,
  "pine_code": "// @version=5\nstrategy(...)",
  "payload": { "schemaVersion": 1, ... },
  "lint": { "passed": true, "violations": [], "warnings": [...] },
  "spec_hash": "abc123"
}
```

## Locked decisions honored

- Pine Script + Python = both generated from one canonical spec (cannot drift)
- barstate.isconfirmed required on strategy.entry()
- Anti-cheat lint: no lookahead, no indicator stacking, trap detection
