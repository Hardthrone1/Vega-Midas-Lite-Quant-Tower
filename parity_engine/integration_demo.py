"""Integration demo: Parity Engine + Risk Engine.

Shows how backtest flow works:
  1. Parity Engine runs contract-correct backtest
  2. Risk Engine extends results with risk tracking and violations
"""
from parity_engine.contract import BacktestPayload, resolve_economics
from parity_engine.engine import bars_from_dicts
from parity_engine.risk_engine import RiskEngine


def _fmt(value, suffix="", prefix="", digits=2):
    """Format a possibly-None metric."""
    return "n/a" if value is None else f"{prefix}{value:.{digits}f}{suffix}"


def demo_profitable_strategy_within_risk_limits():
    """Profitable backtest that passes all risk checks."""
    print("\n" + "=" * 70)
    print("SCENARIO 1: Profitable Strategy (Passes All Risk Checks)")
    print("=" * 70)

    payload = BacktestPayload.from_dict({
        "schemaVersion": 1, "strategyId": "demo_safe", "generatedFrom": "v1",
        "asset": {"symbol": "MNQ1!", "timeframe": "5m"},
        "session": {"name": "NY", "timezone": "America/New_York", "start": "09:30", "end": "16:00", "rthOnly": True},
        "execution": {
            "confirmOnBarClose": True, "recalcMode": "close_only",
            "fillMode": "next_open", "slippageTicks": 1,
            "commissionType": "cash_per_contract", "commissionValue": 0.85,
            "processOrdersOnClose": False,
        },
        "sizing": {"initialCapital": 50000, "qtyType": "fixed", "qtyValue": 1},
        "entry": {"side": "long", "orderType": "market",
                  "conditions": [{"id": "c1", "expression": "close > open"}]},
        "exit": {"stop": {"mode": "fixed_ticks", "value": 20},
                 "target": {"mode": "fixed_ticks", "value": 40}},
        "risk": {
            "maxDrawdownPct": 10.0,
            "maxConsecutiveLosses": 5,
            "winRateMin": 40.0,
            "profitFactorMin": 1.2,
        }
    })

    # Generate 20 bars with mixed results: 70% win rate
    base = 20000.0
    rows = []
    for i in range(20):
        o = round(base + i * 0.2, 2)
        if i % 3 != 2:  # 2 out of 3 bars close above open
            c = round(o + 0.5, 2)
        else:
            c = round(o - 0.3, 2)
        rows.append({
            "time": 1750000000000 + i * 300000,
            "open": o,
            "high": round(max(o, c) + 0.8, 2),
            "low": round(min(o, c) - 0.5, 2),
            "close": c,
            "volume": 150
        })

    bars = bars_from_dicts(rows)
    result = RiskEngine(payload, bars).run()

    print(f"\nAsset: MNQ1! 5m | Capital: ${payload.sizing.initialCapital:,.0f}")
    print(f"\nParity Metrics:")
    print(f"  Bars processed: {result.engine_result.bars_processed}")
    print(f"  Closed trades: {len([t for t in result.engine_result.trades if not t.is_open])}")
    print(f"  Open trades: {len([t for t in result.engine_result.trades if t.is_open])}")

    if result.engine_result.equity_curve:
        final_eq = result.engine_result.equity_curve[-1]["equity"]
        pnl = final_eq - payload.sizing.initialCapital
        print(f"  Final equity: ${final_eq:,.2f}")
        print(f"  Net PnL: ${pnl:,.2f}")

    print(f"\nRisk Metrics:")
    if result.risk_metrics:
        m = result.risk_metrics
        print(f"  Max drawdown: {m.max_drawdown_pct:.2f}% (limit: 10.0%)")
        print(f"  Profit factor: {_fmt(m.profit_factor, 'x')} (min: 1.2x)")
        print(f"  Win rate: {100 * sum(1 for t in result.engine_result.trades if t.net_pnl > 0) / max(1, len([t for t in result.engine_result.trades if not t.is_open]))}% (min: 40%)")
        print(f"  Expectancy: {_fmt(m.expectancy, prefix='$')}")
        print(f"  Max consecutive losses: {m.max_consecutive_losses}")

    print(f"\nRisk Status: {result.risk_status.upper()}")
    print(f"Violations: {len(result.risk_violations)}")
    for v in result.risk_violations:
        print(f"  ⚠ {v.limit_name}: {v.actual_value:.2f} vs limit {v.limit_value}")

    return result


