"""Loader for FirstRateData (FRD) futures CSV exports.

FRD format (intraday): timestamp,open,high,low,close,volume
  - timestamp: "yyyy-MM-dd HH:mm:ss" in US Eastern Time (no tz suffix)
  - timestamps mark the START of the bar period
  - zero-volume bars are omitted (gaps = no trades, e.g. daily 17:00-18:00 pause)

Usage:
    from parity_engine.frd_loader import load_frd_csv
    bars = load_frd_csv("GC_5min_sample.csv")

Or run a backtest directly:
    python -m parity_engine.frd_loader GC_5min_sample.csv MGC1!
"""
from __future__ import annotations

import csv
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from parity_engine.engine import Bar

_ET = ZoneInfo("America/New_York")


def load_frd_csv(path: str, limit: int | None = None) -> list[Bar]:
    """Parse an FRD intraday CSV into engine Bars (epoch-ms UTC timestamps)."""
    bars: list[Bar] = []
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            dt = datetime.strptime(row["timestamp"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=_ET)
            bars.append(Bar(
                index=len(bars),
                time=int(dt.timestamp() * 1000),
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row["volume"]),
            ))
            if limit and len(bars) >= limit:
                break
    return bars


def _demo_payload(symbol: str) -> dict:
    """A simple long-only demo spec with NY RTH session gating."""
    return {
        "schemaVersion": 1, "strategyId": "frd_real_data", "generatedFrom": "frd_loader",
        "asset": {"symbol": symbol, "timeframe": "5m"},
        "session": {"name": "NY RTH", "timezone": "America/New_York",
                    "start": "09:30", "end": "16:00", "rthOnly": True},
        "execution": {
            "confirmOnBarClose": True, "recalcMode": "close_only",
            "fillMode": "next_open", "slippageTicks": 1,
            "commissionType": "cash_per_contract", "commissionValue": 0.62,
            "processOrdersOnClose": False,
        },
        "sizing": {"initialCapital": 10000, "qtyType": "fixed", "qtyValue": 1},
        "entry": {"side": "long", "orderType": "market",
                  "conditions": [{"id": "c1", "expression": "close > open"}]},
        "exit": {"stop": {"mode": "fixed_ticks", "value": 20},
                 "target": {"mode": "fixed_ticks", "value": 40}},
        "risk": {"maxDrawdownPct": 10.0, "maxConsecutiveLosses": 5},
    }


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: python -m parity_engine.frd_loader <frd_csv> <symbol>")
        print("Example: python -m parity_engine.frd_loader GC_5min_sample.csv MGC1!")
        sys.exit(1)

    from parity_engine.contract import BacktestPayload, resolve_economics
    from parity_engine.metrics import compute_metrics
    from parity_engine.risk_engine import RiskEngine

    path, symbol = sys.argv[1], sys.argv[2]
    bars = load_frd_csv(path)
    payload = BacktestPayload.from_dict(_demo_payload(symbol))
    tick, point = resolve_economics(payload.asset)

    first = datetime.fromtimestamp(bars[0].time / 1000, tz=_ET)
    last = datetime.fromtimestamp(bars[-1].time / 1000, tz=_ET)
    print(f"Loaded {len(bars)} bars from {path}")
    print(f"Range: {first:%Y-%m-%d %H:%M} -> {last:%Y-%m-%d %H:%M} ET")
    print(f"Economics: {symbol} tick={tick} pointValue=${point}/pt")

    result = RiskEngine(payload, bars).run()
    er = result.engine_result
    closed = [t for t in er.trades if not t.is_open]
    metrics = compute_metrics(er.trades, er.equity_curve, payload.sizing.initialCapital)

    print(f"\nBars processed : {er.bars_processed}")
    print(f"Closed trades  : {len(closed)}")
    wins = [t for t in closed if t.net_pnl > 0]
    print(f"Win rate       : {100 * len(wins) / len(closed):.1f}%" if closed else "Win rate       : n/a")
    print(f"Net PnL        : ${sum(t.net_pnl for t in closed):,.2f}")
    print(f"+EV            : {metrics['ev']}")
    print(f"Profit factor  : {metrics['profit_factor']}")
    print(f"Max drawdown   : {metrics['max_drawdown_pct']}%")
    if result.risk_metrics:
        print(f"Max consec loss: {result.risk_metrics.max_consecutive_losses}")
    print(f"Risk status    : {result.risk_status.upper()}")
    for v in result.risk_violations:
        print(f"  [{v.severity.upper()}] {v.limit_name}: {v.actual_value:.2f} vs limit {v.limit_value}")


if __name__ == "__main__":
    main()
