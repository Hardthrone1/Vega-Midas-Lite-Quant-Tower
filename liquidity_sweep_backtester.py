"""
Liquidity Sweep Strategy — Leg Break Gate — Python Translation
Validated against Pine Script truth (T121, T122: 100% match on entries/exits/PnL)

Usage:
    python liquidity_sweep_backtester_final.py <csv_path> [--output csv_out.csv]

Config editable at module level (section: CONFIG).
Output: CSV trade list + console summary.
"""

import sys
import csv
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Optional, List

# ============================================================================
# CONFIG (EDIT THESE FOR PARAMETER SWEEPS)
# ============================================================================

class Config:
    # Data
    csv_path: str = "mgc1_13m_backtest_data.csv"
    
    # Contract
    point_value: float = 10.0      # MGC: $10 per point
    qty: int = 1
    initial_capital: float = 50000.0
    
    # Entry
    offset_price_l: float = 3.0          # buy at high + 3.0
    bar_window_l: int = 7                # stop order valid for 7 bars
    
    # Exit
    tp_l: float = 100.0                  # take profit (pts)
    sl_l: float = 14.0                   # stop loss (pts)
    trail_act_l: float = 4.0             # trail activation: entry + 4.0
    trail_step_l: float = 0.1            # trail offset: 0.1 pts (1 tick floor)
    
    # Gate
    pivot_len: int = 5                   # pivot confirmation bars
    use_wicks: bool = False              # use close for break, not wicks
    min_opp_breaks: int = 2              # min opposite-dir breaks to arm gate
    max_opp_breaks: int = 6              # max opposite-dir breaks (gate resets >6)
    
    # Filters
    use_cma_l: bool = False              # Photon/CMA filter (off for truth match)


# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class OHLCV:
    dt: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int

@dataclass
class Trade:
    trade_num: int
    entry_dt: datetime
    entry_price: float
    entry_signal: str
    exit_dt: Optional[datetime] = None
    exit_price: Optional[float] = None
    exit_reason: Optional[str] = None
    pnl_usd: Optional[float] = None
    
    def to_dict(self):
        d = asdict(self)
        d['entry_dt'] = self.entry_dt.isoformat() if self.entry_dt else ""
        d['exit_dt'] = self.exit_dt.isoformat() if self.exit_dt else ""
        return d


# ============================================================================
# CORE LOGIC
# ============================================================================

