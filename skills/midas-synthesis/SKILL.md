---
name: midas-synthesis
description: >
  Aggregate outputs from Structure, Quant, and Claude Code skills into a unified
  trade decision with confidence score, reasoning, and go/no-go verdict.
  Trigger: /midas-synthesis or when the agent needs to merge analysis results.
version: 1.0.0
author: MIDAS
license: MIT
dependencies: []
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Synthesis, Decision Aggregation, Trade Decision, Runtime Skill]
    skill_id: AGT-SYN-001
    runtime_skill: true
---

# MIDAS Synthesis — Decision Aggregation

Merge outputs from upstream skills (Structure, Quant, Claude Code) into a single
trade decision with confidence scoring and reasoning.

## When to use

- After Structure + Quant + Claude Code skills have all returned results.
- To produce a go/no-go trade verdict with confidence and reasoning.
- To feed a final decision into the Log skill for persistence.

## How to run

From the directory containing this SKILL.md:

```bash
python midas_synthesis.py --structure structure.json --quant quant.json --output decision.json
```

Or import and call `synthesize(structure_result, quant_result, code_result=None)`.

## Result contract

```json
{
  "skill_id": "AGT-SYN-001",
  "ok": true,
  "verdict": "GO",
  "confidence": 0.72,
  "reasoning": ["Structure gate open (brk#2)", "Quant PF 0.93 below 1.0 — marginal edge", "Parity 156/157 — acceptable"],
  "signals": {"structure": "GO", "quant": "CAUTION", "parity": "GO"},
  "risk_flags": ["profit_factor_below_1"]
}
```
