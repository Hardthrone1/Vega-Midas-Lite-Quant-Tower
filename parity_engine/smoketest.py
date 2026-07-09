"""Smoke-test for the parity engine — run with: python -m parity_engine.smoketest

Assertion suite proving the contract economics are dollar-correct:
  1. PnL scales by pointValue (MGC: $10/pt) and commission is charged per side
  2. Slippage worsens the fill price ONCE — never double-charged as a fee
  3. A bar that gaps through a stop fills at the open, not the stop price
  4. Targets are limit orders: no slippage on target fills
  5. MNQ economics resolve correctly ($2/pt, 0.25 tick)
  6. Session window gates entries, DST-aware, incl. overnight (Globex) windows
  7. Trailing stop arms at activation, ratchets off prior-bar extremes, and
     exits as a stop-market

Then runs the original 80-bar demo and prints its metrics.
"""
from datetime import datetime, timezone

from parity_engine.contract import Asset, BacktestPayload, resolve_economics
from parity_engine.engine import Engine, bars_from_dicts
from parity_engine.metrics import compute_metrics


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

T0 = 1750000000000  # arbitrary epoch ms base for economics tests
BAR_MS = 300000     # 5m


def make_payload(symbol="MGC1!", slippage_ticks=0, commission=0.0,
                 stop_ticks=10, target_ticks=20, session=None, trailing=None):
    return BacktestPayload.from_dict({
        "schemaVersion": 1, "strategyId": "smoke", "generatedFrom": "test",
        "asset": {"symbol": symbol, "timeframe": "5m"},
        "session": session or {},
        "execution": {
            "confirmOnBarClose": True, "recalcMode": "close_only",
            "fillMode": "next_open", "slippageTicks": slippage_ticks,
            "commissionType": "cash_per_contract", "commissionValue": commission,
            "processOrdersOnClose": False,
        },
        "sizing": {"initialCapital": 10000, "qtyType": "fixed", "qtyValue": 1},
        "entry": {"side": "long", "orderType": "market",
                  "conditions": [{"id": "c1", "expression": "close > open"}]},
        "exit": {"stop": {"mode": "fixed_ticks", "value": stop_ticks},
                 "target": {"mode": "fixed_ticks", "value": target_ticks},
                 "trailing": trailing or {}},
    })


def bars_ohlc(rows, t0=T0):
    """rows: list of (open, high, low, close) tuples -> Bar list."""
    return bars_from_dicts([
        {"time": t0 + i * BAR_MS, "open": o, "high": h, "low": lo, "close": c,
         "volume": 100}
        for i, (o, h, lo, c) in enumerate(rows)
    ])


def approx(a, b, tol=1e-6):
    assert abs(a - b) <= tol, f"expected {b}, got {a}"


def one_closed_trade(payload, rows):
    result = Engine(payload, bars_ohlc(rows)).run()
    closed = [t for t in result.trades if not t.is_open]
    assert len(closed) == 1, f"expected exactly 1 closed trade, got {len(closed)}"
    return closed[0]


# ---------------------------------------------------------------------------
# 1. Point-value PnL + per-side commission (MGC: 0.1 tick, $10/pt)
# ---------------------------------------------------------------------------

def test_point_value_pnl():
    payload = make_payload(commission=0.62)
    # bar0 signals (close>open); bar1 fills entry at open 3350.0
    # stop = 3349.0 (10 ticks), target = 3352.0 (20 ticks)
    # bar2 touches the target from below -> exit at 3352.0
    t = one_closed_trade(payload, [
        (3350.0, 3351.5, 3349.8, 3351.0),
        (3350.0, 3351.0, 3349.5, 3350.5),
        (3350.5, 3352.5, 3350.2, 3352.2),
    ])
    approx(t.entry_fill.price, 3350.0)
    approx(t.exit_fill.price, 3352.0)
    approx(t.gross_pnl, 20.0)            # 2.0 pts x $10/pt x 1 contract
    approx(t.net_pnl, 20.0 - 2 * 0.62)   # commission per side only
    print("PASS  point-value PnL: 2.0pt MGC move = $20.00 gross, $18.76 net")


# ---------------------------------------------------------------------------
# 2. Slippage charged once, via the fill price (stop exit = stop-market)
# ---------------------------------------------------------------------------

def test_slippage_single_count():
    payload = make_payload(slippage_ticks=2)
    # entry: 3350.0 + 2 ticks = 3350.2 ; stop = 3349.2 ; exit slip -> 3349.0
    t = one_closed_trade(payload, [
        (3350.0, 3351.5, 3349.8, 3351.0),
        (3350.0, 3351.0, 3349.5, 3350.5),
        (3350.0, 3350.8, 3349.0, 3349.5),
    ])
    approx(t.entry_fill.price, 3350.2)
    approx(t.exit_fill.price, 3349.0)
    approx(t.net_pnl, -12.0)  # (3349.0-3350.2) x $10 — nothing subtracted twice
    approx(t.entry_fill.slippage, 2.0)  # 2 ticks x $1/tick, reporting only
    print("PASS  slippage: embedded in fills once, net = -$12.00 (was double-charged before)")


