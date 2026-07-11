"""
lint.py — Pine Script anti-cheat / overfitting linter.

Python port of validatePineScriptRules from swarm_orchestrator.js.
Kept in lockstep: same rules, same violation/warning text.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class LintResult:
    passed: bool
    violations: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    trap_check: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "violations": self.violations,
            "warnings": self.warnings,
            "trapCheck": self.trap_check,
        }


LOOKAHEAD_PATTERNS = [
    re.compile(r"close\s*\[\s*-", re.IGNORECASE),
    re.compile(r"\[bar_index\s*\+\s*\d", re.IGNORECASE),
    re.compile(r"security\([^)]*lookahead\s*=\s*barmerge\.lookahead_on", re.IGNORECASE),
]

TRAP_MESSAGES = {
    "available": "TRAP-CHECK: intra-bar trap detection AVAILABLE — stop= and limit= are named variables; static-bracket resolver can replay 1m data against the recorded SL/TP.",
    "partial": "TRAP-CHECK: intra-bar trap detection PARTIAL — SL/TP inlined as literals/expressions; expose them as `var float` to recover full boundaries.",
    "unavailable": "TRAP-CHECK: intra-bar trap detection UNAVAILABLE — no stop=/limit= on exit; SL/TP intent cannot be recovered.",
    "unreliable": "TRAP-CHECK: intra-bar trap detection UNRELIABLE — trailing stop; exit-time SL differs from entry-time SL. Route to manual replay, not the static-bracket resolver.",
    "n/a": "TRAP-CHECK: not applicable — no strategy.exit() / strategy.close() found.",
}


def lint(code: str) -> LintResult:
    if not isinstance(code, str):
        code = str(code)

    violations = []
    warnings = []

    has_entry = bool(re.search(r"strategy\.entry\s*\(", code, re.IGNORECASE))
    if has_entry and "barstate.isconfirmed" not in code:
        violations.append("strategy.entry() detected but barstate.isconfirmed validation missing")

    for i, pattern in enumerate(LOOKAHEAD_PATTERNS):
        if pattern.search(code):
            violations.append(f"Potential lookahead leakage detected (pattern {i + 1})")

    if re.search(r"security\s*\([^)]*lookahead", code, re.IGNORECASE):
        violations.append("security() call with lookahead parameter may cause repainting")

    indicators = re.findall(r"ta\.\w+\s*\(", code, re.IGNORECASE)
    unique_indicators = set(i.lower() for i in indicators)
    if len(unique_indicators) >= 5:
        warnings.append(
            f"High indicator stacking detected ({len(unique_indicators)} distinct ta.* calls) — risk of overfitting"
        )

    if not re.search(r"slippage|spread|commiss", code, re.IGNORECASE):
        warnings.append(
            "No slippage, spread, or commission modeling detected — may diverge from real-world fills"
        )

    atr_on_entry = re.search(r"strategy\.entry[^}]*atr\s*\(", code, re.IGNORECASE)
    if atr_on_entry and "barstate.isconfirmed" not in code:
        warnings.append(
            "ATR-based stops may be calculated on entry bar without bar confirmation — review manually"
        )

    # --- Trap detection ---
    trap_status = "n/a"
    has_exit = bool(re.search(r"strategy\.(exit|close)\s*\(", code, re.IGNORECASE))
    if has_exit:
        trap_status = "available"
        has_trailing = bool(
            re.search(r"trail_(points|price|offset)\s*=", code, re.IGNORECASE)
            or re.search(r"strategy\.exit[^)]*trail", code, re.IGNORECASE)
        )
        stop_match = re.search(r"\bstop\s*=\s*([^,)\n]+)", code, re.IGNORECASE)
        limit_match = re.search(r"\blimit\s*=\s*([^,)\n]+)", code, re.IGNORECASE)

        def looks_like_variable(m):
            if not m:
                return False
            val = m.group(1).strip()
            return bool(re.match(r"^[A-Za-z_]\w*(\s*\[\s*\d+\s*\])?$", val))

        stop_readable = looks_like_variable(stop_match)
        limit_readable = looks_like_variable(limit_match)

        if not stop_match and not limit_match:
            trap_status = "unavailable"
            warnings.append(
                "TRAP-CHECK: no stop= / limit= found on exit — intra-bar trap detection unavailable"
            )
        elif (not stop_readable or not limit_readable) and not has_trailing:
            trap_status = "partial"
            warnings.append(
                "TRAP-CHECK: SL/TP appear inlined as literals or expressions, not named variables — "
                "expose them as var float for trap detection"
            )
        if has_trailing:
            trap_status = "unreliable"
            warnings.append(
                "TRAP-CHECK: trailing stop detected — exit-time SL differs from entry-time SL; "
                "intra-bar trap detection is UNRELIABLE"
            )

    return LintResult(
        passed=len(violations) == 0,
        violations=violations,
        warnings=warnings,
        trap_check={"status": trap_status, "message": TRAP_MESSAGES[trap_status]},
    )
