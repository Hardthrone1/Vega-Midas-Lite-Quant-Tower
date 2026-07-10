---
name: midas-trading-loop
description: >
  Run the full MIDAS trading analysis loop: Structure → Quant → Claude Code →
  Synthesis → Router → Log. Orchestrates all 6 skills in sequence, feeding
  outputs downstream. Returns a unified loop result with per-skill status.
  Trigger: /midas-trading-loop "<directive>" or "hermes /midas-trading-loop ..."
version: 1.0.0
author: MIDAS
license: MIT
dependencies: []
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Orchestrator, Trading Loop, MIDAS Bundle, Runtime Skill]
    skill_id: AGT-LOOP-001
    runtime_skill: true
---

# MIDAS Trading Loop — Full Skill Orchestrator

Run the complete MIDAS analysis pipeline by orchestrating all 6 skills in sequence.

## When to use

- `hermes "/midas-trading-loop test with MGC 5m bar data"`
- Any time you need to run the full pipeline: structure analysis → backtest →
  code generation → synthesis → logging.

## Pipeline

```
1. Structure (AGT-STR-001)  — pivot/break/retrace analysis on bar data
2. Quant (AGT-QNT-001)      — backtest + edge metrics + optional parity check
3. Claude Code (AGT-CCP-001) — Pine Script generation (optional, if directive requests it)
4. Synthesis (AGT-SYN-001)  — aggregate signals → GO/NO-GO/CAUTION verdict
5. Log (AGT-LOG-001)        — persist to Obsidian vault + MEMORY.md
```

Router (AGT-RTR-001) is called on-demand by any skill that needs an LLM.

## How to run

From the directory containing this SKILL.md:

```bash
python midas_trading_loop.py --bars path/to/bars.csv --directive "test with MGC 5m bar data"
```

Or import and call `run_loop(bars_path, directive, **opts)`.

## Result contract

```json
{
  "skill_id": "AGT-LOOP-001",
  "ok": true,
  "verdict": "GO",
  "confidence": 0.72,
  "skills_run": ["structure", "quant", "synthesis", "log"],
  "skills_skipped": ["claude-code"],
  "duration_ms": 4521,
  "logged_to": {"vault": "2026-07-10_midas_run_1830.md", "memory": true}
}
```
