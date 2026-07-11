"""
agent_loop.py — Main Hermes dispatch loop.

Receives a directive, discovers skills via the registry, dispatches
the MIDAS pipeline with Curator failure handling and GEPA scoring.

Usage:
    python -m hermes.agent_loop --bars path/to/bars.csv --directive "test MGC 5m"

Or import and call:
    from hermes.agent_loop import run
    result = run("test MGC 5m", config)
"""

from __future__ import annotations

import json
import sys
import time
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any, Optional

from hermes.skill_registry import discover, load_all, get_by_id, SkillEntry
from hermes.curator import CuratorState, Decision
from hermes import gepa


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SKILLS_DIR = PROJECT_ROOT / "skills"
MAX_TOKENS = 8192


@dataclass
class HermesConfig:
    bars_path: str = ""
    skills_dir: str = str(SKILLS_DIR)
    vault_path: Optional[str] = None
    memory_path: str = "MEMORY.md"
    max_retries: int = 3
    gepa_path: Optional[str] = None
    gepa_population_size: int = 8
    generate_code: bool = False
    code_prompt: Optional[str] = None
    payload_path: Optional[str] = None
    pine_truth_path: Optional[str] = None


@dataclass
class HermesResult:
    ok: bool
    verdict: str = ""
    confidence: float = 0.0
    skills_run: list[str] = field(default_factory=list)
    skills_skipped: list[str] = field(default_factory=list)
    skills_failed: list[str] = field(default_factory=list)
    skills_retried: list[str] = field(default_factory=list)
    duration_ms: int = 0
    logged_to: dict[str, Any] = field(default_factory=dict)
    curator_summary: dict[str, Any] = field(default_factory=dict)
    gepa_fitness: float = 0.0
    gepa_generation: int = 0
    gepa_params_used: dict[str, Any] = field(default_factory=dict)
    details: dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


PIPELINE = [
    ("AGT-STR-001", "structure"),
    ("AGT-QNT-001", "quant"),
    ("AGT-CCP-001", "claude-code"),
    ("AGT-SYN-001", "synthesis"),
    ("AGT-LOG-001", "log"),
]


def _run_skill_with_curator(
    skill: SkillEntry,
    label: str,
    call_fn,
    curator: CuratorState,
) -> tuple[dict[str, Any], bool]:
    attempt = 0
    while True:
        try:
            result_obj = call_fn()
            if hasattr(result_obj, "to_dict"):
                result = result_obj.to_dict()
            elif isinstance(result_obj, dict):
                result = result_obj
            else:
                result = {"ok": False, "error": f"unexpected result type: {type(result_obj)}"}
        except Exception as e:
            result = {"ok": False, "error": str(e)}

        if result.get("ok", False):
            return result, True

        decision, adjustments = curator.decide(skill.skill_id, result, attempt)

        if decision == Decision.RETRY:
            wait = curator.backoff_seconds(attempt)
            time.sleep(wait)
            attempt += 1
            continue

        if decision == Decision.ADJUST and adjustments:
            attempt += 1
            continue

        return result, False


def _run_structure(skill: SkillEntry, bars_path: str, params: dict[str, Any]) -> Any:
    mod = __import__(skill.module_name)
    bars = mod.load_bars_csv(bars_path)
    return mod.analyze(
        bars,
        pivot_len=params.get("pivot_len", 3),
        min_opp_breaks=params.get("min_opp_breaks", 2),
        max_opp_breaks=params.get("max_opp_breaks", 2),
    )


def _run_quant(skill: SkillEntry, bars_path: str, payload_path: Optional[str], pine_truth_path: Optional[str]) -> Any:
    mod = __import__(skill.module_name)
    return mod.run_quant(bars_path, payload_path, pine_truth_path)


def _run_synthesis(skill: SkillEntry, structure: dict, quant: dict, code: Optional[dict]) -> Any:
    mod = __import__(skill.module_name)
    return mod.synthesize(structure, quant, code)


