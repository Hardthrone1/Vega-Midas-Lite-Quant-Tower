"""
midas_quant.py — Backtest & Edge Analytics, as a Hermes runtime skill.

Skill ID:   AGT-QNT-001
Phase:      5
Status:     LIVE — wraps parity_engine + metrics + optional parity validation.

Runs backtests via the parity engine, computes edge metrics, and optionally
validates against Pine Script truth trades for parity assurance.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any, Optional


SKILL_ID = "AGT-QNT-001"

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


@dataclass
class QuantResult:
    skill_id: str
    ok: bool
    trade_count: int = 0
    metrics: dict[str, Any] = field(default_factory=dict)
    parity: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    trades_summary: list = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def run_quant(
    bars_path: str,
    payload_path: Optional[str] = None,
    pine_truth_path: Optional[str] = None,
) -> QuantResult:
    try:
        from parity_engine import Engine, BacktestPayload, bars_from_dicts, compute_metrics
    except ImportError as e:
        return QuantResult(SKILL_ID, ok=False, error=f"parity_engine not available: {e}")

    bars_file = Path(bars_path)
    if not bars_file.exists():
        return QuantResult(SKILL_ID, ok=False, error=f"bars file not found: {bars_path}")

    try:
        if payload_path:
            payload_data = json.loads(Path(payload_path).read_text(encoding="utf-8"))
            payload = BacktestPayload.from_dict(payload_data)
        else:
            payload = None
    except Exception as e:
        return QuantResult(SKILL_ID, ok=False, error=f"payload parse error: {e}")

    try:
        import csv as _csv
        with open(bars_path, newline="", encoding="utf-8") as f:
            bars_raw = list(_csv.DictReader(f))
        for row in bars_raw:
            if "time" not in row:
                ts = row.get("timestamp", row.get("datetime", row.get("date", "0")))
                try:
                    from datetime import datetime, timezone
                    dt = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                    row["time"] = int(dt.timestamp() * 1000)
                except Exception:
                    row["time"] = 0
        bars = bars_from_dicts(bars_raw)
    except Exception as e:
        return QuantResult(SKILL_ID, ok=False, error=f"bar loading failed: {e}")

    try:
        if payload:
            engine = Engine(payload, bars)
        else:
            from parity_engine.contract import BacktestPayload as BP
            default_payload = BP.from_dict({
                "asset": {"symbol": "MGC", "exchange": "COMEX"},
                "execution": {"confirmOnBarClose": True},
            })
            engine = Engine(default_payload, bars)
        result = engine.run()
        trades = result.trades
    except Exception as e:
        return QuantResult(SKILL_ID, ok=False, error=f"engine run failed: {e}")

    pnls = [t.pnl for t in trades if hasattr(t, "pnl")]
    try:
        metrics = compute_metrics(pnls)
    except Exception:
        metrics = _basic_metrics(pnls)

    parity_result = None
    if pine_truth_path and Path(pine_truth_path).exists():
        parity_result = _run_parity(trades, pine_truth_path)

    trades_summary = []
    for t in trades[:20]:
        entry = {
            "entry_price": getattr(t, "entry_price", None),
            "exit_price": getattr(t, "exit_price", None),
            "pnl": getattr(t, "pnl", None),
            "signal": getattr(t, "signal", getattr(t, "side", None)),
        }
        trades_summary.append(entry)

    return QuantResult(
        skill_id=SKILL_ID,
        ok=True,
        trade_count=len(trades),
        metrics=metrics,
        parity=parity_result,
        trades_summary=trades_summary,
    )


def _basic_metrics(pnls: list[float]) -> dict[str, Any]:
    if not pnls:
        return {"net_pnl": 0, "trade_count": 0}
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    return {
        "net_pnl": round(sum(pnls), 2),
        "trade_count": len(pnls),
        "winning_trades": len(wins),
        "losing_trades": len(losses),
        "win_rate": round(len(wins) / len(pnls), 4) if pnls else 0,
        "profit_factor": round(gross_profit / gross_loss, 4) if gross_loss > 0 else float("inf"),
        "avg_win": round(gross_profit / len(wins), 2) if wins else 0,
        "avg_loss": round(sum(losses) / len(losses), 2) if losses else 0,
        "ev_per_trade": round(sum(pnls) / len(pnls), 2),
        "max_drawdown": round(_max_drawdown(pnls), 2),
    }


def _max_drawdown(pnls: list[float]) -> float:
    peak = 0.0
    equity = 0.0
    max_dd = 0.0
    for p in pnls:
        equity += p
        if equity > peak:
            peak = equity
        dd = peak - equity
        if dd > max_dd:
            max_dd = dd
    return -max_dd


def _run_parity(trades, pine_truth_path: str) -> dict[str, Any]:
    import csv
    with open(pine_truth_path, newline="", encoding="utf-8") as f:
        pine_trades = list(csv.DictReader(f))

    matched = 0
    unmatched = 0
    for pt in pine_trades:
        pine_entry = float(pt.get("entry_price", 0))
        found = False
        for t in trades:
            entry = getattr(t, "entry_price", None)
            if entry and abs(entry - pine_entry) < 0.5:
                matched += 1
                found = True
                break
        if not found:
            unmatched += 1

    return {
        "pine_trades": len(pine_trades),
        "matched": matched,
        "unmatched": unmatched,
        "pass": unmatched == 0,
    }


SKILL_DESCRIPTOR = {
    "id": SKILL_ID,
    "name": "MIDAS Quant",
    "entrypoint": run_quant,
    "phase": 5,
    "runtime_skill": True,
    "sandbox": "PLT-005",
}


def _main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(prog="midas_quant", description="Backtest & edge analytics skill.")
    ap.add_argument("--bars", required=True, help="OHLCV CSV path")
    ap.add_argument("--payload", help="backtest payload JSON path")
    ap.add_argument("--pine-truth", help="Pine Script truth CSV for parity check")
    ap.add_argument("--output", help="write JSON result to file")
    args = ap.parse_args(argv)

    result = run_quant(args.bars, args.payload, args.pine_truth)
    out = json.dumps(result.to_dict(), indent=2)
    print(out)
    if args.output:
        Path(args.output).write_text(out, encoding="utf-8")
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(_main())