# ---------------------------------------------------------------------------
# 3. Gap through the stop fills at the open
# ---------------------------------------------------------------------------

def test_gap_through_stop():
    payload = make_payload()
    # entry 3350.0, stop 3349.0; next bar OPENS at 3345.0 (weekend-style gap)
    t = one_closed_trade(payload, [
        (3350.0, 3351.5, 3349.8, 3351.0),
        (3350.0, 3351.0, 3349.5, 3350.5),
        (3345.0, 3345.5, 3344.0, 3344.5),
    ])
    approx(t.exit_fill.price, 3345.0)  # the open, NOT the stop price
    approx(t.net_pnl, -50.0)           # -5.0 pts x $10
    print("PASS  gap-through-stop: fills at open 3345.0 for -$50.00, not at stop 3349.0")


# ---------------------------------------------------------------------------
# 4. Target is a limit order: no slippage on the target fill
# ---------------------------------------------------------------------------

def test_target_limit_no_slippage():
    payload = make_payload(slippage_ticks=2)
    # entry 3350.2 (slipped), target 3352.2; bar reaches it -> exact fill
    t = one_closed_trade(payload, [
        (3350.0, 3351.5, 3349.8, 3351.0),
        (3350.0, 3351.0, 3349.5, 3350.5),
        (3350.5, 3353.0, 3350.0, 3352.8),
    ])
    approx(t.exit_fill.price, 3352.2)
    approx(t.exit_fill.slippage, 0.0)
    approx(t.net_pnl, 20.0)
    print("PASS  target fills as limit: exact price, zero slippage")


# ---------------------------------------------------------------------------
# 5. MNQ economics ($2/pt, 0.25 tick)
# ---------------------------------------------------------------------------

def test_mnq_economics():
    tick, point = resolve_economics(Asset(symbol="MNQ1!", timeframe="5m"))
    approx(tick, 0.25)
    approx(point, 2.0)
    payload = make_payload(symbol="MNQ1!", target_ticks=20)  # 20 ticks = 5.0 pts
    t = one_closed_trade(payload, [
        (20000.0, 20003.0, 19999.0, 20002.0),
        (20000.0, 20002.0, 19998.0, 20001.0),
        (20001.0, 20006.0, 20000.0, 20005.5),
    ])
    approx(t.exit_fill.price, 20005.0)
    approx(t.net_pnl, 10.0)  # 5.0 pts x $2/pt
    print("PASS  MNQ economics: 5.0pt move = $10.00")


# ---------------------------------------------------------------------------
# 6. Session windowing (DST-aware, overnight windows)
# ---------------------------------------------------------------------------

def _ms(*args):
    return int(datetime(*args, tzinfo=timezone.utc).timestamp() * 1000)


def test_session_window():
    rth = {"name": "RTH", "timezone": "America/New_York",
           "start": "09:30", "end": "16:00", "rthOnly": True}
    eng = Engine(make_payload(session=rth), bars_ohlc([(1, 2, 0, 1.5)]))

    # 13:30 UTC is 08:30 EST in January (out) but 09:30 EDT in July (in) —
    # same UTC wall clock, different classification == DST-aware.
    assert not eng._in_session(_ms(2025, 1, 15, 13, 30))
    assert eng._in_session(_ms(2025, 7, 15, 13, 30))
    assert eng._in_session(_ms(2025, 1, 15, 14, 30))       # 09:30 EST
    assert not eng._in_session(_ms(2025, 7, 15, 20, 0))    # 16:00 EDT (exclusive end)
    assert eng._in_session(_ms(2025, 7, 15, 19, 59))       # 15:59 EDT

    globex = {"name": "Globex", "timezone": "America/New_York",
              "start": "18:00", "end": "17:00", "rthOnly": False}
    eng2 = Engine(make_payload(session=globex), bars_ohlc([(1, 2, 0, 1.5)]))
    assert eng2._in_session(_ms(2025, 1, 15, 7, 0))        # 02:00 ET — overnight wrap
    assert not eng2._in_session(_ms(2025, 1, 15, 22, 30))  # 17:30 ET — daily pause
    assert eng2._in_session(_ms(2025, 1, 15, 23, 30))      # 18:30 ET

    # Engine-level: identical bars, out-of-session timestamps -> zero entries.
    rows = [(3350.0 + i * 0.3, 3351.5 + i * 0.3, 3349.5 + i * 0.3, 3351.0 + i * 0.3)
            for i in range(10)]
    out_bars = bars_ohlc(rows, t0=_ms(2025, 1, 15, 13, 0))   # 08:00-08:45 EST
    in_bars = bars_ohlc(rows, t0=_ms(2025, 1, 15, 14, 30))   # 09:30-10:15 EST
    assert len(Engine(make_payload(session=rth), out_bars).run().trades) == 0
    assert len(Engine(make_payload(session=rth), in_bars).run().trades) > 0
    print("PASS  session window: DST-aware RTH + overnight Globex, entries gated")


