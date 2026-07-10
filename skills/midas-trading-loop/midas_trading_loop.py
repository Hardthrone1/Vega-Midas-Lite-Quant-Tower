"""
midas_trading_loop.py — Full MIDAS trading analysis orchestrator.

Skill ID:   AGT-LOOP-001
Phase:      5
Status:     LIVE — wires all 6 MIDAS skills into a single pipeline.

Pipeline:
  1. Structure (AGT-STR-001) — pivot/break/retrace analysis
  2. Quant (AGT-QNT-001) — backtest + edge metrics + parity
  3. Claude Code (AGT-CCP-001) — Pine Script generation (optional)
  4. Synthesis (AGT-SYN-001) — aggregate → GO/NO-GO/CAUTION
  5. Log (AGT-LOG-001) — persist to Obsidian + MEMORY.md

Router (AGT-RTR-001) is available on-demand for any LLM calls.
"""

from __future__ import annotations

import json
import sys
import time
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any, Optional

SKILL_ID = "AGT-LOOP-001"

SKILLS_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SKILLS_DIR.parent))


@dataclass
class LoopResult:
    skill_id: str
    ok: bool
    verdict: str = ""
    confidence: float = 0.0
    skills_run: list[str] = field(default_factory=list)
    skills_skipped: list[str] = field(default_factory=list)
    skills_failed: list[str] = field(default_factory=list)
    duration_ms: int = 0
    logged_to: dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _load_skill(skill_dir: str, module_name: str):
    skill_path = SKILLS_DIR / skill_dir
    if str(skill_path) not in sys.path:
        sys.path.insert(0, str(skill_path))
    return __import__(module_name)


def run_loop(
    bars_path: str,
    directive: str = "",
    payload_path: Optional[str] = None,
    pine_truth_path: Optional[str] = None,
    vault_path: Optional[str] = None,
    memory_path: Optional[str] = None,
    generate_code: bool = False,
    code_prompt: Optional[str] = None,
    pivot_len: int = 3,
) -> LoopResult:
    t0 = time.monotonic()
    skills_run = []
    skills_skipped = []
    skills_failed = []
    details = {}

    if not bars_path or not Path(bars_path).exists():
        return LoopResult(SKILL_ID, ok=False, error=f"bars file not found: {bars_path}")

    # --- 1. Structure ---
    try:
        structure_mod = _load_skill("midas-structure", "midas_structure")
        bars = structure_mod.load_bars_csv(bars_path)
        structure_result = structure_mod.analyze(bars, pivot_len=pivot_len)
        details["structure"] = structure_result.to_dict()
        skills_run.append("structure")
        if not structure_result.ok:
            skills_failed.append("structure")
    except Exception as e:
        details["structure"] = {"ok": False, "error": str(e)}
        skills_failed.append("structure")
        skills_run.append("structure")

    # --- 2. Quant ---
    try:
        quant_mod = _load_skill("midas-quant", "midas_quant")
        quant_result = quant_mod.run_quant(bars_path, payload_path, pine_truth_path)
        details["quant"] = quant_result.to_dict()
        skills_run.append("quant")
        if not quant_result.ok:
            skills_failed.append("quant")
    except Exception as e:
        details["quant"] = {"ok": False, "error": str(e)}
        skills_failed.append("quant")
        skills_run.append("quant")

    # --- 3. Claude Code (optional) ---
    code_result_dict = None
    if generate_code and code_prompt:
        try:
            code_mod = _load_skill("claude-code-print", "claude_code_print")
            code_result = code_mod.run(code_prompt)
            code_result_dict = code_result.to_dict()
            details["claude_code"] = code_result_dict
            skills_run.append("claude-code")
            if not code_result.ok:
                skills_failed.append("claude-code")
        except Exception as e:
            details["claude_code"] = {"ok": False, "error": str(e)}
            skills_failed.append("claude-code")
            skills_run.append("claude-code")
    else:
        skills_skipped.append("claude-code")

    # --- 4. Synthesis ---
    try:
        synth_mod = _load_skill("midas-synthesis", "midas_synthesis")
        synth_result = synth_mod.synthesize(
            details.get("structure", {}),
            details.get("quant", {}),
            code_result_dict,
        )
        details["synthesis"] = synth_result.to_dict()
        skills_run.append("synthesis")
        if not synth_result.ok:
            skills_failed.append("synthesis")
    except Exception as e:
        details["synthesis"] = {"ok": False, "error": str(e)}
        skills_failed.append("synthesis")
        skills_run.append("synthesis")

    # --- 5. Log ---
    logged_to = {}
    synth_dict = details.get("synthesis", {})
    try:
        log_mod = _load_skill("midas-log", "midas_log")
        log_input = {**synth_dict}
        if "metrics" in details.get("quant", {}):
            log_input["metrics"] = details["quant"]["metrics"]
            log_input["trade_count"] = details["quant"].get("trade_count", 0)
            log_input["parity"] = details["quant"].get("parity")

        log_result = log_mod.log_result(
            log_input,
            vault_path=vault_path,
            memory_path=memory_path or "MEMORY.md",
        )
        details["log"] = log_result.to_dict()
        skills_run.append("log")
        logged_to = {
            "vault": log_result.vault_note,
            "memory": log_result.memory_appended,
        }
        if not log_result.ok:
            skills_failed.append("log")
    except Exception as e:
        details["log"] = {"ok": False, "error": str(e)}
        skills_failed.append("log")
        skills_run.append("log")

    duration_ms = int((time.monotonic() - t0) * 1000)

    verdict = synth_dict.get("verdict", "UNKNOWN")
    confidence = synth_dict.get("confidence", 0.0)
    all_ok = len(skills_failed) == 0

    return LoopResult(
        skill_id=SKILL_ID,
        ok=all_ok,
        verdict=verdict,
        confidence=confidence,
        skills_run=skills_run,
        skills_skipped=skills_skipped,
        skills_failed=skills_failed,
        duration_ms=duration_ms,
        logged_to=logged_to,
        details=details,
    )


SKILL_DESCRIPTOR = {
    "id": SKILL_ID,
    "name": "MIDAS Trading Loop",
    "entrypoint": run_loop,
    "phase": 5,
    "runtime_skill": True,
}


def _main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(prog="midas_trading_loop", description="Full MIDAS trading loop orchestrator.")
    ap.add_argument("--bars", required=True, help="OHLCV CSV path")
    ap.add_argument("--directive", default="", help="trading directive string")
    ap.add_argument("--payload", help="backtest payload JSON")
    ap.add_argument("--pine-truth", help="Pine Script truth CSV for parity")
    ap.add_argument("--vault-path", help="Obsidian vault directory")
    ap.add_argument("--memory-path", default="MEMORY.md", help="MEMORY.md file path")
    ap.add_argument("--generate-code", action="store_true", help="run Claude Code skill")
    ap.add_argument("--code-prompt", help="prompt for Claude Code skill")
    ap.add_argument("--pivot-len", type=int, default=3)
    ap.add_argument("--output", help="write JSON result to file")
    args = ap.parse_args(argv)

    result = run_loop(
        bars_path=args.bars,
        directive=args.directive,
        payload_path=args.payload,
        pine_truth_path=args.pine_truth,
        vault_path=args.vault_path,
        memory_path=args.memory_path,
        generate_code=args.generate_code,
        code_prompt=args.code_prompt,
        pivot_len=args.pivot_len,
    )
    out = json.dumps(result.to_dict(), indent=2)
    print(out)
    if args.output:
        Path(args.output).write_text(out, encoding="utf-8")
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(_main())
