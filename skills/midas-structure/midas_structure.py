"""
midas_structure.py — Market Structure Analysis, as a Hermes runtime skill.

Skill ID:   AGT-STR-001
Phase:      5
Status:     LIVE — extracted from liquidity_sweep_backtester.py pivot/break logic.

Analyzes OHLCV bars for:
  - Pivot highs/lows (matches Pine ta.pivothigh/pivotlow semantics)
  - Bull/bear break counting with leg direction tracking
  - Leg-break gate: brk#1 strongest, brk#3 dead zone (gated out)
  - 66.5% retrace filter for structural entry confirmation
"""

from __future__ import annotations

import csv
import json
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Optional


SKILL_ID = "AGT-STR-001"

RETRACE_THRESHOLD = 0.665


@dataclass
class Bar:
    dt: str
    open: float
    high: float
    low: float
    close: float
    volume: int = 0


@dataclass
class StructureResult:
    skill_id: str
    ok: bool
    swing_high: Optional[float] = None
    swing_low: Optional[float] = None
    leg_dir: int = 0
    break_count: int = 0
    break_label: str = ""
    gate_open: bool = False
    retrace_pct: Optional[float] = None
    retrace_valid: bool = False
    pivots_detected: int = 0
    bars_analyzed: int = 0
    error: Optional[str] = None
    pivot_history: list = None
    break_history: list = None

    def __post_init__(self):
        if self.pivot_history is None:
            self.pivot_history = []
        if self.break_history is None:
            self.break_history = []

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def load_bars_csv(path: str) -> list[Bar]:
    bars = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            dt_key = next((k for k in row if k.lower() in ("dt", "datetime", "date", "time", "timestamp")), None)
            bars.append(Bar(
                dt=row.get(dt_key, "") if dt_key else "",
                open=float(row.get("open", row.get("Open", 0))),
                high=float(row.get("high", row.get("High", 0))),
                low=float(row.get("low", row.get("Low", 0))),
                close=float(row.get("close", row.get("Close", 0))),
                volume=int(float(row.get("volume", row.get("Volume", 0)))),
            ))
    return bars


def compute_pivots(bars: list[Bar], pivot_len: int) -> tuple[list, list]:
    n = len(bars)
    r = pivot_len
    ph = [None] * n
    pl = [None] * n

    for i in range(n - r):
        is_ph = True
        for j in range(max(0, i - r), min(n, i + r + 1)):
            if j != i and bars[j].high > bars[i].high:
                is_ph = False
                break
        if is_ph:
            ph[i + r] = bars[i].high

        is_pl = True
        for j in range(max(0, i - r), min(n, i + r + 1)):
            if j != i and bars[j].low < bars[i].low:
                is_pl = False
                break
        if is_pl:
            pl[i + r] = bars[i].low

    return ph, pl


def compute_retrace(swing_high: float, swing_low: float, current_price: float, leg_dir: int) -> Optional[float]:
    if swing_high is None or swing_low is None:
        return None
    leg_range = swing_high - swing_low
    if leg_range <= 0:
        return None
    if leg_dir == 1:
        return (swing_high - current_price) / leg_range
    elif leg_dir == -1:
        return (current_price - swing_low) / leg_range
    return None


def analyze(
    bars: list[Bar],
    pivot_len: int = 3,
    min_opp_breaks: int = 2,
    max_opp_breaks: int = 2,
) -> StructureResult:
    if not bars:
        return StructureResult(SKILL_ID, ok=False, error="no bars provided")

    ph, pl = compute_pivots(bars, pivot_len)

    swing_high = None
    swing_low = None
    high_armed = False
    low_armed = False
    leg_dir = 0
    break_count = 0
    pivots_detected = 0
    pivot_history = []
    break_history = []

    for i, bar in enumerate(bars):
        if ph[i] is not None:
            swing_high = ph[i]
            high_armed = True
            pivots_detected += 1
            pivot_history.append({"bar": i, "type": "high", "level": swing_high})
        if pl[i] is not None:
            swing_low = pl[i]
            low_armed = True
            pivots_detected += 1
            pivot_history.append({"bar": i, "type": "low", "level": swing_low})

        bull_break = high_armed and bar.close > swing_high
        bear_break = low_armed and bar.close < swing_low

        if bull_break:
            if leg_dir == 1:
                break_count += 1
            else:
                leg_dir = 1
                break_count = 1
            high_armed = False
            break_history.append({"bar": i, "dir": "bull", "count": break_count})
        elif bear_break:
            if leg_dir == -1:
                break_count += 1
            else:
                leg_dir = -1
                break_count = 1
            low_armed = False
            break_history.append({"bar": i, "dir": "bear", "count": break_count})

    gate_open = (leg_dir == -1 and min_opp_breaks <= break_count <= max_opp_breaks)

    last_bar = bars[-1]
    retrace_pct = compute_retrace(swing_high, swing_low, last_bar.close, leg_dir)
    retrace_valid = retrace_pct is not None and retrace_pct >= RETRACE_THRESHOLD

    break_label = f"brk#{break_count}" if break_count > 0 else "none"

    return StructureResult(
        skill_id=SKILL_ID,
        ok=True,
        swing_high=swing_high,
        swing_low=swing_low,
        leg_dir=leg_dir,
        break_count=break_count,
        break_label=break_label,
        gate_open=gate_open,
        retrace_pct=round(retrace_pct, 4) if retrace_pct is not None else None,
        retrace_valid=retrace_valid,
        pivots_detected=pivots_detected,
        bars_analyzed=len(bars),
        pivot_history=pivot_history[-10:],
        break_history=break_history[-10:],
    )


SKILL_DESCRIPTOR = {
    "id": SKILL_ID,
    "name": "MIDAS Structure",
    "entrypoint": analyze,
    "phase": 5,
    "runtime_skill": True,
    "sandbox": "PLT-005",
}


def _main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(prog="midas_structure", description="Market structure analysis skill.")
    ap.add_argument("--bars", required=True, help="path to OHLCV CSV")
    ap.add_argument("--pivot-len", type=int, default=3)
    ap.add_argument("--min-breaks", type=int, default=2)
    ap.add_argument("--max-breaks", type=int, default=2)
    ap.add_argument("--output", help="write JSON result to file")
    args = ap.parse_args(argv)

    bars = load_bars_csv(args.bars)
    result = analyze(bars, args.pivot_len, args.min_breaks, args.max_breaks)

    out = json.dumps(result.to_dict(), indent=2)
    print(out)
    if args.output:
        Path(args.output).write_text(out, encoding="utf-8")
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(_main())