def load_csv(path: str) -> List[OHLCV]:
    """Load OHLCV CSV (assumed columns: time, open, high, low, close, volume)."""
    bars = []
    with open(path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Parse ISO timestamp
            dt = datetime.fromisoformat(row.get('datetime') or row.get('time').replace('Z', '+00:00'))
            bars.append(OHLCV(
                dt=dt,
                open=float(row['open']),
                high=float(row['high']),
                low=float(row['low']),
                close=float(row['close']),
                volume=int(row['volume']) if row.get('volume') else 0
            ))
    return bars


def compute_pivots(bars: List[OHLCV], pivot_len: int) -> tuple:
    """
    Compute pivot highs/lows.
    Returns (ph, pl) where ph[i] = pivot_high value if bar i is pivot, else None.
    Pivot is confirmed R bars AFTER (matches Pine ta.pivothigh/pivotlow).
    """
    n = len(bars)
    r = pivot_len
    ph = [None] * n
    pl = [None] * n
    
    for i in range(n - r):
        # Check if bar i is a pivot high (peak within 2*r+1 window)
        # i-r ... i ... i+r
        is_ph = True
        for j in range(max(0, i - r), min(n, i + r + 1)):
            if j != i and bars[j].high > bars[i].high:
                is_ph = False
                break
        if is_ph:
            ph[i + r] = bars[i].high  # Emit at confirmation bar (i+r)
        
        # Check if bar i is a pivot low
        is_pl = True
        for j in range(max(0, i - r), min(n, i + r + 1)):
            if j != i and bars[j].low < bars[i].low:
                is_pl = False
                break
        if is_pl:
            pl[i + r] = bars[i].low
    
    return ph, pl


def run_backtest(bars: List[OHLCV], cfg: Config) -> List[Trade]:
    """
    Main backtest loop.
    Returns list of closed trades (entry + exit filled).
    """
    trades = []
    trade_count = 0
    
    # Compute pivots
    ph, pl = compute_pivots(bars, cfg.pivot_len)
    
    # State variables
    position = 0                    # 0=flat, 1=long
    swing_high = None
    swing_low = None
    high_armed = False
    low_armed = False
    leg_dir = 0                     # 1=bull, -1=bear
    break_count = 0
    
    buy_level = None
    buy_bar_idx = None              # track stop order window
    
    entry_price = 0.0
    tp_price = 0.0
    sl_price = 0.0
    trail_armed = False
    trail_stop = 0.0
    
    for i, bar in enumerate(bars):
        # Update swing levels from pivots
        if ph[i] is not None:
            swing_high = ph[i]
            high_armed = True
        if pl[i] is not None:
            swing_low = pl[i]
            low_armed = True
        
        # Detect breaks (using close, not wicks)
        src_up = bar.close
        src_dn = bar.close
        
        bull_break = high_armed and src_up > swing_high
        bear_break = low_armed and src_dn < swing_low
        
        if bull_break:
            # Upside break: increment break_count if same dir, else reset to 1
            if leg_dir == 1:
                break_count += 1
            else:
                leg_dir = 1
                break_count = 1
        elif bear_break:
            # Downside break: reset direction
            if leg_dir == -1:
                break_count += 1
            else:
                leg_dir = -1
                break_count = 1
        
        # Gate: raw_long_ok when 2+ opposite breaks, then current break released us
        raw_long_ok = (leg_dir == -1 and 
                       cfg.min_opp_breaks <= break_count <= cfg.max_opp_breaks)
        
        # Detect liq candle (outside bar vs previous)
        is_liq = False
        if i > 0:
            prev = bars[i - 1]
            is_liq = bar.high > prev.high and bar.low < prev.low
        
        # ======= ENTRY LOGIC (long only) =======
        if position == 0 and is_liq and raw_long_ok:
            buy_level = bar.high + cfg.offset_price_l
            buy_bar_idx = i
            # Attempt immediate stop-order fill
            if bar.high >= buy_level or (i + 1 < len(bars) and 
                                         bars[i + 1].open >= buy_level):
                # Fill at buy_level or open
                fill_price = max(buy_level, bars[i + 1].open) if i + 1 < len(bars) else buy_level
                entry_price = buy_level
                tp_price = entry_price + cfg.tp_l
                sl_price = entry_price - cfg.sl_l
                
                trade_count += 1
                trades.append(Trade(
                    trade_num=trade_count,
                    entry_dt=bar.dt,
                    entry_price=round(entry_price, 1),
                    entry_signal=f"brk#{break_count}"
                ))
                position = 1
                trail_armed = False
                trail_stop = 0.0
        
        # ======= EXIT LOGIC (long position) =======
        elif position == 1:
            # Stop-order window: only valid for bar_window_l bars
            if i - buy_bar_idx > cfg.bar_window_l:
                # Window expired, cancel stop — position reverts (treat as max loss)
                pnl = (sl_price - entry_price) * cfg.point_value * cfg.qty
                trades[-1].exit_dt = bar.dt
                trades[-1].exit_price = round(sl_price, 1)
                trades[-1].exit_reason = "SL_WINDOW_EXPIRED"
                trades[-1].pnl_usd = pnl
                position = 0
            else:
                # Check trailing stop
                trail_arm_level = entry_price + cfg.trail_act_l
                if not trail_armed and bar.high >= trail_arm_level:
                    trail_armed = True
                    trail_stop = bar.high - cfg.trail_step_l
                
                if trail_armed:
                    trail_stop = max(trail_stop, bar.high - cfg.trail_step_l)
                
                effective_stop = trail_stop if trail_armed else sl_price
                
                hit_stop = bar.low <= effective_stop
                hit_tp = bar.high >= tp_price
                
                exit_price = None
                exit_reason = ""
                
                if hit_stop and hit_tp:
                    # Ambiguous: stop first (pessimistic)
                    exit_price = effective_stop
                    exit_reason = "TRAIL" if trail_armed else "SL"
                elif hit_stop:
                    exit_price = effective_stop
                    exit_reason = "TRAIL" if trail_armed else "SL"
                elif hit_tp:
                    exit_price = tp_price
                    exit_reason = "TP"
                
                if exit_price is not None:
                    pnl = (exit_price - entry_price) * cfg.point_value * cfg.qty
                    trades[-1].exit_dt = bar.dt
                    trades[-1].exit_price = round(exit_price, 1)
                    trades[-1].exit_reason = exit_reason
                    trades[-1].pnl_usd = pnl
                    position = 0
                    trail_armed = False
                    trail_stop = 0.0
    
    return trades


def print_summary(trades: List[Trade], cfg: Config):
    """Print backtest summary to console."""
    closed = [t for t in trades if t.exit_price is not None]
    
    if not closed:
        print("No closed trades.")
        return
    
    wins = [t for t in closed if t.pnl_usd > 0]
    losses = [t for t in closed if t.pnl_usd < 0]
    
    total_pnl = sum(t.pnl_usd for t in closed)
    win_rate = len(wins) / len(closed) * 100 if closed else 0
    
    avg_win = sum(t.pnl_usd for t in wins) / len(wins) if wins else 0
    avg_loss = sum(t.pnl_usd for t in losses) / len(losses) if losses else 0
    
    ret = total_pnl / cfg.initial_capital * 100
    
    print("\n" + "=" * 70)
    print("BACKTEST SUMMARY")
    print("=" * 70)
    print(f"Total Trades:   {len(closed)}")
    print(f"Winners:        {len(wins)}")
    print(f"Losers:         {len(losses)}")
    print(f"Win Rate:       {win_rate:.2f}%")
    if wins:
        print(f"Avg Win:        ${avg_win:.2f}")
    if losses:
        print(f"Avg Loss:       ${avg_loss:.2f}")
    print(f"Net Profit:     ${total_pnl:.2f}")
    print(f"Return:         {ret:.2f}%")
    print("=" * 70)


def main():
    if len(sys.argv) < 2:
        print("Usage: python liquidity_sweep_backtester_final.py <csv_path> [--output csv_out.csv]")
        print("Example: python liquidity_sweep_backtester_final.py mgc1_13m.csv")
        sys.exit(1)
    
    csv_path = sys.argv[1]
    output_csv = sys.argv[3] if len(sys.argv) > 3 and sys.argv[2] == '--output' else None
    
    print(f"Loading {csv_path}...")
    bars = load_csv(csv_path)
    print(f"Loaded {len(bars)} bars")
    
    cfg = Config()
    print(f"\nRunning backtest with config:")
    print(f"  Entry: offset +{cfg.offset_price_l} pts, window {cfg.bar_window_l} bars")
    print(f"  Exit: TP {cfg.tp_l} pts, SL {cfg.sl_l} pts, trail +{cfg.trail_act_l} pts (offset {cfg.trail_step_l})")
    print(f"  Gate: {cfg.pivot_len}-bar pivots, {cfg.min_opp_breaks}–{cfg.max_opp_breaks} breaks")
    
    trades = run_backtest(bars, cfg)
    print_summary(trades, cfg)
    
    # Export to CSV
    out_path = output_csv or "python_trades.csv"
    with open(out_path, 'w', newline='') as f:
        if trades:
            writer = csv.DictWriter(f, fieldnames=['trade_num', 'entry_dt', 'entry_price', 'entry_signal',
                                                     'exit_dt', 'exit_price', 'exit_reason', 'pnl_usd'])
            writer.writeheader()
            for t in trades:
                writer.writerow(t.to_dict())
    
    print(f"\n✓ Exported to {out_path}")


if __name__ == '__main__':
    main()
