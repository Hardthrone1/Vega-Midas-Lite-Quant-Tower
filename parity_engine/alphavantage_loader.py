"""Loader for the gateway's cached Alpha Vantage market data.

This does NOT call Alpha Vantage directly — the gateway (Vega_Gateway_Server.js
+ market_data.js) owns the API key, the 25/day quota, and the fetch schedule.
Python reads the same cache over HTTP so quota is never spent twice and the
two sides can never disagree about what's cached. See market_store.js for the
cache itself.

Alpha Vantage has no futures coverage, so this cannot back an MGC series —
use frd_loader.py for that. What this loads is GOLD_SILVER_HISTORY (cached as
symbol="XAUUSD"), a daily spot print with no real intraday range: open, high
and low all equal close. Honest about that rather than fabricating a range.

Usage:
    from parity_engine.alphavantage_loader import load_cached_bars
    bars = load_cached_bars("XAUUSD")

Or run a backtest directly against the cached series:
    python -m parity_engine.alphavantage_loader XAUUSD
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from urllib.parse import urlencode

from parity_engine.engine import Bar

GATEWAY_URL = os.environ.get("GATEWAY_URL", "http://localhost:8001")
VEGA_API_KEY = os.environ.get("VEGA_API_KEY", "")


def load_cached_bars(symbol: str, timeframe: str = "1d", limit: int = 500) -> list[Bar]:
    """Fetch cached bars from GET /api/market/bars (never calls Alpha Vantage directly)."""
    qs = urlencode({"symbol": symbol, "timeframe": timeframe, "limit": limit})
    url = f"{GATEWAY_URL}/api/market/bars?{qs}"
    req = urllib.request.Request(url)
    if VEGA_API_KEY:
        req.add_header("X-Vega-Key", VEGA_API_KEY)

    with urllib.request.urlopen(req, timeout=10) as resp:
        payload = json.loads(resp.read())

    bars: list[Bar] = []
    for i, row in enumerate(payload.get("bars", [])):
        bars.append(Bar(
            index=i,
            time=int(row["time"]),
            open=float(row["open"]),
            high=float(row["high"]),
            low=float(row["low"]),
            close=float(row["close"]),
            volume=float(row["volume"]) if row.get("volume") is not None else 0.0,
        ))
    return bars


def _demo_payload(symbol: str) -> dict:
    """A simple long-only demo spec — same shape frd_loader uses for its demo run."""
    return {
        "schemaVersion": 1, "strategyId": "alphavantage_daily", "generatedFrom": "alphavantage_loader",
        "asset": {"symbol": symbol, "timeframe": "1d"},
        "session": {"name": "None", "timezone": "UTC", "start": "00:00", "end": "23:59", "rthOnly": False},
        "execution": {
            "confirmOnBarClose": True, "recalcMode": "close_only",
            "fillMode": "next_open", "slippageTicks": 0,
            "commissionType": "cash_per_contract", "commissionValue": 0.0,
            "processOrdersOnClose": False,
        },
        "sizing": {"initialCapital": 10000, "qtyType": "fixed", "qtyValue": 1},
        "entry": {"side": "long", "orderType": "market",
                  "conditions": [{"id": "c1", "expression": "close > open"}]},
        "exit": {"stop": {"mode": "fixed_ticks", "value": 200},
                 "target": {"mode": "fixed_ticks", "value": 400}},
        "risk": {"maxDrawdownPct": 10.0, "maxConsecutiveLosses": 5},
    }


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python -m parity_engine.alphavantage_loader <symbol> [timeframe]")
        print("Example: python -m parity_engine.alphavantage_loader XAUUSD")
        sys.exit(1)

    from datetime import datetime, timezone

    from parity_engine.contract import BacktestPayload, resolve_economics
    from parity_engine.metrics import compute_metrics
    from parity_engine.risk_engine import RiskEngine

    symbol = sys.argv[1]
    timeframe = sys.argv[2] if len(sys.argv) > 2 else "1d"
    bars = load_cached_bars(symbol, timeframe)
    if not bars:
        print(f"No cached bars for {symbol}/{timeframe}. Run POST /api/market/refresh on the gateway first.")
        sys.exit(1)

    payload = BacktestPayload.from_dict(_demo_payload(symbol))
    tick, point = resolve_economics(payload.asset)

    first = datetime.fromtimestamp(bars[0].time / 1000, tz=timezone.utc)
    last = datetime.fromtimestamp(bars[-1].time / 1000, tz=timezone.utc)
    print(f"Loaded {len(bars)} cached bars for {symbol}/{timeframe}")
    print(f"Range: {first:%Y-%m-%d} -> {last:%Y-%m-%d} UTC")
    print("Note: Alpha Vantage's gold/silver series is a spot close, not an OHLC session —")
    print("      open/high/low all equal close on every bar.")

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
    print(f"Risk status    : {result.risk_status.upper()}")


if __name__ == "__main__":
    main()
