"""
python_gen.py — Generate BacktestPayload JSON + sim CONFIG from a StrategySpec.

Produces:
  1. BacktestPayload JSON (feeds parity_engine.Engine)
  2. pine_sweep_backtest CONFIG dict (feeds the existing Sim class)

Both outputs mirror the same spec as the Pine generator, ensuring parity.
"""

from __future__ import annotations

import json
from typing import Any

from codegen.strategy_spec import StrategySpec


def generate_payload(spec: StrategySpec) -> dict[str, Any]:
    conditions = []
    if spec.entry_type == "liquidity_sweep":
        conditions = [
            {"id": "liq_sweep_long", "expression": f"close > swingHigh + {spec.entry_offset}"},
            {"id": "liq_sweep_short", "expression": f"close < swingLow - {spec.entry_offset}"},
        ]
    elif spec.entry_type == "breakout":
        conditions = [
            {"id": "breakout_long", "expression": "close > swingHigh"},
            {"id": "breakout_short", "expression": "close < swingLow"},
        ]

    trailing = {}
    if spec.use_trailing:
        trailing = {
            "enabled": True,
            "activationPoints": spec.trail_activation,
            "offsetPoints": spec.trail_offset,
        }

    return {
        "schemaVersion": 1,
        "strategyId": spec.name.lower().replace(" ", "_"),
        "generatedFrom": f"codegen/StrategySpec v{spec.version}",
        "asset": {
            "symbol": spec.symbol,
            "exchange": spec.exchange,
            "timeframe": spec.timeframe,
            "tickSize": spec.tick_size,
            "pointValue": spec.point_value,
        },
        "session": {
            "name": "ETH",
            "timezone": "America/New_York",
            "rthOnly": False,
        },
        "execution": {
            "confirmOnBarClose": spec.confirm_on_bar_close,
            "recalcMode": "close_only",
            "fillMode": "on_close",
            "slippageTicks": spec.slippage,
            "commissionType": "cash_per_contract",
            "commissionValue": spec.commission,
            "useBarMagnifier": False,
            "processOrdersOnClose": True,
        },
        "sizing": {
            "initialCapital": spec.initial_capital,
            "baseCurrency": "USD",
            "qtyType": "fixed",
            "qtyValue": spec.qty,
            "pyramiding": spec.pyramiding,
        },
        "entry": {
            "side": spec.entry_side,
            "orderType": "stop" if spec.entry_type == "liquidity_sweep" else "market",
            "conditions": conditions,
        },
        "exit": {
            "stop": {"points": spec.sl_points},
            "target": {"points": spec.tp_points},
            "trailing": trailing,
        },
        "structureFilters": {
            "pivotLen": spec.pivot_len,
            "minOppBreaks": spec.min_opp_breaks,
            "maxOppBreaks": spec.max_opp_breaks,
            "retraceThreshold": spec.retrace_threshold,
        },
    }


def generate_sim_config(spec: StrategySpec) -> dict[str, Any]:
    return {
        "entry_offset": spec.entry_offset,
        "point_mult": 1.0,
        "tp_points": spec.tp_points,
        "sl_points": spec.sl_points,
        "use_trail": spec.use_trailing,
        "trail_act": spec.trail_activation,
        "trail_off": spec.trail_offset,
        "point_value": spec.point_value,
    }


def generate_full(spec: StrategySpec) -> dict[str, Any]:
    return {
        "instrument": spec.symbol,
        "contract": {
            "instrument": spec.symbol,
            "tick_size": spec.tick_size,
            "tick_value": spec.tick_size * spec.point_value,
            "point_value": spec.point_value,
            "margin_req": 2000.0,
        },
        "config": generate_sim_config(spec),
        "initial_capital": spec.initial_capital,
        "backtest_payload": generate_payload(spec),
    }


def generate_json(spec: StrategySpec, indent: int = 2) -> str:
    return json.dumps(generate_full(spec), indent=indent)
