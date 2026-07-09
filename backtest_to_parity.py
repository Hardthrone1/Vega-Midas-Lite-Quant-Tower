"""
Liquidity Sweep → Parity Engine Bridge

Runs liquidity_sweep backtester and feeds output into parity_engine
for live-vs-backtest validation.

Usage:
    python backtest_to_parity.py mgc1_13m.csv \
        --pine-truth pine_export.csv \
        --contract mgc

Output: divergence_report.json with pass/fail per trade, metrics alignment
"""

import sys
import json
import csv
from datetime import datetime
from typing import Dict, List, Any
from dataclasses import dataclass, asdict

# ============================================================================
# PAYLOAD CONTRACT (mirrors TS PythonBacktestPayload)
# ============================================================================

@dataclass
class ContractSpec:
    """Instrument tick economics. tick_value = tick_size * point_value."""
    instrument: str          # "MGC", "MNQ", "NQ"
    tick_size: float         # 0.1 for MGC
    tick_value: float        # $1.00 for MGC (0.1 * $10/pt)
    point_value: float       # $10 for MGC — dollars per 1.0 price move per contract
    margin_req: float        # $2000 for MGC

INSTRUMENT_DEFAULTS = {
    "MGC": ContractSpec("MGC", 0.1, 1.0, 10.0, 2000.0),
    "MNQ": ContractSpec("MNQ", 0.25, 0.5, 2.0, 4000.0),
    "NQ": ContractSpec("NQ", 0.25, 5.0, 20.0, 20000.0),
}

@dataclass
class BacktestConfig:
    """Strategy parameters."""
    offset_price_l: float
    bar_window_l: int
    tp_l: float
    sl_l: float
    trail_act_l: float
    trail_step_l: float
    pivot_len: int
    min_opp_breaks: int
    max_opp_breaks: int

@dataclass
class ClosedTrade:
    """Trade record from backtester."""
    trade_num: int
    entry_dt: str
    entry_price: float
    entry_signal: str
    exit_dt: str
    exit_price: float
    exit_reason: str
    pnl_usd: float

@dataclass
class PythonBacktestPayload:
    """Full payload for parity validation."""
    instrument: str
    contract: ContractSpec
    config: BacktestConfig
    initial_capital: float
    bars_csv_path: str
    trades: List[ClosedTrade]
    backtest_timestamp: str
    notes: str = ""

# ============================================================================
# BACKTEST EXECUTOR (minimal copy of liquidity_sweep logic)
# ============================================================================

def run_backtest(bars_path: str, cfg_dict: Dict[str, Any]) -> List[ClosedTrade]:
    """
    Run liquidity_sweep backtest, return closed trades.
    This mirrors liquidity_sweep_backtester.py logic.
    """
    # Load bars
    bars = []
    with open(bars_path) as f:
        for row in csv.DictReader(f):
            dt = datetime.fromisoformat(row.get('datetime') or row.get('time').replace('Z', '+00:00'))
            bars.append({
                'dt': dt,
                'h': float(row['high']),
                'l': float(row['low']),
                'c': float(row['close']),
                'o': float(row['open']),
            })
    
    # Compute pivots
    n, r = len(bars), cfg_dict['pivot_len']
    ph, pl = [None] * n, [None] * n
    for i in range(n - r):
        is_ph = all(bars[j]['h'] < bars[i]['h'] for j in range(max(0,i-r), min(n,i+r+1)) if j != i)
        is_pl = all(bars[j]['l'] > bars[i]['l'] for j in range(max(0,i-r), min(n,i+r+1)) if j != i)
        if is_ph: ph[i+r] = bars[i]['h']
        if is_pl: pl[i+r] = bars[i]['l']
    
    # Run backtest
    trades = []
    pos, sh, sl, ha, la = 0, None, None, False, False
    ld, bc, bl, bbi = 0, 0, None, None
    ep, tp, sl_p, ta, ts = 0.0, 0.0, 0.0, False, 0.0
    
    for i, b in enumerate(bars):
        # Update swing
        if ph[i]: sh, ha = ph[i], True
        if pl[i]: sl, la = pl[i], True
        
        # Detect breaks
        bb = ha and b['c'] > sh
        rb = la and b['c'] < sl
        
        if bb:
            if ld == 1: bc += 1
            else: ld, bc = 1, 1
        elif rb:
            if ld == -1: bc += 1
            else: ld, bc = -1, 1
        
        # Gate check
        gok = ld == -1 and cfg_dict['min_opp_breaks'] <= bc <= cfg_dict['max_opp_breaks']
        liq = i > 0 and b['h'] > bars[i-1]['h'] and b['l'] < bars[i-1]['l']
        
        # Entry
        if pos == 0 and liq and gok:
            bl = b['h'] + cfg_dict['offset_price_l']
            bbi = i
            ep, tp, sl_p = bl, bl + cfg_dict['tp_l'], bl - cfg_dict['sl_l']
            trades.append(ClosedTrade(
                trade_num=len(trades) + 1,
                entry_dt=b['dt'].isoformat(),
                entry_price=round(ep, 1),
                entry_signal=f"brk#{bc}",
                exit_dt="",
                exit_price=0.0,
                exit_reason="",
                pnl_usd=0.0
            ))
            pos = 1
            ta, ts = False, 0.0
        
        # Exit
        elif pos == 1:
            if i - bbi > cfg_dict['bar_window_l']:
                trades[-1].exit_dt = b['dt'].isoformat()
                trades[-1].exit_price = round(sl_p, 1)
                trades[-1].exit_reason = "SL_WINDOW"
                trades[-1].pnl_usd = (sl_p - ep) * cfg_dict['point_value']
                pos = 0
            else:
                # Trail
                if not ta and b['h'] >= ep + cfg_dict['trail_act_l']:
                    ta, ts = True, b['h'] - cfg_dict['trail_step_l']
                if ta: ts = max(ts, b['h'] - cfg_dict['trail_step_l'])
                
                es = ts if ta else sl_p
                hs = b['l'] <= es
                ht = b['h'] >= tp
                
                xp, xr = None, ""
                if hs and ht: xp, xr = es, "TRAIL" if ta else "SL"
                elif hs: xp, xr = es, "TRAIL" if ta else "SL"
                elif ht: xp, xr = tp, "TP"
                
                if xp:
                    trades[-1].exit_dt = b['dt'].isoformat()
                    trades[-1].exit_price = round(xp, 1)
                    trades[-1].exit_reason = xr
                    trades[-1].pnl_usd = (xp - ep) * cfg_dict['point_value']
                    pos = 0
    
    return trades

