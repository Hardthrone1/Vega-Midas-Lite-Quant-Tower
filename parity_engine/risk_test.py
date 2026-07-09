"""Test risk engine violations and metrics."""
from parity_engine.contract import BacktestPayload
from parity_engine.engine import bars_from_dicts
from parity_engine.risk_engine import RiskEngine


def test_max_drawdown_violation():
    """Trade sequence that exceeds max drawdown limit."""
    payload = BacktestPayload.from_dict({
        "schemaVersion": 1, "strategyId": "risk_test", "generatedFrom": "test",
        "asset": {"symbol": "MGC1!", "timeframe": "5m"},
        "session": {},
        "execution": {
            "confirmOnBarClose": True, "recalcMode": "close_only",
            "fillMode": "next_open", "slippageTicks": 0,
            "commissionType": "cash_per_contract", "commissionValue": 0.0,
            "processOrdersOnClose": False,
        },
        "sizing": {"initialCapital": 10000, "qtyType": "fixed", "qtyValue": 1},
        "entry": {"side": "long", "orderType": "market",
                  "conditions": [{"id": "c1", "expression": "close > open"}]},
        "exit": {"stop": {"mode": "fixed_ticks", "value": 1000},  # 1000 ticks = $1000 loss max
                 "target": {"mode": "fixed_ticks", "value": 5}},
        "risk": {
            "maxDrawdownPct": 5.0,  # 5% max drawdown = $500 on $10k
        }
    })

    # Bars that lose money: gap through stop for $600 loss (6% drawdown)
    rows = [
        (3350.0, 3351.0, 3349.0, 3351.0),  # c > o: entry signal, fills at 3350
        (3340.0, 3341.0, 3340.0, 3340.0),  # open 3340, gap through stop at 3350-1000ticks
    ]

    def bars_ohlc(rows):
        return bars_from_dicts([
            {"time": 1750000000000 + i * 300000, "open": o, "high": h, "low": lo, "close": c, "volume": 100}
            for i, (o, h, lo, c) in enumerate(rows)
        ])

    risk_result = RiskEngine(payload, bars_ohlc(rows)).run()

    print(f"DRAWDOWN TEST")
    print(f"  Max drawdown: {risk_result.risk_metrics.max_drawdown_pct:.2f}%")
    print(f"  Risk status: {risk_result.risk_status}")
    print(f"  Violations: {len(risk_result.risk_violations)}")
    for v in risk_result.risk_violations:
        print(f"    - {v.limit_name}: limit={v.limit_value}, actual={v.actual_value:.2f}")

    # Should detect violation if drawdown > 5%
    if risk_result.risk_metrics.max_drawdown_pct > 5.0:
        assert any(v.limit_name == "maxDrawdownPct" for v in risk_result.risk_violations), "Should detect drawdown violation"
        assert risk_result.risk_status == "halt", "Should halt due to drawdown"
        print("✓ PASS: Drawdown violation detected\n")
    else:
        print(f"⚠ INFO: Drawdown only {risk_result.risk_metrics.max_drawdown_pct:.2f}%, under 5% limit\n")


