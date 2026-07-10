---
name: midas-log
description: >
  Log skill results to Obsidian vault notes and MEMORY.md. Creates timestamped
  markdown notes with YAML frontmatter, tags, and trade metadata. Appends session
  summaries to MEMORY.md for cross-session context.
  Trigger: /midas-log or when the agent needs to persist results.
version: 1.0.0
author: MIDAS
license: MIT
dependencies: []
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Logging, Obsidian, Memory, Persistence, Runtime Skill]
    skill_id: AGT-LOG-001
    runtime_skill: true
---

# MIDAS Log — Obsidian + MEMORY.md Persistence

Persist skill results as Obsidian vault notes and session summaries in MEMORY.md.

## When to use

- After a trading loop completes (synthesis verdict produced).
- To log any skill result (structure, quant, code, synthesis) for later reference.
- To build cross-session memory via MEMORY.md.

## How to run

From the directory containing this SKILL.md:

```bash
python midas_log.py --result decision.json --vault-path ~/obsidian-vault --memory-path MEMORY.md
```

Or import and call `log_result(result_dict, vault_path=None, memory_path=None)`.

## Result contract

```json
{
  "skill_id": "AGT-LOG-001",
  "ok": true,
  "vault_note": "2026-07-10_midas_run_001.md",
  "memory_appended": true,
  "tags": ["#midas", "#backtest", "#mgc", "#go"]
}
```
