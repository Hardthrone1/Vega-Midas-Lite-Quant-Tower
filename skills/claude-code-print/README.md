# claude-code-print (AGT-CCP-001)

Hermes runtime skill that drives the real Claude Code CLI in **print mode**
(`claude -p ... --output-format json`) to author or fix code headlessly, and
returns a structured `SkillResult` with real token/turn/cost metadata.

- `SKILL.md` — the skill definition hermes discovers (schema mirrors the
  in-repo `caveman-*` skills). Tells the agent when and how to invoke it.
- `claude_code_print.py` — the executable. Import `run(...)`, or shell out:
  `python claude_code_print.py "<instruction>" [flags]` (prints JSON, exits
  0/1). `SKILL_DESCRIPTOR` is the registry shape for AGT-011.

## Quick check (no real CLI needed)

```bash
# failure path — CLI absent
PATH="" python claude_code_print.py "hi"        # -> ok=false, exits 1

# success path — stub a `claude` on PATH that echoes a JSON envelope,
# then run against it (see the tests in the PR description).
```

## Honest status

- **Real today:** the subprocess call, correct flags, strict success/failure on
  the CLI's own `ok`, native token accounting, opt-in `--log-csv`.
- **Seams (designed, not built):** sandbox isolation (PLT-005) wraps `_execute`
  later; registry auto-load (AGT-011) reads `SKILL_DESCRIPTOR` later. Signatures
  are stable so neither is a rewrite.
- **No** `--workdir` / `--effort` flags exist in Claude Code — the skill's
  `--workdir` sets the process cwd; it is never passed to the `claude` argv.
