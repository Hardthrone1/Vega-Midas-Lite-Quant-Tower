"""Smoke-test for the parity engine — run with: python -m parity_engine.smoketest"""
import json
from parity_engine.contract import BacktestPayload
from parity_engine.engine import Engine, bars_from_dicts
from parity_engine.metrics import compute_metrics

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

bars = bars_from_dicts(bars_raw)
engine = Engine(payload, bars)
result = engine.run()
metrics = compute_metrics(result.trades, result.equity_curve, 10000)

closed = [t for t in result.trades if not t.is_open]
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