# ============================================================================
# PAYLOAD BUILDER
# ============================================================================

def build_payload(bars_path: str, contract_name: str, initial_capital: float = 50000.0) -> PythonBacktestPayload:
    """
    Run backtest and build full payload for parity validation.
    """
    cfg_dict = {
        'offset_price_l': 3.0,
        'bar_window_l': 7,
        'tp_l': 100.0,
        'sl_l': 14.0,
        'trail_act_l': 4.0,
        'trail_step_l': 0.1,
        'pivot_len': 5,
        'min_opp_breaks': 2,
        'max_opp_breaks': 6,
        'point_value': INSTRUMENT_DEFAULTS[contract_name].point_value,
    }
    
    trades = run_backtest(bars_path, cfg_dict)
    
    return PythonBacktestPayload(
        instrument=contract_name,
        contract=INSTRUMENT_DEFAULTS[contract_name],
        config=BacktestConfig(**{k: v for k, v in cfg_dict.items() if k in BacktestConfig.__dataclass_fields__}),
        initial_capital=initial_capital,
        bars_csv_path=bars_path,
        trades=trades,
        backtest_timestamp=datetime.utcnow().isoformat(),
        notes=f"Liquidity Sweep — Leg Break Gate | {len(trades)} closed trades"
    )

# ============================================================================
# OUTPUT
# ============================================================================

def main():
    if len(sys.argv) < 3:
        print("Usage: python backtest_to_parity.py <bars.csv> <contract> [--capital 50000]")
        print("Example: python backtest_to_parity.py mgc1_13m.csv MGC")
        sys.exit(1)
    
    bars_path = sys.argv[1]
    contract = sys.argv[2]
    capital = float(sys.argv[4]) if len(sys.argv) > 3 and sys.argv[3] == '--capital' else 50000.0
    
    print(f"Building payload: {contract} on {bars_path}")
    payload = build_payload(bars_path, contract, capital)
    
    # Export payload
    payload_dict = {
        'instrument': payload.instrument,
        'contract': {
            'instrument': payload.contract.instrument,
            'tick_size': payload.contract.tick_size,
            'tick_value': payload.contract.tick_value,
            'point_value': payload.contract.point_value,
            'margin_req': payload.contract.margin_req,
        },
        'config': {
            'offset_price_l': payload.config.offset_price_l,
            'bar_window_l': payload.config.bar_window_l,
            'tp_l': payload.config.tp_l,
            'sl_l': payload.config.sl_l,
            'trail_act_l': payload.config.trail_act_l,
            'trail_step_l': payload.config.trail_step_l,
            'pivot_len': payload.config.pivot_len,
            'min_opp_breaks': payload.config.min_opp_breaks,
            'max_opp_breaks': payload.config.max_opp_breaks,
        },
        'initial_capital': payload.initial_capital,
        'bars_csv_path': payload.bars_csv_path,
        'trades': [
            {
                'trade_num': t.trade_num,
                'entry_dt': t.entry_dt,
                'entry_price': t.entry_price,
                'entry_signal': t.entry_signal,
                'exit_dt': t.exit_dt,
                'exit_price': t.exit_price,
                'exit_reason': t.exit_reason,
                'pnl_usd': t.pnl_usd,
            }
            for t in payload.trades
        ],
        'backtest_timestamp': payload.backtest_timestamp,
        'notes': payload.notes,
    }
    
    with open('backtest_payload.json', 'w') as f:
        json.dump(payload_dict, f, indent=2)
    
    closed = [t for t in payload.trades if t.pnl_usd != 0]
    pnl = sum(t.pnl_usd for t in closed)
    
    print(f"✓ Exported to backtest_payload.json")
    print(f"  Instrument: {payload.instrument}")
    print(f"  Trades: {len(closed)}")
    print(f"  Net PnL: ${pnl:.0f}")

if __name__ == '__main__':
    main()
