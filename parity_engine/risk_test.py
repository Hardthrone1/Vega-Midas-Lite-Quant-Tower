"""Risk engine assertion suite — run with: python -m parity_engine.risk_test

Proves:
  1. Daily loss is PER-DAY (two days each under the limit do not sum to a halt)
  2. A single day breaching the daily limit HALTS: no trades after the halt
     bar, open position force-closed, equity flat to the end
  3. Drawdown breach halts with real enforcement
  4. Consecutive-loss warning fires (warn, not halt)
  5. Clean profitable run reports zero violations
  6. Sharpe is None on zero-variance PnL (no 1e16 blowups)
"""
from datetime import datetime, timezone

from parity_engine.contract import BacktestPayload
from parity_engine.engine import bars_from_dicts
from parity_engine.risk_engine import RiskEngine

BAR_MS = 300000  # 5m


def _ms(*args):
    return int(datetime(*args, tzinfo=timezone.utc).timestamp() * 1000)


def make_payload(stop_ticks=10, target_ticks=400, risk=None, commission=0.0):
    return BacktestPayload.from_dict({
        "schemaVersion": 1, "strategyId": "risk_test", "generatedFrom": "test",
        "asset": {"symbol": "MGC1!", "timeframe": "5m"},
        "session": {},
        "execution": {
            "confirmOnBarClose": True, "recalcMode": "close_only",
            "fillMode": "next_open", "slippageTicks": 0,
            "commissionType": "cash_per_contract", "commissionValue": commission,
            "processOrdersOnClose": False,
        },
        "sizing": {"initialCapital": 10000, "qtyType": "fixed", "qtyValue": 1},
        "entry": {"side": "long", "orderType": "market",
                  "conditions": [{"id": "c1", "expression": "close > open"}]},
        "exit": {"stop": {"mode": "fixed_ticks", "value": stop_ticks},
                 "target": {"mode": "fixed_ticks", "value": target_ticks}},
        "risk": risk or {},
    })


def bars_ohlc(rows, t0):
    return bars_from_dicts([
        {"time": t0 + i * BAR_MS, "open": o, "high": h, "low": lo, "close": c,
         "volume": 100}
        for i, (o, h, lo, c) in enumerate(rows)
    ])


def losing_trade_rows(n, base=3350.0):
    """n back-to-back losing trades, 2 bars each. Stop 10 ticks (1.0pt=$10).

    bar 2k   : signal (close > open), range stays above the stop
    bar 2k+1 : entry fills at open, low sweeps through the stop -> -$10
    """
    rows = []
    for _ in range(n):
        rows.append((base, base + 0.6, base - 0.1, base + 0.5))   # signal
        rows.append((base, base + 0.1, base - 1.5, base - 1.2))   # stopped: -1.0pt
    return rows


# ---------------------------------------------------------------------------
# 1. Daily loss is per-day, not cumulative
# ---------------------------------------------------------------------------

def test_daily_loss_is_per_day():
    # 8 losers/day = -$80/day. Two days = -$160 cumulative, but neither day
    # breaches the $150 daily limit. The old cumulative logic halted here.
    payload = make_payload(risk={"maxDailyLossCurrency": 150.0})
    day1 = bars_ohlc(losing_trade_rows(8), _ms(2025, 3, 3, 14, 0))
    day2 = bars_ohlc(losing_trade_rows(8), _ms(2025, 3, 4, 14, 0))
    for b in day2:
        b.index += len(day1)
    r = RiskEngine(payload, day1 + day2).run()

    assert not any(v.limit_name == "maxDailyLossCurrency" for v in r.risk_violations), \
        "two -$80 days must NOT trip a $150 DAILY limit (cumulative bug)"
    assert r.trading_halted_at_bar is None
    assert abs(r.risk_metrics.daily_max_loss_usd - (-80.0)) < 1e-6
    print("PASS  daily loss per-day: -$80 + -$80 days don't trip a $150/day limit")


# ---------------------------------------------------------------------------
# 2. Daily-loss halt is enforced: nothing trades after the breach
# ---------------------------------------------------------------------------

def test_daily_halt_enforced():
    # Day 1: 16 losers -> breaches -$150 on the 16th (-$160). Day 2 has 8 more
    # perfectly good signals that must never become trades.
    payload = make_payload(risk={"maxDailyLossCurrency": 150.0})
    day1 = bars_ohlc(losing_trade_rows(16), _ms(2025, 3, 3, 14, 0))
    day2 = bars_ohlc(losing_trade_rows(8), _ms(2025, 3, 4, 14, 0))
    for b in day2:
        b.index += len(day1)
    r = RiskEngine(payload, day1 + day2).run()

    assert r.risk_status == "halt"
    assert r.trading_halted_at_bar == 31, f"halt at bar 31, got {r.trading_halted_at_bar}"
    closed = [t for t in r.engine_result.trades if not t.is_open]
    assert len(closed) == 16, f"expected 16 trades (none on day 2), got {len(closed)}"
    assert not any(t.is_open for t in r.engine_result.trades), "open trade must be force-closed"
    final = r.engine_result.equity_curve[-1]
    assert final["equity"] == 10000 - 160.0
    assert final.get("halted") is True, "post-halt curve must be flagged halted"
    assert r.engine_result.bars_processed == len(day1) + len(day2)
    print("PASS  daily halt enforced: 16 trades then flat, day 2 signals ignored")


