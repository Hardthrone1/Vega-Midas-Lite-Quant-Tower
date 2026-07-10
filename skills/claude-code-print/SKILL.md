---
name: claude-code-print
description: >
  Write, debug, or refactor code headlessly by driving the Claude Code CLI in
  print mode (`claude -p ... --output-format json`). Bounded, single-shot,
  tool-restricted. Returns a JSON SkillResult with the model's answer plus real
  token/turn/cost metadata. Use for Pine Script v6 and Python generation in the
  MIDAS/MGC pipeline. Trigger: /claude-code-print "<instruction>" or when the
  agent needs to author or fix code via Claude Code.
version: 1.0.0
author: MIDAS
license: MIT
dependencies: []
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Code Generation, Claude Code, Pine Script, Python, Headless, Runtime Skill]
    skill_id: AGT-CCP-001
    runtime_skill: true
---

# Claude Code — Print Mode

Drive the real `claude` CLI in non-interactive **print mode** as a Hermes
runtime skill. This is a *runtime* skill (per v0.17 lock-in), not a dev-time
tool: the agent calls it inside the loop to produce or fix code, then acts on
the structured result.

## When to use

- Author a Pine Script v6 strategy or indicator from a spec.
- Debug or refactor an existing Pine/Python file.
- Any single-shot "write code, save it, tell me what you did" task where an
  interactive editor session is overkill.

**Do not use** for open-ended chat, long multi-file refactors that need
supervision, or anything unbounded — this skill caps turns and wall-clock time
on purpose.

## Prerequisites (honest)

- `claude` CLI installed and on PATH, logged in (subscription auth). If it is
  missing, the skill returns `ok=false` with a plain error — it never fakes a
  result.
- Runs the CLI in the current process working directory. **There is no
  `--workdir` or `--effort` flag** — pass `--workdir` to *this skill* and it
  becomes the process cwd; do not add those to the `claude` argv.

## How to run

The executable lives next to this SKILL.md as `claude_code_print.py`. From the
directory containing this file:

```bash
python claude_code_print.py "<instruction>" \
  --workdir "C:\Users\Softthrone\Claude\Pine-Scripts" \
  --max-turns 8 \
  --allowed-tools "Read,Write,Bash(git add:*),Bash(git commit:*)" \
  --permission-mode acceptEdits \
  --log-csv "logs/midas-token-usage.csv"
```

It prints a JSON `SkillResult` to stdout and exits 0 on success, 1 on failure.
Equivalently, import and call `run(...)` (returns the same `SkillResult`); the
registry descriptor is `SKILL_DESCRIPTOR` at the bottom of the module.

## Result contract

Branch on `ok` — never on the presence of `text`. An empty or partial CLI
response reads as failure, not silent success.

```json
{
  "skill_id": "AGT-CCP-001",
  "ok": true,
  "text": "<the model's final answer>",
  "raw": { "...": "full claude JSON envelope" },
  "error": null,
  "meta": {
    "total_cost_usd": 0.0,
    "num_turns": 3,
    "duration_ms": 8421,
    "session_id": "…",
    "input_tokens": 1204,
    "output_tokens": 380
  }
}
```

`meta.input_tokens` / `meta.output_tokens` come straight from the CLI's own
`usage`, so the token-budget requirement is satisfied natively — no proxy is
needed just to *measure*. `--log-csv` appends one row per call (best-effort; a
logging failure never fails the run).

## Bounds (locked)

- `--max-turns` defaults to 8. Never invoke unbounded.
- `--timeout` defaults to 300s wall-clock.
- Restrict tools with `--allowed-tools`; use `--permission-mode acceptEdits`
  so a headless Write/Edit is not blocked on an interactive prompt.

## Seams (designed, not built)

- **Sandbox (PLT-005):** today the CLI runs via direct subprocess. When the
  OpenShell/NemoClaw isolation layer exists, swap the body of `_execute` for a
  sandbox dispatch — the signature stays the same.
- **Registry (AGT-011):** `SKILL_DESCRIPTOR` is the shape the registry will
  read. Until it exists, import and call `run()` directly.
