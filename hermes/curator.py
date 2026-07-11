"""
curator.py — Failure handler for the Hermes skill loop.

Watches for ok=False results from skills, classifies failures,
and decides: retry (transient), adjust (parameter), or skip (hard).
Maintains a failure log for GEPA to consume.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class FailureType(Enum):
    TRANSIENT = "transient"
    PARAMETER = "parameter"
    HARD = "hard"


class Decision(Enum):
    RETRY = "retry"
    ADJUST = "adjust"
    SKIP = "skip"


TRANSIENT_PATTERNS = [
    "timeout", "timed out", "connection", "rate limit", "429",
    "503", "502", "500", "temporarily", "unavailable", "retry",
    "ECONNREFUSED", "ECONNRESET", "network",
]

PARAMETER_PATTERNS = [
    "no bars", "empty", "not enough", "insufficient",
    "pivot_len", "threshold", "out of range", "zero trades",
    "no trades", "trade_count.*0",
]


@dataclass
class FailureRecord:
    skill_id: str
    attempt: int
    failure_type: FailureType
    decision: Decision
    error: str
    timestamp: float = 0.0
    adjusted_params: Optional[dict[str, Any]] = None

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = time.time()


@dataclass
class CuratorState:
    max_retries: int = 3
    backoff_base: float = 1.0
    failure_log: list[FailureRecord] = field(default_factory=list)

    def classify(self, result: dict[str, Any]) -> FailureType:
        error = str(result.get("error", "")).lower()

        for pattern in TRANSIENT_PATTERNS:
            if pattern in error:
                return FailureType.TRANSIENT

        for pattern in PARAMETER_PATTERNS:
            if pattern in error:
                return FailureType.PARAMETER

        return FailureType.HARD

    def decide(
        self,
        skill_id: str,
        result: dict[str, Any],
        attempt: int,
    ) -> tuple[Decision, Optional[dict[str, Any]]]:
        ftype = self.classify(result)
        error = result.get("error", "unknown")

        if ftype == FailureType.TRANSIENT and attempt < self.max_retries:
            record = FailureRecord(skill_id, attempt, ftype, Decision.RETRY, error)
            self.failure_log.append(record)
            return Decision.RETRY, None

        if ftype == FailureType.PARAMETER and attempt < self.max_retries:
            adjustments = self._suggest_adjustment(skill_id, result)
            if adjustments:
                record = FailureRecord(
                    skill_id, attempt, ftype, Decision.ADJUST, error,
                    adjusted_params=adjustments,
                )
                self.failure_log.append(record)
                return Decision.ADJUST, adjustments

        record = FailureRecord(skill_id, attempt, ftype, Decision.SKIP, error)
        self.failure_log.append(record)
        return Decision.SKIP, None

    def backoff_seconds(self, attempt: int) -> float:
        return self.backoff_base * (2 ** attempt)

    def _suggest_adjustment(
        self,
        skill_id: str,
        result: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        error = str(result.get("error", "")).lower()

        if skill_id == "AGT-STR-001":
            if "pivot" in error or "not enough" in error:
                return {"pivot_len": 2}
            if "no bars" in error or "empty" in error:
                return None

        if skill_id == "AGT-QNT-001":
            if "no trades" in error or "zero" in error:
                return {"relax_filters": True}

        return None

    def get_failures_for(self, skill_id: str) -> list[FailureRecord]:
        return [r for r in self.failure_log if r.skill_id == skill_id]

    def summary(self) -> dict[str, Any]:
        by_skill: dict[str, list] = {}
        for r in self.failure_log:
            by_skill.setdefault(r.skill_id, []).append({
                "attempt": r.attempt,
                "type": r.failure_type.value,
                "decision": r.decision.value,
                "error": r.error[:120],
            })
        return {
            "total_failures": len(self.failure_log),
            "by_skill": by_skill,
        }
