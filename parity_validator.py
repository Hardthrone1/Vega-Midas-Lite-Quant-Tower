"""
Parity Validator: Compare Python backtest vs Pine truth

Loads backtest_payload.json and Pine CSV export, matches trades,
and produces divergence report.

Usage:
    python parity_validator.py backtest_payload.json pine_truth.csv

Output: divergence_report.json with pass/fail, matched/unmatched trades
"""

import sys
import json
import csv
from typing import Dict, List, Any, Tuple
from dataclasses import dataclass

@dataclass
class Trade:
    num: int
    entry_dt: str
    entry_price: float
    entry_signal: str
    exit_dt: str
    exit_price: float
    exit_reason: str
    pnl_usd: float
    source: str  # "python" or "pine"

def load_payload(path: str) -> Dict[str, Any]:
    """Load backtest payload."""
    with open(path) as f:
        return json.load(f)

def load_pine_truth(path: str) -> List[Trade]:
    """Load Pine CSV truth export."""
    trades = []
    with open(path) as f:
        for row in csv.DictReader(f):
            trades.append(Trade(
                num=int(row['trade_num']),
                entry_dt=row['entry_time'],
                entry_price=float(row['entry_price']),
                entry_signal=row['signal'],
                exit_dt=row['exit_time'],
                exit_price=float(row['exit_price']),
                exit_reason="",  # Not in Pine CSV
                pnl_usd=float(row['pnl_usd']),
                source="pine"
            ))
    return trades

def normalize_dt(dt: str) -> str:
    """Normalize datetime for comparison (ignore timezone/microseconds)."""
    # ISO format: extract date + time only
    return dt[:19]  # YYYY-MM-DDTHH:MM:SS

def match_trades(python_trades: List[Trade], pine_trades: List[Trade]) -> Tuple[List[Dict], List[Trade], List[Trade]]:
    """
    Match Python trades to Pine trades.
    Returns (matched, unmatched_python, unmatched_pine)
    """
    matched = []
    unmatched_py = list(python_trades)
    unmatched_pine = list(pine_trades)
    
    for pt in python_trades:
        # Find matching Pine trade by entry datetime + signal (with tolerance)
        for pte in pine_trades:
            py_dt = normalize_dt(pt.entry_dt)
            pine_dt = normalize_dt(pte.entry_dt)
            
            if py_dt == pine_dt and pt.entry_signal == pte.entry_signal:
                # Match found
                divergences = []
                
                # Check entry price (allow 0.5 pt tolerance for rounding)
                if abs(pt.entry_price - pte.entry_price) > 0.5:
                    divergences.append(f"entry_price: {pt.entry_price} vs {pte.entry_price}")
                
                # Check exit price
                if abs(pt.exit_price - pte.exit_price) > 0.5:
                    divergences.append(f"exit_price: {pt.exit_price} vs {pte.exit_price}")
                
                # Check PnL (allow rounding $5)
                if abs(pt.pnl_usd - pte.pnl_usd) > 5:
                    divergences.append(f"pnl_usd: {pt.pnl_usd} vs {pte.pnl_usd}")
                
                matched.append({
                    'trade_num': pt.num,
                    'entry_dt': py_dt,
                    'entry_signal': pt.entry_signal,
                    'status': 'PASS' if not divergences else 'FAIL',
                    'divergences': divergences,
                })
                
                unmatched_py.remove(pt)
                unmatched_pine.remove(pte)
                break
    
    return matched, unmatched_py, unmatched_pine

def main():
    if len(sys.argv) < 3:
        print("Usage: python parity_validator.py <payload.json> <pine_truth.csv>")
        print("Example: python parity_validator.py backtest_payload.json pine_truth_122_trades.csv")
        sys.exit(1)
    
    payload_path = sys.argv[1]
    pine_path = sys.argv[2]
    
    print(f"Loading payload: {payload_path}")
    payload = load_payload(payload_path)
    python_trades = [
        Trade(t['trade_num'], t['entry_dt'], t['entry_price'], t['entry_signal'],
              t['exit_dt'], t['exit_price'], t['exit_reason'], t['pnl_usd'], "python")
        for t in payload['trades']
    ]
    print(f"  {len(python_trades)} trades")
    
    print(f"Loading Pine truth: {pine_path}")
    pine_trades = load_pine_truth(pine_path)
    print(f"  {len(pine_trades)} trades")
    
    # Match
    matched, unmatched_py, unmatched_pine = match_trades(python_trades, pine_trades)
    
    # Report
    report = {
        'payload': payload_path,
        'pine_truth': pine_path,
        'instrument': payload['instrument'],
        'summary': {
            'total_python_trades': len(python_trades),
            'total_pine_trades': len(pine_trades),
            'matched_trades': len(matched),
            'unmatched_python': len(unmatched_py),
            'unmatched_pine': len(unmatched_pine),
            'pass_count': sum(1 for m in matched if m['status'] == 'PASS'),
            'fail_count': sum(1 for m in matched if m['status'] == 'FAIL'),
            'overall_status': 'PASS' if all(m['status'] == 'PASS' for m in matched) and len(unmatched_py) == 0 and len(unmatched_pine) == 0 else 'FAIL',
        },
        'matched_trades': matched,
        'unmatched_python_trades': [{'num': t.num, 'entry': t.entry_dt, 'signal': t.entry_signal} for t in unmatched_py],
        'unmatched_pine_trades': [{'num': t.num, 'entry': t.entry_dt, 'signal': t.entry_signal} for t in unmatched_pine],
    }
    
    with open('divergence_report.json', 'w') as f:
        json.dump(report, f, indent=2)
    
    # Console output
    print(f"\n{'='*60}")
    print(f"PARITY VALIDATION REPORT")
    print(f"{'='*60}")
    print(f"Python trades:       {report['summary']['total_python_trades']}")
    print(f"Pine trades:         {report['summary']['total_pine_trades']}")
    print(f"Matched:             {report['summary']['matched_trades']}")
    print(f"  ✓ PASS:            {report['summary']['pass_count']}")
    print(f"  ✗ FAIL:            {report['summary']['fail_count']}")
    print(f"Unmatched (Python):  {report['summary']['unmatched_python']}")
    print(f"Unmatched (Pine):    {report['summary']['unmatched_pine']}")
    print(f"\nOVERALL: {report['summary']['overall_status']}")
    print(f"{'='*60}")
    print(f"\n✓ Report saved to divergence_report.json")
    
    if report['summary']['fail_count'] > 0:
        print(f"\nFailed matches:")
        for m in matched:
            if m['status'] == 'FAIL':
                print(f"  Trade {m['trade_num']} ({m['entry_signal']})")
                for div in m['divergences']:
                    print(f"    - {div}")

if __name__ == '__main__':
    main()
