"""
midas_synthesis.py — Decision Aggregation, as a Hermes runtime skill.

Skill ID:   AGT-SYN-001
Phase:      5
Status:     LIVE — aggregates Structure + Quant + Code results into trade decision.

Takes upstream skill results and produces a unified verdict (GO/NO-GO/CAUTION)
with confidence scoring and per-signal reasoning.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any, Optional


SKILL_ID = "AGT-SYN-001"


@dataclass
class SynthesisResult:
    skill_id: str
    ok: bool
    verdict: str = "NO-GO"
    confidence: float = 0.0
    reasoning: list[str] = field(default_factory=list)
    signals: dict[str, str] = field(default_factory=dict)
    risk_flags: list[str] = field(default_factory=list)
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def synthesize(
    structure: dict[str, Any],
    quant: dict[str, Any],
    code: Optional[dict[str, Any]] = None,
) -> SynthesisResult:
    if not structure or not quant:
        return SynthesisResult(SKILL_ID, ok=False, error="missing required inputs (structure + quant)")

    reasoning = []
    signals = {}
    risk_flags = []
    score = 0.0

    # --- Structure signal ---
    if structure.get("ok"):
        gate = structure.get("gate_open", False)
        retrace = structure.get("retrace_valid", False)
        brk = structure.get("break_label", "none")

        if gate and retrace:
            signals["structure"] = "GO"
            score += 0.35
            reasoning.append(f"Structure gate open ({brk}), retrace valid ({structure.get('retrace_pct', '?')})")
        elif gate:
            signals["structure"] = "CAUTION"
            score += 0.15
            reasoning.append(f"Structure gate open ({brk}) but retrace not confirmed")
        else:
            signals["structure"] = "NO-GO"
            reasoning.append(f"Structure gate closed ({brk}, dir={structure.get('leg_dir', '?')})")

        bc = structure.get("break_count", 0)
        if bc >= 3:
            risk_flags.append("brk3_dead_zone")
            signals["structure"] = "NO-GO"
            score -= 0.2
            reasoning.append("brk#3+ dead zone — gated out per locked decision")
    else:
        signals["structure"] = "ERROR"
        reasoning.append(f"Structure skill error: {structure.get('error', 'unknown')}")

    # --- Quant signal ---
    if quant.get("ok"):
        metrics = quant.get("metrics", {})
        pf = metrics.get("profit_factor", 0)
        wr = metrics.get("win_rate", 0)
        dd = metrics.get("max_drawdown", 0)
        tc = quant.get("trade_count", 0)

        if pf >= 1.5 and wr >= 0.45:
            signals["quant"] = "GO"
            score += 0.35
            reasoning.append(f"Quant strong: PF {pf}, WR {wr:.1%}, {tc} trades")
        elif pf >= 1.0:
            signals["quant"] = "CAUTION"
            score += 0.15
            reasoning.append(f"Quant marginal: PF {pf}, WR {wr:.1%}")
        else:
            signals["quant"] = "NO-GO"
            risk_flags.append("profit_factor_below_1")
            reasoning.append(f"Quant negative edge: PF {pf} < 1.0")

        if dd < -2000:
            risk_flags.append("max_drawdown_high")
            reasoning.append(f"Max drawdown ${dd} exceeds $2000 threshold")

        # Parity sub-signal
        parity = quant.get("parity")
        if parity:
            if parity.get("pass"):
                signals["parity"] = "GO"
                score += 0.15
                reasoning.append(f"Parity pass: {parity['matched']}/{parity.get('pine_trades', '?')} matched")
            else:
                signals["parity"] = "CAUTION"
                score += 0.05
                reasoning.append(f"Parity incomplete: {parity.get('unmatched', '?')} unmatched trades")
    else:
        signals["quant"] = "ERROR"
        reasoning.append(f"Quant skill error: {quant.get('error', 'unknown')}")

    # --- Code signal (optional) ---
    if code:
        if code.get("ok"):
            signals["code"] = "GO"
            score += 0.15
            reasoning.append("Code generation successful")
        else:
            signals["code"] = "ERROR"
            reasoning.append(f"Code skill error: {code.get('error', 'unknown')}")

    # --- Final verdict ---
    no_go_count = sum(1 for v in signals.values() if v == "NO-GO")
    error_count = sum(1 for v in signals.values() if v == "ERROR")

    if no_go_count > 0 or error_count > 0:
        verdict = "NO-GO"
    elif score >= 0.6:
        verdict = "GO"
    elif score >= 0.3:
        verdict = "CAUTION"
    else:
        verdict = "NO-GO"

    return SynthesisResult(
        skill_id=SKILL_ID,
        ok=True,
        verdict=verdict,
        confidence=round(min(max(score, 0.0), 1.0), 2),
        reasoning=reasoning,
        signals=signals,
        risk_flags=risk_flags,
    )


SKILL_DESCRIPTOR = {
    "id": SKILL_ID,
    "name": "MIDAS Synthesis",
    "entrypoint": synthesize,
    "phase": 5,
    "runtime_skill": True,
}


def _main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(prog="midas_synthesis", description="Decision aggregation skill.")
    ap.add_argument("--structure", required=True, help="structure result JSON path")
    ap.add_argument("--quant", required=True, help="quant result JSON path")
    ap.add_argument("--code", help="code result JSON path (optional)")
    ap.add_argument("--output", help="write JSON result to file")
    args = ap.parse_args(argv)

    structure = json.loads(Path(args.structure).read_text(encoding="utf-8"))
    quant = json.loads(Path(args.quant).read_text(encoding="utf-8"))
    code = json.loads(Path(args.code).read_text(encoding="utf-8")) if args.code else None

    result = synthesize(structure, quant, code)
    out = json.dumps(result.to_dict(), indent=2)
    print(out)
    if args.output:
        Path(args.output).write_text(out, encoding="utf-8")
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(_main())
