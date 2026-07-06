"""CLI entry point and parity harness.

Usage:
    python run.py payload.json bars.csv
    python run.py payload.json bars.csv --compare reference_trades.json

Outputs a JSON result with: trades, equity_curve, metrics, parity_report.
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

from .contract import BacktestPayload
from .engine import Engine, Trade, bars_from_dicts
from .metrics import compute_metrics


def load_bars_csv(path: str) -> list[dict]:
    rows = []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def parity_check(
    our_trades: list[Trade],
    reference: list[dict],
    tolerance_ticks: float = 2.0,
    tick_size: float = 0.1,
) -> dict:
    """Compare our trades against a reference (Pine export or prior run).

    Returns:
        {passed, mismatch_count, mismatches: [{id, field, ours, theirs}]}
    """
    tolerance = tolerance_ticks * tick_size
    closed = [t for t in our_trades if not t.is_open]
    mismatches = []

    for i, (ours, ref) in enumerate(zip(closed, reference)):
        trade_id = ours.id
        # Entry bar alignment
        if abs((ours.entry_fill.bar_index) - int(ref.get("entry_bar", ours.entry_fill.bar_index))) > 1:
            mismatches.append({
                "trade_id": trade_id,
                "field": "entry_bar",
                "ours": ours.entry_fill.bar_index,
                "theirs": ref.get("entry_bar"),
            })
        # Entry price within tolerance
        ref_entry = float(ref.get("entry_price", ours.entry_fill.price))
        if abs(ours.entry_fill.price - ref_entry) > tolerance:
            mismatches.append({
                "trade_id": trade_id,
                "field": "entry_price",
                "ours": ours.entry_fill.price,
                "theirs": ref_entry,
                "delta": round(abs(ours.entry_fill.price - ref_entry), 4),
            })
        # Exit bar alignment
        if ours.exit_fill and ref.get("exit_bar") is not None:
            if abs(ours.exit_fill.bar_index - int(ref["exit_bar"])) > 1:
                mismatches.append({
                    "trade_id": trade_id,
                    "field": "exit_bar",
                    "ours": ours.exit_fill.bar_index,
                    "theirs": ref["exit_bar"],
                })
        # Side
        if ours.side != ref.get("side", ours.side):
            mismatches.append({
                "trade_id": trade_id,
                "field": "side",
                "ours": ours.side,
                "theirs": ref.get("side"),
            })

    coverage_diff = abs(len(closed) - len(reference))
    if coverage_diff:
        mismatches.append({
            "trade_id": None,
            "field": "trade_count",
            "ours": len(closed),
            "theirs": len(reference),
        })

    return {
        "passed": len(mismatches) == 0,
        "mismatch_count": len(mismatches),
        "mismatches": mismatches,
        "tolerance_ticks": tolerance_ticks,
    }


def main(argv=None):
    args = (argv or sys.argv)[1:]
    if len(args) < 2:
        print("Usage: python -m parity_engine.run <payload.json> <bars.csv> [--compare reference.json]", file=sys.stderr)
        sys.exit(1)

    payload_path, bars_path = args[0], args[1]
    compare_path = None
    if "--compare" in args:
        ci = args.index("--compare")
        compare_path = args[ci + 1] if ci + 1 < len(args) else None

    with open(payload_path) as f:
        payload_dict = json.load(f)
    payload = BacktestPayload.from_dict(payload_dict)

    raw_bars = load_bars_csv(bars_path)
    bars = bars_from_dicts(raw_bars)

    engine = Engine(payload, bars)
    result = engine.run()

    metrics = compute_metrics(result.trades, result.equity_curve, payload.sizing.initialCapital)

    parity = None
    if compare_path:
        with open(compare_path) as f:
            reference = json.load(f)
        parity = parity_check(result.trades, reference, tick_size=engine.tick_size)

    output = {
        **result.to_dict(),
        "metrics": metrics,
        "parity_report": parity,
        "payload_strategy_id": payload.strategyId,
        "payload_version": payload.generatedFrom,
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
