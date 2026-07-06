"""
Parameter Sweep Wrapper
Grid-searches over key strategy parameters and produces results CSV.

Usage:
    python sweep_parameters.py <csv_path> \
        --offset-range 2.0,4.0,0.5 \
        --sl-range 10,20,2 \
        --trail-act-range 2,6,1

Output: sweep_results.csv with columns: offset, sl, trail_act, total_trades, wins, losses, win_rate, net_pnl, return_pct
"""

import sys
import csv
from typing import List, Tuple
import importlib.util

def load_backtester():
    """Dynamically load the backtester module."""
    spec = importlib.util.spec_from_file_location("backtester", "liquidity_sweep_backtester_final.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def parse_range(range_str: str) -> List[float]:
    """Parse 'start,end,step' or 'val1,val2,val3' into list."""
    parts = [float(x) for x in range_str.split(',')]
    if len(parts) == 3:
        start, end, step = parts
        vals = []
        v = start
        while v <= end + 1e-6:
            vals.append(round(v, 2))
            v += step
        return vals
    return parts

def run_sweep(csv_path: str, offset_range, sl_range, trail_act_range):
    """Run grid search over parameter ranges."""
    bt = load_backtester()
    
    bars = bt.load_csv(csv_path)
    print(f"Loaded {len(bars)} bars from {csv_path}\n")
    
    results = []
    
    for offset in offset_range:
        for sl in sl_range:
            for trail_act in trail_act_range:
                cfg = bt.Config()
                cfg.offset_price_l = offset
                cfg.sl_l = sl
                cfg.trail_act_l = trail_act
                
                trades = bt.run_backtest(bars, cfg)
                closed = [t for t in trades if t.exit_price is not None]
                
                if closed:
                    wins = [t for t in closed if t.pnl_usd > 0]
                    losses = [t for t in closed if t.pnl_usd < 0]
                    total_pnl = sum(t.pnl_usd for t in closed)
                    win_rate = len(wins) / len(closed) * 100
                    ret = total_pnl / cfg.initial_capital * 100
                    
                    results.append({
                        'offset': offset,
                        'sl': sl,
                        'trail_act': trail_act,
                        'total_trades': len(closed),
                        'wins': len(wins),
                        'losses': len(losses),
                        'win_rate': round(win_rate, 2),
                        'net_pnl': round(total_pnl, 2),
                        'return_pct': round(ret, 2),
                    })
                    
                    print(f"offset={offset:.1f} sl={sl:.0f} trail={trail_act:.1f} → "
                          f"trades={len(closed)} wins={len(wins)} wr={win_rate:.1f}% pnl=${total_pnl:.0f}")
    
    # Sort by return descending
    results.sort(key=lambda r: r['return_pct'], reverse=True)
    
    return results

def main():
    if len(sys.argv) < 2:
        print("Usage: python sweep_parameters.py <csv_path> [--offset-range START,END,STEP] ...")
        print("Example: python sweep_parameters.py mgc1_13m.csv \\")
        print("  --offset-range 2.0,4.0,0.5 --sl-range 10,20,2 --trail-act-range 2,6,1")
        sys.exit(1)
    
    csv_path = sys.argv[1]
    
    # Parse CLI args
    kwargs = {}
    i = 2
    while i < len(sys.argv):
        if sys.argv[i].startswith('--'):
            key = sys.argv[i][2:].replace('-', '_')
            if i + 1 < len(sys.argv) and not sys.argv[i + 1].startswith('--'):
                kwargs[key] = parse_range(sys.argv[i + 1])
                i += 2
            else:
                i += 1
        else:
            i += 1
    
    # Defaults
    offset_range = kwargs.get('offset_range', [2.0, 3.0, 4.0])
    sl_range = kwargs.get('sl_range', [10, 14, 18])
    trail_act_range = kwargs.get('trail_act_range', [2, 4, 6])
    
    print(f"Parameter ranges:")
    print(f"  offset: {offset_range}")
    print(f"  sl: {sl_range}")
    print(f"  trail_act: {trail_act_range}")
    print(f"  Total combos: {len(offset_range) * len(sl_range) * len(trail_act_range)}\n")
    
    results = run_sweep(csv_path, offset_range, sl_range, trail_act_range)
    
    # Export
    with open('sweep_results.csv', 'w', newline='') as f:
        if results:
            writer = csv.DictWriter(f, fieldnames=results[0].keys())
            writer.writeheader()
            writer.writerows(results)
    
    print(f"\n✓ Exported {len(results)} results to sweep_results.csv")
    print(f"\nTop 3 parameter sets:")
    for i, r in enumerate(results[:3]):
        print(f"  {i+1}. offset={r['offset']} sl={r['sl']} trail={r['trail_act']} → "
              f"{r['total_trades']} trades, {r['win_rate']}% WR, ${r['net_pnl']} PnL ({r['return_pct']}%)")

if __name__ == '__main__':
    main()
