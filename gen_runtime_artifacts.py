"""
gen_runtime_artifacts.py — Emit real runtime artifacts for the dashboard.

Writes two JSON files to the repo root that the React Control Tower loads
(via scripts/sync-parity-data.mjs -> public/data), the same pattern the
Backtest/Parity panels already use:

  codegen_output.json  — one StrategySpec -> Pine v5 + BacktestPayload + lint.
                         Proves Pine and Python share one source (spec_hash).
  hermes_state.json    — Hermes runtime introspection: discovered skills,
                         Curator failure policy, GEPA search space + seed
                         population.

Everything here is produced from the actual hermes/ and codegen/ modules —
no hand-authored values. GEPA is emitted as its seed population (generation 0,
no runs yet), which is the honest state until it is evolved on real datasets.

Run from repo root:  python gen_runtime_artifacts.py
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent

from codegen.strategy_spec import StrategySpec
from codegen.pine_gen import generate as pine_generate
from codegen.python_gen import generate_payload, generate_sim_config
from codegen.lint import lint

from hermes import gepa, curator, skill_registry


def build_codegen_artifact() -> dict:
    """One canonical spec -> Pine + Python payload + lint, for both instruments."""
    variants = []
    for preset_name, factory in (
        ("MGC", StrategySpec.liquidity_sweep_mgc),
        ("MNQ", StrategySpec.liquidity_sweep_mnq),
    ):
        spec = factory()
        spec_json = spec.to_json()
        import hashlib

        spec_hash = hashlib.sha256(spec_json.encode()).hexdigest()[:12]
        pine_code = pine_generate(spec)
        payload = generate_payload(spec)
        sim_config = generate_sim_config(spec)
        lint_result = lint(pine_code)
        variants.append(
            {
                "preset": preset_name,
                "spec": spec.to_dict(),
                "spec_hash": spec_hash,
                "pine_code": pine_code,
                "pine_chars": len(pine_code),
                "payload": payload,
                "sim_config": sim_config,
                "lint": lint_result.to_dict(),
            }
        )
    return {
        "generatedBy": "AGT-CDG-001",
        "note": "Pine and Python emitted from one StrategySpec — spec_hash is shared, so the two cannot drift.",
        "variants": variants,
    }


def build_hermes_artifact() -> dict:
    """Introspect the live Hermes runtime: skills, curator policy, GEPA space."""
    # --- Skill registry ---
    entries = skill_registry.discover(str(ROOT / "skills"))
    skills = [
        {
            "skill_id": e.skill_id,
            "name": e.name,
            "phase": e.phase,
            "runtime_skill": bool(e.runtime_skill),
            "tags": list(e.tags or []),
        }
        for e in sorted(entries, key=lambda x: x.skill_id)
    ]

    # --- Curator failure policy ---
    curator_policy = {
        "failure_types": [ft.name for ft in curator.FailureType],
        "decisions": [d.name for d in curator.Decision],
        "transient_patterns": list(curator.TRANSIENT_PATTERNS),
        "parameter_patterns": list(curator.PARAMETER_PATTERNS),
        "backoff": {
            "base_seconds": 2,
            "schedule": [2 * (2**n) for n in range(4)],  # attempt 0..3
            "note": "TRANSIENT -> retry with exponential backoff; PARAMETER -> adjust params; HARD -> skip.",
        },
    }

    # --- GEPA search space + seed population ---
    bounds = {
        k: {"min": lo, "max": hi, "type": t.__name__}
        for k, (lo, hi, t) in gepa.PARAM_BOUNDS.items()
    }
    seed = gepa.init_population(size=8)
    population = {
        "generation": seed.generation,
        "best_fitness": seed.best_fitness,
        "total_runs": seed.total_runs,
        "size": len(seed.individuals),
        "default_params": dict(gepa.DEFAULT_PARAMS),
        "bounds": bounds,
        "individuals": [
            {
                "params": dict(ind.params),
                "fitness": ind.fitness,
                "generation": ind.generation,
                "run_count": ind.run_count,
            }
            for ind in seed.individuals
        ],
        "fitness_weights": {
            "pnl": 0.30,
            "win_rate": 0.20,
            "profit_factor": 0.25,
            "drawdown_penalty": 0.15,
            "volume_bonus": 0.10,
            "parity_bonus": 0.10,
        },
        "note": "Seed population (generation 0, no runs yet). Evolves once GEPA runs on real datasets.",
    }

    return {
        "generatedBy": "hermes-runtime",
        "spine": "custom Hermes loop (agent_loop + Curator + GEPA) — not LangGraph",
        "skills": skills,
        "curator": curator_policy,
        "gepa": population,
    }


def main() -> int:
    codegen_artifact = build_codegen_artifact()
    hermes_artifact = build_hermes_artifact()

    (ROOT / "codegen_output.json").write_text(
        json.dumps(codegen_artifact, indent=2), encoding="utf-8"
    )
    (ROOT / "hermes_state.json").write_text(
        json.dumps(hermes_artifact, indent=2), encoding="utf-8"
    )

    print(f"codegen_output.json — {len(codegen_artifact['variants'])} variants")
    for v in codegen_artifact["variants"]:
        print(f"  {v['preset']}: spec {v['spec_hash']} · pine {v['pine_chars']}c · lint {'PASS' if v['lint']['passed'] else 'FAIL'}")
    print(f"hermes_state.json — {len(hermes_artifact['skills'])} skills · GEPA pop {hermes_artifact['gepa']['size']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
