"""Python port of PineScripts/'Liquidity Sweep Strategy .txt' for parity runs.

Replicates TradingView's historical broker emulator on 5m bars:
  - script logic runs on bar close; orders placed at close are live from the
    next bar (one-tick execution delay)
  - intrabar fills walk the 4-point OHLC path: open -> nearer extreme ->
    farther extreme -> close
  - entry: stop orders at liq-candle high/low +/- offset, both sides working
    while flat; the un-filled side stays live until the entry bar's close
    (a hit on it reverses the position, mirroring strategy.entry)
  - exit: TP limit, SL stop, and trailing stop (activation offset + step
    offset) evaluated tick-by-tick; trailing peak tracking starts on the bar
    after entry, when strategy.exit first places the bracket

Usage:
    python pine_sweep_backtest.py mgc_5m_et.csv

Output: backtest_payload.json (parity_validator.py input format)
"""
import csv
import json
import sys
from datetime import datetime

EPS = 1e-9

CONFIG = {
    "entry_offset": 2.0,
    "point_mult": 1.0,
    "tp_points": 20.0,
    "sl_points": 10.0,
    "use_trail": True,
    "trail_act": 10.0,
    "trail_off": 2.0,
    "point_value": 10.0,   # $ per 1.0 price move per MGC contract
}

WINDOW_START = "2026-06-22 00:00:00"
WINDOW_END = "2026-07-07 19:20:00"


def load_bars(path):
    bars = []
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            bars.append({
                "dt": row["timestamp"],
                "o": float(row["open"]),
                "h": float(row["high"]),
                "l": float(row["low"]),
                "c": float(row["close"]),
            })
    return bars


def tick_path(o, h, l, c):
    """TradingView broker emulator's assumed intrabar path: the extreme
    nearer to the open is visited first (open-high-low-close if the high is
    closer, otherwise open-low-high-close)."""
    if h - o < o - l:
        return [o, h, l, c]
    return [o, l, h, c]


class Sim:
    def __init__(self, cfg):
        self.cfg = cfg
        self.pos = 0                  # 1 long, -1 short, 0 flat
        self.entry_price = 0.0
        self.entry_dt = ""
        self.buy_level = None         # working entry stops (this bar)
        self.sell_level = None
        self.exits_active = False     # bracket live (placed at prior close)
        self.trail_on = False
        self.trail_peak = 0.0
        self.trades = []

    # ----- position transitions -------------------------------------------
    def open_pos(self, direction, price, dt):
        self.pos = direction
        self.entry_price = round(price, 1)
        self.entry_dt = dt
        self.exits_active = False
        self.trail_on = False
        self.trail_peak = 0.0

    def close_pos(self, price, dt, reason):
        price = round(price, 1)
        pnl = (price - self.entry_price) * self.pos * self.cfg["point_value"]
        self.trades.append({
            "entry_dt": self.entry_dt,
            "entry_price": self.entry_price,
            "entry_signal": "long" if self.pos == 1 else "short",
            "exit_dt": dt,
            "exit_price": price,
            "exit_reason": reason,
            "pnl_usd": round(pnl, 2),
        })
        self.pos = 0
        self.exits_active = False
        self.trail_on = False

    # ----- exit bracket levels --------------------------------------------
    def sl_level(self):
        return self.entry_price - self.pos * self.cfg["sl_points"]

    def tp_level(self):
        return self.entry_price + self.pos * self.cfg["tp_points"]

    def act_level(self):
        return self.entry_price + self.pos * self.cfg["trail_act"]

    def eff_stop(self):
        sl = self.sl_level()
        if self.trail_on:
            trail = self.trail_peak - self.pos * self.cfg["trail_off"]
            return max(sl, trail) if self.pos == 1 else min(sl, trail)
        return sl

    # ----- tick processing -------------------------------------------------
    def on_open_tick(self, p, dt):
        if self.pos == 0:
            if self.buy_level is not None and p >= self.buy_level - EPS:
                lvl = self.buy_level
                self.buy_level = None
                self.open_pos(1, max(p, lvl), dt)
                return
            if self.sell_level is not None and p <= self.sell_level + EPS:
                lvl = self.sell_level
                self.sell_level = None
                self.open_pos(-1, min(p, lvl), dt)
                return
        elif self.exits_active:
            if self.cfg["use_trail"] and not self.trail_on and \
                    (p - self.act_level()) * self.pos >= -EPS:
                self.trail_on = True
                self.trail_peak = p
            stop = self.eff_stop()
            if (stop - p) * self.pos >= -EPS:
                self.close_pos(min(p, stop) if self.pos == 1 else max(p, stop),
                               dt, "TRAIL" if self.trail_on else "SL")
                return
            tp = self.tp_level()
            if (p - tp) * self.pos >= -EPS:
                # limit order: gap open fills at the better price
                self.close_pos(p, dt, "TP")

    def on_segment(self, a, b, dt):
        """Price moves linearly a -> b; fire orders in path order."""
        up = b > a
        while True:
            if self.pos == 0:
                if up and self.buy_level is not None and \
                        a - EPS <= self.buy_level <= b + EPS:
                    lvl = self.buy_level
                    self.buy_level = None
                    self.open_pos(1, lvl, dt)
                    a = lvl
                    continue
                if not up and self.sell_level is not None and \
                        b - EPS <= self.sell_level <= a + EPS:
                    lvl = self.sell_level
                    self.sell_level = None
                    self.open_pos(-1, lvl, dt)
                    a = lvl
                    continue
                return
            # in position
            if not self.exits_active:
                # bracket not yet placed (entry bar): only the leftover
                # opposite entry stop can act. Observed TradingView behavior
                # (trades 89/104/153/158 in the Pine export): it closes the
                # position at the stop level and stays flat - no reversal.
                if self.pos == 1 and not up and self.sell_level is not None \
                        and b - EPS <= self.sell_level <= a + EPS:
                    lvl = self.sell_level
                    self.sell_level = None
                    self.close_pos(lvl, dt, "OPP_STOP")
                    a = lvl
                    continue
                if self.pos == -1 and up and self.buy_level is not None \
                        and a - EPS <= self.buy_level <= b + EPS:
                    lvl = self.buy_level
                    self.buy_level = None
                    self.close_pos(lvl, dt, "OPP_STOP")
                    a = lvl
                    continue
                return
            # bracket live
            favorable = (up and self.pos == 1) or (not up and self.pos == -1)
            if favorable:
                if self.cfg["use_trail"] and not self.trail_on:
                    act = self.act_level()
                    if (b - act) * self.pos >= -EPS:
                        self.trail_on = True
                        self.trail_peak = act
                tp = self.tp_level()
                if (b - tp) * self.pos >= -EPS:
                    self.close_pos(tp, dt, "TP")
                    a = tp
                    continue
                if self.trail_on:
                    self.trail_peak = max(self.trail_peak, b) if self.pos == 1 \
                        else min(self.trail_peak, b)
                return
            # adverse move
            stop = self.eff_stop()
            if (a - stop) * self.pos >= -EPS and (stop - b) * self.pos >= -EPS:
                self.close_pos(stop, dt, "TRAIL" if self.trail_on else "SL")
                a = stop
                continue
            return

    # ----- bar close (script execution) ------------------------------------
    def on_close(self, bar, prev):
        liq = prev is not None and bar["h"] > prev["h"] and bar["l"] < prev["l"]
        if self.pos == 0:
            if liq:
                off = self.cfg["entry_offset"] * self.cfg["point_mult"]
                self.buy_level = round(bar["h"] + off, 1)
                self.sell_level = round(bar["l"] - off, 1)
        else:
            self.buy_level = None
            self.sell_level = None
            self.exits_active = True