# ---------------------------------------------------------------------------
# 3. Drawdown halt
# ---------------------------------------------------------------------------

def test_drawdown_halt():
    # Stop 600 ticks = 60pts = $600 = 6% of $10k -> breaches the 5% limit.
    payload = make_payload(stop_ticks=600, risk={"maxDrawdownPct": 5.0})
    rows = [
        (3350.0, 3351.0, 3349.0, 3350.8),   # signal
        (3350.0, 3350.5, 3280.0, 3282.0),   # entry 3350, crash through 3290 stop
        (3282.0, 3283.0, 3281.0, 3282.5),   # post-halt signal bar — must not trade
        (3282.5, 3284.0, 3282.0, 3283.5),
    ]
    r = RiskEngine(payload, bars_ohlc(rows, _ms(2025, 3, 3, 14, 0))).run()

    assert r.risk_status == "halt"
    v = next(v for v in r.risk_violations if v.limit_name == "maxDrawdownPct")
    assert v.severity == "halt" and v.actual_value > 5.0
    assert r.trading_halted_at_bar == 1
    closed = [t for t in r.engine_result.trades if not t.is_open]
    assert len(closed) == 1 and closed[0].net_pnl == -600.0
    print("PASS  drawdown halt: -$600 (6%) trips 5% limit, no trades after")


# ---------------------------------------------------------------------------
# 4. Consecutive-loss warning (warn severity, no halt)
# ---------------------------------------------------------------------------

def test_consecutive_loss_warning():
    payload = make_payload(risk={"maxConsecutiveLosses": 2})
    r = RiskEngine(payload, bars_ohlc(losing_trade_rows(3), _ms(2025, 3, 3, 14, 0))).run()

    assert r.risk_status == "warn"
    v = next(v for v in r.risk_violations if v.limit_name == "maxConsecutiveLosses")
    assert v.severity == "warn" and v.actual_value == 3
    assert r.trading_halted_at_bar is None
    print("PASS  consecutive losses: 3 > 2 warns without halting")


# ---------------------------------------------------------------------------
# 5. Clean run: zero violations
# ---------------------------------------------------------------------------

def test_no_violations():
    payload = make_payload(target_ticks=20,
                           risk={"maxDrawdownPct": 50.0, "maxDailyLossCurrency": 5000.0})
    rows = [
        (3350.0, 3351.0, 3349.0, 3351.0),   # signal
        (3350.0, 3352.5, 3349.5, 3352.2),   # entry 3350, target 3352 hit: +$20
    ]
    r = RiskEngine(payload, bars_ohlc(rows, _ms(2025, 3, 3, 14, 0))).run()

    assert r.risk_status == "ok" and not r.risk_violations
    assert r.trading_halted_at_bar is None
    print("PASS  clean run: profitable trade, zero violations")


# ---------------------------------------------------------------------------
# 6. Sharpe is None on zero-variance PnL
# ---------------------------------------------------------------------------

def test_sharpe_none_on_zero_variance():
    from parity_engine.metrics import compute_metrics
    payload = make_payload(target_ticks=20)
    rows = []
    for _ in range(3):  # three identical +$20 trades
        rows.append((3350.0, 3351.0, 3349.0, 3351.0))
        rows.append((3350.0, 3352.5, 3349.7, 3349.6))  # target 3352 hit, close<open
    r = RiskEngine(payload, bars_ohlc(rows, _ms(2025, 3, 3, 14, 0))).run()

    closed = [t for t in r.engine_result.trades if not t.is_open]
    assert len(closed) == 3
    assert len({t.net_pnl for t in closed}) == 1, "trades must be identical PnL"
    assert r.risk_metrics.sharpe_ratio is None, \
        f"zero-variance Sharpe must be None, got {r.risk_metrics.sharpe_ratio}"
    m = compute_metrics(r.engine_result.trades, r.engine_result.equity_curve, 10000)
    assert m["sharpe"] is None
    print("PASS  Sharpe: identical PnLs -> None, not 1e16")


if __name__ == "__main__":
    test_daily_loss_is_per_day()
    test_daily_halt_enforced()
    test_drawdown_halt()
    test_consecutive_loss_warning()
    test_no_violations()
    test_sharpe_none_on_zero_variance()
    print("\nAll risk-engine assertions passed.")