# ---------------------------------------------------------------------------
# 7. Trailing stop (MGC: 0.1 tick, $10/pt)
# ---------------------------------------------------------------------------

def test_trailing_stop():
    # Trail: offset 10 ticks (1.0pt), arms after 20 ticks (2.0pt) of profit.
    # Fixed stop 100 ticks (far), target 400 ticks (far) — the trail must exit.
    payload = make_payload(stop_ticks=100, target_ticks=400,
                           trailing={"enabled": True, "mode": "ticks",
                                     "value": 10, "activation": 20})
    # bar0 signal; bar1 entry @3350.0, high 3352.5 >= 3352.0 arms the trail
    #   -> trail = 3352.5 - 1.0 = 3351.5 (takes effect NEXT bar)
    # bar2 low 3351.0 <= 3351.5 -> stop-market exit at 3351.5 (+1.5pt = $15)
    t = one_closed_trade(payload, [
        (3350.0, 3351.5, 3349.8, 3351.0),
        (3350.0, 3352.5, 3349.9, 3352.0),
        (3352.0, 3353.0, 3351.0, 3351.2),
    ])
    approx(t.exit_fill.price, 3351.5)
    approx(t.net_pnl, 15.0)

    # Same trade but the move never reaches activation: trail never arms,
    # the fixed stop (3340.0) governs and nothing exits on these bars.
    payload2 = make_payload(stop_ticks=100, target_ticks=400,
                            trailing={"enabled": True, "mode": "ticks",
                                      "value": 10, "activation": 20})
    result = Engine(payload2, bars_ohlc([
        (3350.0, 3351.5, 3349.8, 3351.0),
        (3350.0, 3351.5, 3349.9, 3350.4),   # high 3351.5 < 3352.0: not armed
        (3350.4, 3351.0, 3349.5, 3350.0),   # low 3349.5 > 3340: no exit
    ])).run()
    assert all(t.is_open for t in result.trades), "unarmed trail must not exit"
    print("PASS  trailing stop: arms at +2.0pt, ratchets to 3351.5, exits +$15.00")


# ---------------------------------------------------------------------------
# Original 80-bar demo
# ---------------------------------------------------------------------------

def demo():
    payload = BacktestPayload.from_dict({
        "schemaVersion": 1, "strategyId": "test_mgc", "generatedFrom": "0.1.0",
        "asset": {"symbol": "MGC1!", "timeframe": "5m"},
        "session": {"name": "NY Open", "timezone": "America/New_York", "rthOnly": True},
        "execution": {
            "confirmOnBarClose": True, "recalcMode": "close_only",
            "fillMode": "on_close", "slippageTicks": 2,
            "commissionType": "cash_per_contract", "commissionValue": 0.62,
            "processOrdersOnClose": False,
        },
        "sizing": {"initialCapital": 10000, "baseCurrency": "USD", "qtyType": "fixed", "qtyValue": 1, "pyramiding": 0},
        "entry": {
            "side": "long", "orderType": "market",
            "conditions": [{"id": "bar_dir", "expression": "close > open"}],
        },
        "exit": {
            "stop": {"mode": "fixed_ticks", "value": 10},
            "target": {"mode": "fixed_ticks", "value": 20},
            "trailing": {"enabled": False, "mode": "none", "value": None},
        },
        "risk": None,
    })

    base = 3350.0
    bars_raw = []
    for i in range(80):
        o = round(base + i * 0.3, 2)
        c = round(o + (0.4 if i % 3 != 2 else -0.2), 2)
        bars_raw.append({"time": 1750000000000 + i * 300000, "open": o,
            "high": round(max(o, c) + 0.6, 2), "low": round(min(o, c) - 0.5, 2),
            "close": c, "volume": 100})

    result = Engine(payload, bars_from_dicts(bars_raw)).run()
    metrics = compute_metrics(result.trades, result.equity_curve, 10000)

    closed = [t for t in result.trades if not t.is_open]
    print("\n--- 80-bar demo ---")
    print("Bars processed :", result.bars_processed)
    print("Closed trades  :", len(closed))
    print("Open trades    :", sum(1 for t in result.trades if t.is_open))
    print("+EV            :", metrics["ev"])
    print("Win rate       :", metrics["win_rate_pct"])
    print("Profit factor  :", metrics["profit_factor"])
    print("Kelly fraction :", metrics["kelly"])
    print("VaR 95%        :", metrics["var_95"])
    print("Max drawdown   :", metrics["max_drawdown_pct"])
    print("Sharpe         :", metrics["sharpe"])
    if result.trades:
        t = result.trades[0]
        print("Trade 0 entry price:", t.entry_fill.price, "| slip:", t.entry_fill.slippage, "| comm:", t.entry_fill.commission)


if __name__ == "__main__":
    test_point_value_pnl()
    test_slippage_single_count()
    test_gap_through_stop()
    test_target_limit_no_slippage()
    test_mnq_economics()
    test_session_window()
    test_trailing_stop()
    print("\nAll parity-engine economics assertions passed.")
    demo()