def run(bars, cfg, sub_bars=None):
    """sub_bars: optional {5m timestamp -> [1m bars]} for real intrabar
    order simulation; falls back to the 4-tick path of the 5m bar. Trade
    timestamps always use the 5m bar time (what TradingView displays)."""
    sim = Sim(cfg)
    prev = None
    for bar in bars:
        subs = sub_bars.get(bar["dt"]) if sub_bars else None
        for piece in (subs or [bar]):
            path = tick_path(piece["o"], piece["h"], piece["l"], piece["c"])
            # every (sub-)bar open is a discrete tick: gap fills happen here
            sim.on_open_tick(path[0], bar["dt"])
            for a, b in zip(path, path[1:]):
                if a != b:
                    sim.on_segment(a, b, bar["dt"])
        sim.on_close(bar, prev)
        prev = bar
    return sim.trades


def main():
    bars_path = sys.argv[1] if len(sys.argv) > 1 else "mgc_5m_et.csv"
    bars = load_bars(bars_path)
    # TradingView's tester ran with bar detalization "4 ticks per bar", so the
    # default here is the matching 4-tick 5m path. --m1 <csv> walks real 1m
    # sub-bars instead (finer, but tighter trailing than the Pine truth).
    sub_bars = {}
    if "--m1" in sys.argv:
        m1_path = sys.argv[sys.argv.index("--m1") + 1]
        for b in load_bars(m1_path):
            t = b["dt"]
            slot = t[:15] + ("0" if int(t[15]) < 5 else "5") + ":00"
            sub_bars.setdefault(slot, []).append(b)
    trades = run(bars, CONFIG, sub_bars)
    in_window = [t for t in trades
                 if WINDOW_START <= t["entry_dt"] <= WINDOW_END]
    # number trades to line up with the Pine export where entries match, so
    # the divergence report reads 1:1 against the TradingView trade list
    try:
        with open("pine_truth_157_trades.csv", newline="") as f:
            pine_nums = {(r["entry_time"], r["signal"]): int(r["trade_num"])
                         for r in csv.DictReader(f)}
    except FileNotFoundError:
        pine_nums = {}
    num = 63
    for t in in_window:
        num = pine_nums.get((t["entry_dt"], t["entry_signal"]), num + 1)
        t["trade_num"] = num
    payload = {
        "instrument": "MGC",
        "contract": {"instrument": "MGC", "tick_size": 0.1, "tick_value": 1.0,
                     "point_value": 10.0, "margin_req": 2000.0},
        "config": CONFIG,
        "initial_capital": 50000.0,
        "bars_csv_path": bars_path,
        "trades": in_window,
        "backtest_timestamp": datetime.utcnow().isoformat(),
        "notes": (f"Liquidity Sweep Strategy (previous-bar sweep, stop entries) | "
                  f"{len(in_window)} trades in parity window "
                  f"{WINDOW_START}..{WINDOW_END} ET"),
    }
    with open("backtest_payload.json", "w") as f:
        json.dump(payload, f, indent=2)
    pnl = sum(t["pnl_usd"] for t in in_window)
    print(f"total trades: {len(trades)}, in window: {len(in_window)}, "
          f"net PnL: ${pnl:.0f}")


if __name__ == "__main__":
    main()
