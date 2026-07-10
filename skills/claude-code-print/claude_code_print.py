"""
claude_code_print.py  —  Claude Code Print Mode, as a Hermes runtime skill.

Skill ID:   AGT-CCP-001  (Claude Code Print Mode)
Layer:      Agent Core dispatch (runtime skill, NOT a dev-time tool)
Phase:      5
Status:     LIVE-CAPABLE standalone today; registry/sandbox seams are DESIGNED.

WHAT THIS IS (honest scope)
---------------------------
This shells out to the real `claude` CLI in print mode (`claude -p ... 
--output-format json`) and returns a structured result. It runs standalone on a
Windows box where `claude` is already installed and logged in (subscription auth).

What is REAL here:
  - the subprocess call to the actual CLI (flags verified against current docs)
  - the SkillResult contract shape (drops into skill_registry.py / AGT-011 later)
  - graceful, explicit failure when the CLI is missing or errors (no fake success)

What is a SEAM, not yet built:
  - `run_in_sandbox` hook for OpenShell / NemoClaw (PLT-005). Right now it is a
    pass-through that calls subprocess directly. When PLT-005 exists, swap the
    body of `_execute` for a sandbox dispatch. The signature will not change.
  - registry auto-loading (AGT-011 skill_registry.py is DESIGNED). For now you
    import and call `run()` directly.

LOCKED CONSTRAINTS honored:
  - max_turns defaults to a bounded value; never an uncapped loop.
  - Windows/PowerShell friendly: no Unix-only flags, paths handled via os/pathlib.
  - This is a runtime skill, per v0.17 lock-in. Not LangGraph. Not dev-only.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys as _sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Skill contract  (mirror of the eventual AGT-011 SkillResult shape)
# ---------------------------------------------------------------------------

SKILL_ID = "AGT-CCP-001"
SKILL_NAME = "Claude Code Print Mode"

# Bounded by design. The system's hard per-turn cap is 8192 tokens elsewhere;
# here the analogous guard is turn count, so a stuck agent loop cannot run away.
DEFAULT_MAX_TURNS = 8
DEFAULT_TIMEOUT_S = 300


@dataclass
class SkillResult:
    """Uniform return shape every Hermes skill produces.

    `ok` is the single source of truth for success. Callers (Curator, GEPA,
    logger) branch on `ok` — never on the presence of `text`, because an empty
    or partial CLI response must read as failure, not silent success.
    """
    skill_id: str
    ok: bool
    text: str = ""                       # the model's final answer (result field)
    raw: dict[str, Any] = field(default_factory=dict)  # full JSON envelope
    error: Optional[str] = None
    meta: dict[str, Any] = field(default_factory=dict)  # cost, turns, duration, session

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Internal execution seam
# ---------------------------------------------------------------------------

def _build_argv(
    prompt: str,
    workdir: Optional[str],
    max_turns: int,
    allowed_tools: Optional[list[str]],
    model: Optional[str],
    permission_mode: Optional[str],
    add_dirs: Optional[list[str]],
    extra_args: Optional[list[str]],
) -> list[str]:
    """Construct the claude CLI argv. Flags verified against current CLI docs:
    -p / --print, --output-format json, --max-turns, --allowedTools, --model,
    --permission-mode, --add-dir.  There is NO --workdir or --effort flag —
    working directory is the process cwd (see _execute); do not reintroduce them.
    """
    argv: list[str] = ["claude", "-p", prompt, "--output-format", "json"]
    argv += ["--max-turns", str(max_turns)]

    if allowed_tools:
        # CLI takes a comma-separated list, e.g. "Read,Write,Bash(git commit:*)"
        argv += ["--allowedTools", ",".join(allowed_tools)]
    if model:
        argv += ["--model", model]
    if permission_mode:
        # e.g. "acceptEdits" so a headless Write/Edit isn't blocked on a prompt
        argv += ["--permission-mode", permission_mode]
    for d in add_dirs or []:
        argv += ["--add-dir", d]
    if extra_args:
        argv += list(extra_args)
    return argv


def _execute(
    argv: list[str],
    workdir: Optional[str],
    timeout_s: int,
) -> subprocess.CompletedProcess:
    """The sandbox seam.

    TODAY: direct subprocess call. The `claude` CLI is invoked in `workdir`
    (its --workdir behavior is just the process cwd here).

    LATER (PLT-005): replace the body with a call into OpenShell/NemoClaw so the
    process is filesystem/network/process isolated. Keep this signature stable.
    """
    cwd = workdir or os.getcwd()
    # shell=False is deliberate: argv is a list, so prompt content cannot be
    # interpreted by a shell. Safe on PowerShell and cmd alike.
    return subprocess.run(
        argv,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout_s,
        shell=False,
    )


# ---------------------------------------------------------------------------
# Public skill entry point
# ---------------------------------------------------------------------------

def run(
    prompt: str,
    workdir: Optional[str] = None,
    max_turns: int = DEFAULT_MAX_TURNS,
    allowed_tools: Optional[list[str]] = None,
    model: Optional[str] = None,
    permission_mode: Optional[str] = None,
    add_dirs: Optional[list[str]] = None,
    timeout_s: int = DEFAULT_TIMEOUT_S,
    extra_args: Optional[list[str]] = None,
) -> SkillResult:
    """Invoke Claude Code in print mode and return a SkillResult.

    Args:
        prompt:          the instruction, e.g. "Write a Pine Script v6 strategy for..."
        workdir:         directory the CLI runs in (defaults to cwd). On Windows pass
                         e.g. r"C:\\Users\\Softthrone\\Claude\\TradingView-Suite".
        max_turns:       bounded agent iterations (default 8). Never unbounded.
        allowed_tools:   restrict the CLI toolset, e.g. ["Read", "Write"].
        model:           optional model alias/string; omit to use the CLI default.
        permission_mode: e.g. "acceptEdits" so headless Write/Edit isn't blocked
                         on an interactive permission prompt.
        add_dirs:        extra directories the CLI may access beyond workdir.
        timeout_s:       hard wall-clock cap on the call.
        extra_args:      escape hatch for additional verified CLI flags.

    Returns:
        SkillResult. `ok=True` only when the CLI exited 0 AND returned a parseable
        success envelope AND a non-empty result. Anything else is ok=False with a
        plain-language `error`. No guessing, no fabricated output.
    """
    if not prompt or not prompt.strip():
        return SkillResult(SKILL_ID, ok=False, error="empty prompt")

    # 1. Is the CLI even here? Fail loudly rather than pretending.
    if shutil.which("claude") is None:
        return SkillResult(
            SKILL_ID, ok=False,
            error="`claude` CLI not found on PATH. Install Claude Code and ensure "
                  "you are logged in (subscription auth), then retry.",
        )

    # 2. Validate workdir if given.
    if workdir is not None and not Path(workdir).is_dir():
        return SkillResult(
            SKILL_ID, ok=False,
            error=f"workdir does not exist: {workdir}",
        )

    argv = _build_argv(prompt, workdir, max_turns, allowed_tools, model,
                       permission_mode, add_dirs, extra_args)

    # 3. Run it.
    try:
        proc = _execute(argv, workdir, timeout_s)
    except subprocess.TimeoutExpired:
        return SkillResult(
            SKILL_ID, ok=False,
            error=f"claude print-mode call exceeded timeout ({timeout_s}s)",
        )
    except OSError as e:
        return SkillResult(SKILL_ID, ok=False, error=f"failed to launch claude: {e}")

    # 4. Non-zero exit = failure. Surface stderr verbatim, don't paper over it.
    if proc.returncode != 0:
        return SkillResult(
            SKILL_ID, ok=False,
            error=f"claude exited {proc.returncode}: {(proc.stderr or '').strip()[:1000]}",
            meta={"returncode": proc.returncode},
        )

    # 5. Parse the JSON envelope.
    try:
        env = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return SkillResult(
            SKILL_ID, ok=False,
            error="claude returned non-JSON output (unexpected for --output-format json)",
            raw={"stdout_head": (proc.stdout or "")[:1000]},
        )

    # 6. The CLI's own success flag. subtype == "error" means the run failed
    #    even though the process exited 0.
    subtype = env.get("subtype")
    if subtype == "error" or env.get("is_error") is True:
        return SkillResult(
            SKILL_ID, ok=False,
            error=f"claude reported an error result: {env.get('result', '')[:1000]}",
            raw=env,
        )

    result_text = (env.get("result") or "").strip()
    if not result_text:
        return SkillResult(
            SKILL_ID, ok=False,
            error="claude returned an empty result", raw=env,
        )

    # 7. Success — carry the useful metadata through for the logger / GEPA.
    #    usage holds the real input/output token counts the CLI reports, so the
    #    token-budget requirement is satisfied natively — no proxy needed to
    #    *measure* (a compression layer would be a separate concern).
    usage = env.get("usage") or {}
    return SkillResult(
        SKILL_ID, ok=True,
        text=result_text,
        raw=env,
        meta={
            "total_cost_usd": env.get("total_cost_usd"),
            "num_turns": env.get("num_turns"),
            "duration_ms": env.get("duration_ms"),
            "session_id": env.get("session_id"),
            "input_tokens": usage.get("input_tokens"),
            "output_tokens": usage.get("output_tokens"),
        },
    )


def log_usage_csv(path: str, result: SkillResult, prompt: str) -> None:
    """Append one token-usage row for this call. Opt-in (the CLI --log-csv flag
    or a caller); writes a header on first use. Best-effort: a logging failure
    never turns a successful skill run into a failure."""
    import csv
    import datetime as _dt

    m = result.meta or {}
    row = {
        "timestamp": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "skill_id": result.skill_id,
        "ok": result.ok,
        "input_tokens": m.get("input_tokens"),
        "output_tokens": m.get("output_tokens"),
        "num_turns": m.get("num_turns"),
        "total_cost_usd": m.get("total_cost_usd"),
        "duration_ms": m.get("duration_ms"),
        "prompt_head": (prompt or "")[:80].replace("\n", " "),
    }
    try:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        write_header = not p.exists()
        with p.open("a", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(row))
            if write_header:
                w.writeheader()
            w.writerow(row)
    except OSError as e:
        # surface to stderr but do not raise — logging is not the skill's job
        print(f"[claude_code_print] usage-log write failed: {e}", file=_sys.stderr)


# ---------------------------------------------------------------------------
# Registry descriptor  —  what skill_registry.py (AGT-011) will read later.
# Importing this module and reading SKILL_DESCRIPTOR is enough to register it;
# no framework needed today.
# ---------------------------------------------------------------------------

SKILL_DESCRIPTOR = {
    "id": SKILL_ID,
    "name": SKILL_NAME,
    "entrypoint": run,
    "phase": 5,
    "runtime_skill": True,        # per v0.17 lock-in: runtime, not dev-only
    "sandbox": "PLT-005",         # intended isolation home (not yet built)
    "bounded": {"max_turns_default": DEFAULT_MAX_TURNS, "timeout_s": DEFAULT_TIMEOUT_S},
}


def _main(argv: Optional[list[str]] = None) -> int:
    """CLI entry point. The hermes agent shells out to this (per the SKILL.md),
    reads the JSON SkillResult from stdout, and branches on `ok`. Exit code is
    0 on success, 1 on any failure — so a shell caller can gate on it too."""
    import argparse

    ap = argparse.ArgumentParser(
        prog="claude_code_print",
        description="Claude Code print mode as a Hermes skill. Emits a JSON SkillResult.",
    )
    ap.add_argument("prompt", help="the instruction for Claude Code")
    ap.add_argument("--workdir", help="directory to run in (defaults to cwd)")
    ap.add_argument("--max-turns", type=int, default=DEFAULT_MAX_TURNS)
    ap.add_argument("--allowed-tools", help="comma-separated, e.g. 'Read,Write,Bash(git commit:*)'")
    ap.add_argument("--model", help="model alias/string; omit for CLI default")
    ap.add_argument("--permission-mode", help="e.g. acceptEdits for headless writes")
    ap.add_argument("--add-dir", action="append", dest="add_dirs",
                    help="extra accessible dir (repeatable)")
    ap.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_S, dest="timeout_s")
    ap.add_argument("--log-csv", help="append a token-usage row to this CSV path")
    args = ap.parse_args(argv)

    result = run(
        args.prompt,
        workdir=args.workdir,
        max_turns=args.max_turns,
        allowed_tools=args.allowed_tools.split(",") if args.allowed_tools else None,
        model=args.model,
        permission_mode=args.permission_mode,
        add_dirs=args.add_dirs,
        timeout_s=args.timeout_s,
    )
    if args.log_csv:
        log_usage_csv(args.log_csv, result, args.prompt)
    print(json.dumps(result.to_dict(), indent=2))
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(_main())