def _run_log(skill: SkillEntry, result: dict, vault_path: Optional[str], memory_path: str) -> Any:
    mod = __import__(skill.module_name)
    return mod.log_result(result, vault_path, memory_path)


def run(directive: str, config: HermesConfig) -> HermesResult:
    t0 = time.monotonic()

    if not config.bars_path or not Path(config.bars_path).exists():
        return HermesResult(ok=False, error=f"bars file not found: {config.bars_path}")

    entries = discover(config.skills_dir)
    load_all(entries)

    curator = CuratorState(max_retries=config.max_retries)

    population = None
    current_params = dict(gepa.DEFAULT_PARAMS)
    if config.gepa_path:
        population = gepa.load(config.gepa_path)
    if population is None:
        population = gepa.init_population(config.gepa_population_size)
    best_individual = max(population.individuals, key=lambda i: i.fitness)
    current_params = dict(best_individual.params)

    skills_run = []
    skills_skipped = []
    skills_failed = []
    skills_retried = []
    details = {}

    # --- 1. Structure ---
    str_skill = get_by_id(entries, "AGT-STR-001")
    if str_skill and str_skill.entrypoint:
        str_skill.load()
        result, ok = _run_skill_with_curator(
            str_skill, "structure",
            lambda: _run_structure(str_skill, config.bars_path, current_params),
            curator,
        )
        details["structure"] = result
        skills_run.append("structure")
        if not ok:
            skills_failed.append("structure")
        if curator.get_failures_for("AGT-STR-001"):
            skills_retried.append("structure")
    else:
        details["structure"] = {"ok": False, "error": "skill not found"}
        skills_failed.append("structure")
        skills_run.append("structure")

    # --- 2. Quant ---
    qnt_skill = get_by_id(entries, "AGT-QNT-001")
    if qnt_skill and qnt_skill.entrypoint:
        qnt_skill.load()
        result, ok = _run_skill_with_curator(
            qnt_skill, "quant",
            lambda: _run_quant(qnt_skill, config.bars_path, config.payload_path, config.pine_truth_path),
            curator,
        )
        details["quant"] = result
        skills_run.append("quant")
        if not ok:
            skills_failed.append("quant")
        if curator.get_failures_for("AGT-QNT-001"):
            skills_retried.append("quant")
    else:
        details["quant"] = {"ok": False, "error": "skill not found"}
        skills_failed.append("quant")
        skills_run.append("quant")

    # --- 3. Claude Code (optional) ---
    code_result = None
    if config.generate_code and config.code_prompt:
        ccp_skill = get_by_id(entries, "AGT-CCP-001")
        if ccp_skill and ccp_skill.entrypoint:
            ccp_skill.load()
            try:
                mod = __import__(ccp_skill.module_name)
                code_obj = mod.run(config.code_prompt)
                code_result = code_obj.to_dict() if hasattr(code_obj, "to_dict") else code_obj
                details["claude_code"] = code_result
                skills_run.append("claude-code")
                if not code_result.get("ok", False):
                    skills_failed.append("claude-code")
            except Exception as e:
                code_result = {"ok": False, "error": str(e)}
                details["claude_code"] = code_result
                skills_failed.append("claude-code")
                skills_run.append("claude-code")
        else:
            skills_skipped.append("claude-code")
    else:
        skills_skipped.append("claude-code")

    # --- 4. Synthesis ---
    syn_skill = get_by_id(entries, "AGT-SYN-001")
    if syn_skill and syn_skill.entrypoint:
        syn_skill.load()
        result, ok = _run_skill_with_curator(
            syn_skill, "synthesis",
            lambda: _run_synthesis(
                syn_skill,
                details.get("structure", {}),
                details.get("quant", {}),
                code_result,
            ),
            curator,
        )
        details["synthesis"] = result
        skills_run.append("synthesis")
        if not ok:
            skills_failed.append("synthesis")
    else:
        details["synthesis"] = {"ok": False, "error": "skill not found"}
        skills_failed.append("synthesis")
        skills_run.append("synthesis")

    # --- 5. Log ---
    logged_to = {}
    synth_dict = details.get("synthesis", {})
    log_skill = get_by_id(entries, "AGT-LOG-001")
    if log_skill and log_skill.entrypoint:
        log_skill.load()
        log_input = {**synth_dict}
        if "metrics" in details.get("quant", {}):
            log_input["metrics"] = details["quant"]["metrics"]
            log_input["trade_count"] = details["quant"].get("trade_count", 0)
            log_input["parity"] = details["quant"].get("parity")

        result, ok = _run_skill_with_curator(
            log_skill, "log",
            lambda: _run_log(log_skill, log_input, config.vault_path, config.memory_path),
            curator,
        )
        details["log"] = result
        skills_run.append("log")
        if ok:
            logged_to = {
                "vault": result.get("vault_note", ""),
                "memory": result.get("memory_appended", False),
            }
        else:
            skills_failed.append("log")
    else:
        details["log"] = {"ok": False, "error": "skill not found"}
        skills_failed.append("log")
        skills_run.append("log")

    duration_ms = int((time.monotonic() - t0) * 1000)

    # --- GEPA scoring ---
    loop_result_for_scoring = {"details": details, "skills_failed": skills_failed}
    fitness = gepa.score_run(loop_result_for_scoring)
    best_individual.fitness = (
        (best_individual.fitness * best_individual.run_count + fitness)
        / (best_individual.run_count + 1)
    )
    best_individual.run_count += 1
    population.total_runs += 1

    if fitness > population.best_fitness:
        population.best_fitness = fitness

    if config.gepa_path:
        gepa.save(population, config.gepa_path)

    verdict = synth_dict.get("verdict", "UNKNOWN")
    confidence = synth_dict.get("confidence", 0.0)

    return HermesResult(
        ok=len(skills_failed) == 0,
        verdict=verdict,
        confidence=confidence,
        skills_run=skills_run,
        skills_skipped=skills_skipped,
        skills_failed=skills_failed,
        skills_retried=skills_retried,
        duration_ms=duration_ms,
        logged_to=logged_to,
        curator_summary=curator.summary(),
        gepa_fitness=fitness,
        gepa_generation=population.generation,
        gepa_params_used=current_params,
        details=details,
    )


