"""
pine_gen.py — Generate Pine Script v5 strategy from a canonical StrategySpec.

Produces paste-ready code that:
  - Passes validatePineScriptRules (barstate.isconfirmed, no lookahead, etc.)
  - Mirrors the exact entry/exit logic of pine_sweep_backtest.py
  - Includes commission, slippage, and named SL/TP variables for trap detection
"""

from __future__ import annotations

from codegen.strategy_spec import StrategySpec


def generate(spec: StrategySpec) -> str:
    symbol_root = spec.symbol.rstrip("1!")
    title = spec.name or f"MIDAS {spec.entry_type.replace('_', ' ').title()}"

    lines = [
        "//@version=5",
        f'strategy("{title}",',
        f'         overlay=true,',
        f'         initial_capital={spec.initial_capital},',
        f'         default_qty_type=strategy.fixed,',
        f'         default_qty_value={spec.qty},',
        f'         commission_type=strategy.commission.cash_per_contract,',
        f'         commission_value={spec.commission},',
        f'         slippage={spec.slippage},',
        f'         pyramiding={spec.pyramiding},',
        f'         process_orders_on_close=true)',
        "",
        "// ═══════════════════════════════════════════════════",
        f"// Generated from canonical spec: {title} v{spec.version}",
        "// DO NOT EDIT — regenerate from StrategySpec to keep parity",
        "// ═══════════════════════════════════════════════════",
        "",
    ]

    lines += _params_block(spec)
    lines.append("")

    if spec.entry_type == "liquidity_sweep":
        lines += _liquidity_sweep_logic(spec)
    else:
        lines += _breakout_logic(spec)

    lines += _exit_block(spec)
    lines += _window_filter(spec)

    return "\n".join(lines) + "\n"


def _params_block(spec: StrategySpec) -> list[str]:
    return [
        "// --- Parameters ---",
        f"entryOffset  = input.float({spec.entry_offset}, 'Entry Offset (points)')",
        f"tpPoints     = input.float({spec.tp_points}, 'Take Profit (points)')",
        f"slPoints     = input.float({spec.sl_points}, 'Stop Loss (points)')",
        f"useTrail     = input.bool({str(spec.use_trailing).lower()}, 'Use Trailing Stop')",
        f"trailAct     = input.float({spec.trail_activation}, 'Trail Activation (points)')",
        f"trailOff     = input.float({spec.trail_offset}, 'Trail Offset (points)')",
        f"pivotLen     = input.int({spec.pivot_len}, 'Pivot Length')",
        "",
    ]


def _liquidity_sweep_logic(spec: StrategySpec) -> list[str]:
    lines = [
        "// --- Pivot Detection ---",
        "ph = ta.pivothigh(high, pivotLen, pivotLen)",
        "pl = ta.pivotlow(low, pivotLen, pivotLen)",
        "",
        "var float swingHigh = na",
        "var float swingLow  = na",
        "",
        "if not na(ph)",
        "    swingHigh := ph",
        "if not na(pl)",
        "    swingLow := pl",
        "",
        "// --- Liquidity Sweep Entry ---",
        "var float buyLevel  = na",
        "var float sellLevel = na",
        "",
        "if barstate.isconfirmed",
        "    if not na(swingHigh)",
        "        buyLevel  := swingHigh + entryOffset",
        "    if not na(swingLow)",
        "        sellLevel := swingLow - entryOffset",
        "",
    ]

    if spec.entry_side in ("both", "long"):
        lines += [
            "    if strategy.position_size == 0 and not na(buyLevel)",
            "        strategy.entry('Long', strategy.long, stop=buyLevel)",
        ]
    if spec.entry_side in ("both", "short"):
        lines += [
            "    if strategy.position_size == 0 and not na(sellLevel)",
            "        strategy.entry('Short', strategy.short, stop=sellLevel)",
        ]

    lines.append("")
    return lines


def _breakout_logic(spec: StrategySpec) -> list[str]:
    lines = [
        "// --- Pivot Detection ---",
        "ph = ta.pivothigh(high, pivotLen, pivotLen)",
        "pl = ta.pivotlow(low, pivotLen, pivotLen)",
        "",
        "var float swingHigh = na",
        "var float swingLow  = na",
        "",
        "if not na(ph)",
        "    swingHigh := ph",
        "if not na(pl)",
        "    swingLow := pl",
        "",
        "// --- Breakout Entry ---",
        "if barstate.isconfirmed",
    ]

    if spec.entry_side in ("both", "long"):
        lines += [
            "    if close > swingHigh and strategy.position_size == 0",
            "        strategy.entry('Long', strategy.long)",
        ]
    if spec.entry_side in ("both", "short"):
        lines += [
            "    if close < swingLow and strategy.position_size == 0",
            "        strategy.entry('Short', strategy.short)",
        ]

    lines.append("")
    return lines


def _exit_block(spec: StrategySpec) -> list[str]:
    lines = [
        "// --- Exit Bracket ---",
        "var float tpLevel = na",
        "var float slLevel = na",
        "",
        "if strategy.position_size > 0",
        "    tpLevel := strategy.position_avg_price + tpPoints",
        "    slLevel := strategy.position_avg_price - slPoints",
        "if strategy.position_size < 0",
        "    tpLevel := strategy.position_avg_price - tpPoints",
        "    slLevel := strategy.position_avg_price + slPoints",
        "",
    ]

    if spec.use_trailing:
        lines += [
            "if strategy.position_size > 0",
            "    strategy.exit('Exit Long', 'Long',",
            "                  limit=tpLevel, stop=slLevel,",
            "                  trail_points=trailAct, trail_offset=trailOff)",
            "if strategy.position_size < 0",
            "    strategy.exit('Exit Short', 'Short',",
            "                  limit=tpLevel, stop=slLevel,",
            "                  trail_points=trailAct, trail_offset=trailOff)",
        ]
    else:
        lines += [
            "if strategy.position_size > 0",
            "    strategy.exit('Exit Long', 'Long',",
            "                  limit=tpLevel, stop=slLevel)",
            "if strategy.position_size < 0",
            "    strategy.exit('Exit Short', 'Short',",
            "                  limit=tpLevel, stop=slLevel)",
        ]

    lines.append("")
    return lines


def _window_filter(spec: StrategySpec) -> list[str]:
    if not spec.window_start and not spec.window_end:
        return []

    lines = ["// --- Time Window ---"]
    if spec.window_start:
        lines.append(f"// Window start: {spec.window_start}")
    if spec.window_end:
        lines.append(f"// Window end: {spec.window_end}")
    lines.append("")
    return lines
