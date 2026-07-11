"""
midas_codegen.py — Canonical Pine/Python code generation skill.

Skill ID:   AGT-CDG-001
Phase:      5
Status:     LIVE — generates Pine v5 + BacktestPayload from one StrategySpec.
"""

from __future__ import annotations

import hashlib
import json
import sys
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any, Optional

SKILL_ID = "AGT-CDG-001"

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from codegen.strategy_spec import StrategySpec
from codegen.pine_gen import generate as pine_generate
from codegen.python_gen import generate_payload, generate_sim_config
from codegen.lint import lint


@dataclass
class CodegenResult:
    skill_id: str
    ok: bool
    pine_code: str = ""
    payload: dict[str, Any] = field(default_factory=dict)
    sim_config: dict[str, Any] = field(default_factory=dict)
    lint_result: dict[str, Any] = field(default_factory=dict)
    spec_hash: str = ""
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def run_codegen(
    spec: Optional[StrategySpec] = None,
    spec_path: Optional[str] = None,
    preset: Optional[str] = None,
) -> CodegenResult:
    if spec is None:
        if spec_path:
            try:
                spec = StrategySpec.load(spec_path)
            except Exception as e:
                return CodegenResult(SKILL_ID, ok=False, error=f"spec load error: {e}")
        elif preset:
            presets = {
                "mgc": StrategySpec.liquidity_sweep_mgc,
                "mnq": StrategySpec.liquidity_sweep_mnq,
            }
            factory = presets.get(preset.lower())
            if not factory:
                return CodegenResult(
                    SKILL_ID, ok=False,
                    error=f"unknown preset '{preset}', valid: {list(presets)}",
                )
            spec = factory()
        else:
            spec = StrategySpec.liquidity_sweep_mgc()

    spec_json = spec.to_json()
    spec_hash = hashlib.sha256(spec_json.encode()).hexdigest()[:12]

    pine_code = pine_generate(spec)

    payload = generate_payload(spec)
    sim_config = generate_sim_config(spec)

    lint_result = lint(pine_code)

    return CodegenResult(
        skill_id=SKILL_ID,
        ok=lint_result.passed,
        pine_code=pine_code,
        payload=payload,
        sim_config=sim_config,
        lint_result=lint_result.to_dict(),
        spec_hash=spec_hash,
        error=None if lint_result.passed else f"lint violations: {lint_result.violations}",
    )


SKILL_DESCRIPTOR = {
    "id": SKILL_ID,
    "name": "MIDAS Codegen",
    "entrypoint": run_codegen,
    "phase": 5,
    "runtime_skill": True,
}


def _main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(prog="midas_codegen", description="Pine/Python code generator.")
    ap.add_argument("--spec", help="StrategySpec JSON file")
    ap.add_argument("--preset", help="preset name (mgc, mnq)")
    ap.add_argument("--output-dir", help="write Pine + payload files to directory")
    ap.add_argument("--output", help="write full result JSON to file")
    ap.add_argument("--pine-only", action="store_true", help="print only Pine code")
    ap.add_argument("--payload-only", action="store_true", help="print only payload JSON")
    args = ap.parse_args(argv)

    result = run_codegen(spec_path=args.spec, preset=args.preset)

    if args.pine_only:
        print(result.pine_code)
        return 0 if result.ok else 1

    if args.payload_only:
        print(json.dumps(result.payload, indent=2))
        return 0 if result.ok else 1

    if args.output_dir:
        out = Path(args.output_dir)
        out.mkdir(parents=True, exist_ok=True)
        (out / "strategy.pine").write_text(result.pine_code, encoding="utf-8")
        (out / "backtest_payload.json").write_text(
            json.dumps(result.payload, indent=2), encoding="utf-8",
        )
        (out / "sim_config.json").write_text(
            json.dumps(result.sim_config, indent=2), encoding="utf-8",
        )
        (out / "strategy_spec.json").write_text(
            json.dumps({"spec_hash": result.spec_hash}, indent=2), encoding="utf-8",
        )
        (out / "lint_result.json").write_text(
            json.dumps(result.lint_result, indent=2), encoding="utf-8",
        )
        print(f"Generated to {out}/")
        print(f"  strategy.pine ({len(result.pine_code)} chars)")
        print(f"  backtest_payload.json")
        print(f"  sim_config.json")
        print(f"  lint: {'PASS' if result.ok else 'FAIL'}")
        return 0 if result.ok else 1

    out = json.dumps(result.to_dict(), indent=2)
    print(out)
    if args.output:
        Path(args.output).write_text(out, encoding="utf-8")
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(_main())