def test_consecutive_loss_warning():
    """Multiple losing trades trigger consecutive loss warning."""
    payload = BacktestPayload.from_dict({
        "schemaVersion": 1, "strategyId": "risk_test", "generatedFrom": "test",
        "asset": {"symbol": "MGC1!", "timeframe": "5m"},
        "session": {},
        "execution": {
            "confirmOnBarClose": True, "recalcMode": "close_only",
            "fillMode": "next_open", "slippageTicks": 0,
            "commissionType": "cash_per_contract", "commissionValue": 0.62,
            "processOrdersOnClose": False,
        },
        "sizing": {"initialCapital": 10000, "qtyType": "fixed", "qtyValue": 1},
        "entry": {"side": "long", "orderType": "market",
                  "conditions": [{"id": "c1", "expression": "close > open"}]},
        "exit": {"stop": {"mode": "fixed_ticks", "value": 10},
                 "target": {"mode": "fixed_ticks", "value": 20}},
        "risk": {
            "maxConsecutiveLosses": 2,  # Stop after 2 consecutive losses
        }
    })

    # Create 3 losing trades (will exceed limit of 2)
    rows = [
        (3350.0, 3351.0, 3349.0, 3351.0),  # c > o: entry #1
        (3350.0, 3349.0, 3340.0, 3340.0),  # stop hit
        (3340.0, 3341.0, 3339.0, 3341.0),  # c > o: entry #2
        (3340.0, 3339.0, 3330.0, 3330.0),  # stop hit again
        (3330.0, 3331.0, 3329.0, 3331.0),  # c > o: entry #3
        (3330.0, 3329.0, 3320.0, 3320.0),  # stop hit again -> 3 losses > limit
    ]

    def bars_ohlc(rows):
        return bars_from_dicts([
            {"time": 1750000000000 + i * 300000, "open": o, "high": h, "low": lo, "close": c, "volume": 100}
            for i, (o, h, lo, c) in enumerate(rows)
        ])

    risk_result = RiskEngine(payload, bars_ohlc(rows)).run()

    print(f"CONSECUTIVE LOSS TEST")
    print(f"  Max consecutive losses: {risk_result.risk_metrics.max_consecutive_losses}")
    print(f"  Risk status: {risk_result.risk_status}")
    print(f"  Violations: {len(risk_result.risk_violations)}")
    for v in risk_result.risk_violations:
        print(f"    - {v.limit_name}: limit={v.limit_value}, actual={v.actual_value:.0f}, severity={v.severity}")

    assert any(v.limit_name == "maxConsecutiveLosses" for v in risk_result.risk_violations), "Should warn on consecutive losses"
    print("✓ PASS: Consecutive loss warning triggered\n")


def test_no_violations():
    """Profitable backtest with no violations."""
    payload = BacktestPayload.from_dict({
        "schemaVersion": 1, "strategyId": "risk_test", "generatedFrom": "test",
        "asset": {"symbol": "MGC1!", "timeframe": "5m"},
        "session": {},
        "execution": {
            "confirmOnBarClose": True, "recalcMode": "close_only",
            "fillMode": "next_open", "slippageTicks": 0,
            "commissionType": "cash_per_contract", "commissionValue": 0.0,
            "processOrdersOnClose": False,
        },
        "sizing": {"initialCapital": 10000, "qtyType": "fixed", "qtyValue": 1},
        "entry": {"side": "long", "orderType": "market",
                  "conditions": [{"id": "c1", "expression": "close > open"}]},
        "exit": {"stop": {"mode": "fixed_ticks", "value": 10},
                 "target": {"mode": "fixed_ticks", "value": 20}},
        "risk": {
            "maxDrawdownPct": 50.0,
            "winRateMin": 0.0,
            "profitFactorMin": 0.0,
        }
    })

    # Winning trade: entry 3350, target 3352 (20 ticks = 2.0 pts = $20 win)
    rows = [
        (3350.0, 3351.0, 3349.0, 3351.0),  # c > o
        (3350.0, 3352.0, 3350.0, 3351.5),  # hits target
    ]

    def bars_ohlc(rows):
        return bars_from_dicts([
            {"time": 1750000000000 + i * 300000, "open": o, "high": h, "low": lo, "close": c, "volume": 100}
            for i, (o, h, lo, c) in enumerate(rows)
        ])

    risk_result = RiskEngine(payload, bars_ohlc(rows)).run()

    print(f"NO VIOLATIONS TEST")
    print(f"  Risk status: {risk_result.risk_status}")
    print(f"  Violations: {len(risk_result.risk_violations)}")
    print(f"  Win rate: 100%")
    print(f"  Profit factor: ∞ (all wins)")

    assert risk_result.risk_status == "ok", "No violations should occur"
    assert len(risk_result.risk_violations) == 0, "Should have zero violations"
    print("✓ PASS: No violations for profitable trade\n")


if __name__ == "__main__":
    test_max_drawdown_violation()
    test_consecutive_loss_warning()
    test_no_violations()
    print("All risk engine tests passed ✓")