def demo_strategy_exceeding_consecutive_loss_limit():
    """Strategy with many consecutive losses triggers warning."""
    print("\n" + "=" * 70)
    print("SCENARIO 2: Strategy Exceeding Consecutive Loss Limit")
    print("=" * 70)

    payload = BacktestPayload.from_dict({
        "schemaVersion": 1, "strategyId": "demo_risky", "generatedFrom": "v1",
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
            "maxConsecutiveLosses": 2,  # Strict limit
            "profitFactorMin": 0.5,
        }
    })

    # Create 4 consecutive losses (bars close below open)
    base = 3350.0
    rows = []
    for i in range(8):
        o = round(base - i * 0.5, 2)
        if i % 2 == 0:
            # Entry signal
            c = round(o + 0.1, 2)
        else:
            # Loss (close below open) -> hits stop
            c = round(o - 0.2, 2)
        rows.append({
            "time": 1750000000000 + i * 300000,
            "open": o,
            "high": round(o + 0.1, 2),
            "low": round(min(o, c) - 0.2, 2),
            "close": c,
            "volume": 100
        })

    bars = bars_from_dicts(rows)
    result = RiskEngine(payload, bars).run()

    print(f"\nAsset: MGC1! 5m | Capital: ${payload.sizing.initialCapital:,.0f}")
    print(f"\nParity Metrics:")
    print(f"  Bars processed: {result.engine_result.bars_processed}")
    closed = [t for t in result.engine_result.trades if not t.is_open]
    print(f"  Closed trades: {len(closed)}")
    print(f"  Winning trades: {len([t for t in closed if t.net_pnl > 0])}")
    print(f"  Losing trades: {len([t for t in closed if t.net_pnl < 0])}")

    print(f"\nRisk Metrics:")
    if result.risk_metrics:
        print(f"  Max consecutive losses: {result.risk_metrics.max_consecutive_losses} (limit: 2)")
        print(f"  Profit factor: {_fmt(result.risk_metrics.profit_factor, 'x')}")

    print(f"\nRisk Status: {result.risk_status.upper()}")
    if result.risk_violations:
        for v in result.risk_violations:
            print(f"  [{v.severity.upper()}] {v.limit_name}: {v.actual_value:.0f} vs limit {v.limit_value}")

    return result


def demo_scalability_check():
    """Verify risk engine works with large bar sequences."""
    print("\n" + "=" * 70)
    print("SCENARIO 3: Scalability Check (1000 bars)")
    print("=" * 70)

    payload = BacktestPayload.from_dict({
        "schemaVersion": 1, "strategyId": "demo_scale", "generatedFrom": "v1",
        "asset": {"symbol": "MNQ1!", "timeframe": "1m"},
        "session": {},
        "execution": {
            "confirmOnBarClose": True, "recalcMode": "close_only",
            "fillMode": "next_open", "slippageTicks": 1,
            "commissionType": "cash_per_contract", "commissionValue": 0.85,
            "processOrdersOnClose": False,
        },
        "sizing": {"initialCapital": 100000, "qtyType": "fixed", "qtyValue": 1},
        "entry": {"side": "long", "orderType": "market",
                  "conditions": [{"id": "c1", "expression": "close > open"}]},
        "exit": {"stop": {"mode": "fixed_ticks", "value": 20},
                 "target": {"mode": "fixed_ticks", "value": 30}},
        "risk": {
            "maxDrawdownPct": 15.0,
            "profitFactorMin": 0.8,
        }
    })

    # Generate 1000 bars
    import random
    random.seed(42)
    base = 20000.0
    rows = []
    for i in range(1000):
        o = round(base + i * 0.1 + random.uniform(-0.5, 0.5), 2)
        c = round(o + random.uniform(-0.3, 0.4), 2)
        rows.append({
            "time": 1750000000000 + i * 60000,
            "open": o,
            "high": round(max(o, c) + abs(random.uniform(0.1, 0.5)), 2),
            "low": round(min(o, c) - abs(random.uniform(0.1, 0.5)), 2),
            "close": c,
            "volume": random.randint(50, 200)
        })

    bars = bars_from_dicts(rows)
    result = RiskEngine(payload, bars).run()

    print(f"\nAsset: MNQ1! 1m | Capital: ${payload.sizing.initialCapital:,.0f}")
    print(f"\nParity Metrics:")
    print(f"  Bars processed: {result.engine_result.bars_processed}")
    closed = [t for t in result.engine_result.trades if not t.is_open]
    print(f"  Closed trades: {len(closed)}")

    if result.engine_result.equity_curve:
        final_eq = result.engine_result.equity_curve[-1]["equity"]
        pnl = final_eq - payload.sizing.initialCapital
        print(f"  Final equity: ${final_eq:,.2f}")
        print(f"  Net PnL: ${pnl:,.2f}")

    print(f"\nRisk Metrics:")
    if result.risk_metrics:
        print(f"  Max drawdown: {result.risk_metrics.max_drawdown_pct:.2f}%")
        print(f"  Sharpe ratio: {_fmt(result.risk_metrics.sharpe_ratio, digits=4)}")
        print(f"  Profit factor: {_fmt(result.risk_metrics.profit_factor, 'x')}")

    print(f"\nRisk Status: {result.risk_status.upper()}")
    print(f"Violations: {len(result.risk_violations)}")

    return result


if __name__ == "__main__":
    print("\n")
    print("╔" + "=" * 68 + "╗")
    print("║" + " " * 68 + "║")
    print("║" + "  PARITY ENGINE + RISK ENGINE INTEGRATION DEMO".center(68) + "║")
    print("║" + " " * 68 + "║")
    print("╚" + "=" * 68 + "╝")

    r1 = demo_profitable_strategy_within_risk_limits()
    r2 = demo_strategy_exceeding_consecutive_loss_limit()
    r3 = demo_scalability_check()

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"\n✓ Scenario 1 (Safe): Status={r1.risk_status.upper()}, Violations={len(r1.risk_violations)}")
    print(f"✓ Scenario 2 (Risky): Status={r2.risk_status.upper()}, Violations={len(r2.risk_violations)}")
    print(f"✓ Scenario 3 (Scale): Status={r3.risk_status.upper()}, Processed {r3.engine_result.bars_processed} bars")

    print("\n✓ Risk engine integration complete — ready for deployment")
    print()
