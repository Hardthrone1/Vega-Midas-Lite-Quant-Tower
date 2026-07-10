---
name: midas-structure
description: >
  Analyze market structure on OHLCV bars: pivot detection, bull/bear break counting,
  leg-break gate (brk#1 strongest, brk#3 dead zone), and 66.5% retrace filter.
  Returns a JSON StructureResult with swing levels, break state, and entry gate status.
  Trigger: /midas-structure or when the agent needs break/retrace analysis on bar data.
version: 1.0.0
author: MIDAS
license: MIT
dependencies: []
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Market Structure, Pivot Detection, Break Analysis, Retrace Filter, Runtime Skill]
    skill_id: AGT-STR-001
    runtime_skill: true
---

# MIDAS Structure — Market Structure Analysis

Analyze OHLCV bar data for structural breaks, pivot levels, and retrace filters.
This is a *runtime* skill: the agent calls it inside the loop to evaluate market
structure before generating entries.

## When to use

- Detect pivot highs/lows on any timeframe bar series.
- Count bull/bear breaks and apply the leg-break gate (brk#1 strongest, brk#3 dead zone).
- Apply the 66.5% retrace filter to confirm structural entries.
- Feed structure state into Quant or Synthesis skills downstream.

**Do not use** for trade execution, backtesting, or Pine Script generation — those
are separate skills.

## How to run

From the directory containing this SKILL.md:

```bash
python midas_structure.py --bars path/to/bars.csv --pivot-len 3 --output structure_result.json
```

Or import and call `analyze(bars, pivot_len=3)` which returns a `StructureResult`.

## Result contract

```json
{
  "skill_id": "AGT-STR-001",
  "ok": true,
  "swing_high": 4185.5,
  "swing_low": 4170.2,
  "leg_dir": -1,
  "break_count": 2,
  "break_label": "brk#2",
  "gate_open": true,
  "retrace_pct": 0.665,
  "retrace_valid": true,
  "pivots_detected": 24,
  "bars_analyzed": 500
}
```

## Locked decisions honored

- brk#1 strongest; brk#3 is dead zone (gated out)
- 66.5% retrace = real structural filter
- Pivot detection matches Pine `ta.pivothigh`/`ta.pivotlow` semantics