def _main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(
        prog="hermes",
        description="Hermes agent loop — MIDAS trading analysis runtime.",
    )
    ap.add_argument("--bars", required=True, help="OHLCV CSV path")
    ap.add_argument("--directive", default="", help="trading directive")
    ap.add_argument("--payload", help="backtest payload JSON")
    ap.add_argument("--pine-truth", help="Pine truth CSV for parity")
    ap.add_argument("--vault-path", help="Obsidian vault directory")
    ap.add_argument("--memory-path", default="MEMORY.md")
    ap.add_argument("--gepa-path", help="GEPA population JSON path")
    ap.add_argument("--gepa-pop-size", type=int, default=8)
    ap.add_argument("--generate-code", action="store_true")
    ap.add_argument("--code-prompt", help="prompt for code generation")
    ap.add_argument("--max-retries", type=int, default=3)
    ap.add_argument("--output", help="write JSON result to file")
    args = ap.parse_args(argv)

    config = HermesConfig(
        bars_path=args.bars,
        payload_path=args.payload,
        pine_truth_path=args.pine_truth,
        vault_path=args.vault_path,
        memory_path=args.memory_path,
        max_retries=args.max_retries,
        gepa_path=args.gepa_path,
        gepa_population_size=args.gepa_pop_size,
        generate_code=args.generate_code,
        code_prompt=args.code_prompt,
    )

    result = run(args.directive, config)
    out = json.dumps(result.to_dict(), indent=2)
    print(out)
    if args.output:
        Path(args.output).write_text(out, encoding="utf-8")
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(_main())
