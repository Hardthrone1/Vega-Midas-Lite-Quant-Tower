---
name: midas-router
description: >
  Route LLM calls through the MIDAS tier system: Tier 1 NVIDIA NIM (free),
  Tier 2 Gemini/Groq/Deepseek, Tier 3 OpenRouter (fallback). Handles 429 rate
  limits with automatic fallback chains. Returns the response + provider metadata.
  Trigger: /midas-router or when the agent needs to call an LLM with tier routing.
version: 1.0.0
author: MIDAS
license: MIT
dependencies: []
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Router, Model Selection, Tier System, LLM Gateway, Runtime Skill]
    skill_id: AGT-RTR-001
    runtime_skill: true
---

# MIDAS Router — Model Tier Selection

Route LLM calls through the locked tier system with automatic fallback on 429s.

## When to use

- Any time the agent needs to call an LLM (structure analysis, synthesis, code review).
- Automatically selects cheapest available provider per the tier system.
- Handles rate limits gracefully with exponential backoff + tier fallback.

## Tier system (locked)

1. **Tier 1**: NVIDIA NIM free endpoints (first choice)
2. **Tier 2**: Gemini, Groq, Deepseek
3. **Tier 3**: OpenRouter (fallback)

Free-tier models 429 heavily; paid/fallback chains expected.

## How to run

From the directory containing this SKILL.md:

```bash
python midas_router.py --prompt "Analyze this market structure" --task structure --output response.json
```

Or import and call `route(prompt, task="general", system_prompt=None)`.

## Result contract

```json
{
  "skill_id": "AGT-RTR-001",
  "ok": true,
  "text": "The market shows...",
  "provider": "nvidia_nim",
  "model": "meta/llama-3.1-8b-instruct",
  "tier": 1,
  "fallback_chain": ["nvidia_nim"],
  "latency_ms": 1204,
  "tokens": {"input": 450, "output": 230}
}
```
