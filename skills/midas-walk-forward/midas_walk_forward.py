"""
midas_walk_forward.py — Walk-Forward Optimization, as a Hermes runtime skill.

Skill ID:   QBT-002
Phase:      5
Status:     LIVE — rolls IS/OOS windows over real bars via the validated
            liquidity-sweep backtester (100% Pine parity match).

The anti-overfit guard is structural: parameters are chosen ONLY on each
in-sample window, then judged ONLY on the out-of-sample bars that follow it.
A parameter set that merely memorized its window dies in the OOS fold.
"""

from __future__ import annotations

import csv
import json
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime
from itertools import product
from pathlib import Path
from typing import Any, Optional

SKILL_ID = "QBT-002"

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT))

from liquidity_sweep_backtester import OHLCV  # noqa: E402  (bar dataclass)

# Search space mirrors hermes/gepa.py PARAM_BOUNDS for the gate params the
# backtester consumes. Combos with min_opp_breaks > max_opp_breaks are invalid.
GRID = {
    "pivot_len": list(range(2, 9)),          # 2..8
    "min_opp_breaks": list(range(1, 5)),     # 1..4
    "max_opp_breaks": list(range(2, 7)),     # 2..6
}

# Exit defaults mirror the committed parity payload's config block
# (backtest_payload.json: entry_offset 2.0 · tp 20 · sl 10 · trail 10/2.0),
# so the optimizer varies ONLY the gate params the grid covers.
DEFAULT_CFG = {
    "offset_price_l": 2.0,
    "bar_window_l": 7,
    "tp_l": 20.0,
    "sl_l": 10.0,
    "trail_act_l": 10.0,
    "trail_step_l": 2.0,
    "pivot_len": 5,
    "min_opp_breaks": 2,
    "max_opp_breaks": 6,
    "point_value": 10.0,
}


@dataclass
class STrade:
    entry_dt: datetime
    entry_price: float
    pnl_usd: float
    exit_reason: str


def run_strategy(bars: list[OHLCV], cfg: dict[str, Any]) -> list[STrade]:
    """Liquidity-sweep leg-break strategy on in-memory bars. Mirrors
    backtest_to_parity.run_backtest (the Pine-truth-validated translation):
    long-only, entries fill at the stop level on the signal bar."""
    n, r = len(bars), int(cfg["pivot_len"])
    ph: list[Optional[float]] = [None] * n
    pl: list[Optional[float]] = [None] * n
    for i in range(n - r):
        lo_j, hi_j = max(0, i - r), min(n, i + r + 1)
        if all(bars[j].high < bars[i].high for j in range(lo_j, hi_j) if j != i):
            ph[i + r] = bars[i].high
        if all(bars[j].low > bars[i].low for j in range(lo_j, hi_j) if j != i):
            pl[i + r] = bars[i].low

    trades: list[STrade] = []
    pos, sh, sl_lvl, ha, la = 0, None, None, False, False
    ld, bc, bbi = 0, 0, None
    ep = tp = sl_p = ts = 0.0
    ta = False

    for i, b in enumerate(bars):
        if ph[i] is not None:
            sh, ha = ph[i], True
        if pl[i] is not None:
            sl_lvl, la = pl[i], True

        bull_break = ha and b.close > sh
        bear_break = la and b.close < sl_lvl
        if bull_break:
            if ld == 1:
                bc += 1
            else:
                ld, bc = 1, 1
        elif bear_break:
            if ld == -1:
                bc += 1
            else:
                ld, bc = -1, 1

        gate_ok = ld == -1 and cfg["min_opp_breaks"] <= bc <= cfg["max_opp_breaks"]
        liq = i > 0 and b.high > bars[i - 1].high and b.low < bars[i - 1].low

        if pos == 0 and liq and gate_ok:
            ep = b.high + cfg["offset_price_l"]
            tp, sl_p = ep + cfg["tp_l"], ep - cfg["sl_l"]
            bbi = i
            trades.append(STrade(entry_dt=b.dt, entry_price=round(ep, 1),
                                 pnl_usd=0.0, exit_reason=""))
            pos, ta, ts = 1, False, 0.0
        elif pos == 1:
            if i - bbi > cfg["bar_window_l"]:
                trades[-1].pnl_usd = (sl_p - ep) * cfg["point_value"]
                trades[-1].exit_reason = "SL_WINDOW"
                pos = 0
            else:
                if not ta and b.high >= ep + cfg["trail_act_l"]:
                    ta, ts = True, b.high - cfg["trail_step_l"]
                if ta:
                    ts = max(ts, b.high - cfg["trail_step_l"])
                eff_stop = ts if ta else sl_p
                hit_stop, hit_tp = b.low <= eff_stop, b.high >= tp
                xp = eff_stop if hit_stop else (tp if hit_tp else None)
                if xp is not None:
                    trades[-1].pnl_usd = (round(xp, 1) - ep) * cfg["point_value"]
                    trades[-1].exit_reason = ("TRAIL" if ta else "SL") if hit_stop else "TP"
                    pos = 0

    return [t for t in trades if t.exit_reason]  # closed trades only

# Fitness weights follow the GEPA fitness shape (pnl-led, drawdown-penalized).
W_PNL, W_PF, W_WIN, W_DD, W_VOL = 0.30, 0.25, 0.20, 0.15, 0.10


@dataclass
class FoldResult:
    fold: int
    is_range: str
    oos_range: str
    best_params: dict[str, int]
    is_metrics: dict[str, Any]
    oos_metrics: dict[str, Any]
    efficiency: Optional[float]  # OOS EV/trade ÷ IS EV/trade


@dataclass
class WalkForwardResult:
    skill_id: str
    ok: bool
    bars_total: int = 0
    folds: list[dict] = field(default_factory=list)
    consensus_params: dict[str, int] = field(default_factory=dict)
    param_stability: float = 0.0    # 1.0 = same winner every fold
    wfe: Optional[float] = None     # per-bar OOS pnl ÷ per-bar IS pnl
    oos_profitable_folds: int = 0
    verdict: str = ""
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def load_bars(path: str) -> list[OHLCV]:
    """Loader tolerant of timestamp/datetime/time column names."""
    bars: list[OHLCV] = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            ts = row.get("timestamp") or row.get("datetime") or row.get("time") or ""
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                dt = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")
            bars.append(OHLCV(
                dt=dt,
                open=float(row["open"]), high=float(row["high"]),
                low=float(row["low"]), close=float(row["close"]),
                volume=int(float(row["volume"])) if row.get("volume") else 0,
            ))
    return bars


def _metrics(trades) -> dict[str, Any]:
    closed = [t for t in trades if t.pnl_usd is not None]
    pnls = [t.pnl_usd for t in closed]
    if not pnls:
        return {"trade_count": 0, "net_pnl": 0.0, "win_rate": 0.0,
                "profit_factor": 0.0, "ev_per_trade": 0.0, "max_drawdown": 0.0}
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    gp, gl = sum(wins), abs(sum(losses))
    peak = eq = max_dd = 0.0
    for p in pnls:
        eq += p
        peak = max(peak, eq)
        max_dd = max(max_dd, peak - eq)
    return {
        "trade_count": len(pnls),
        "net_pnl": round(sum(pnls), 2),
        "win_rate": round(len(wins) / len(pnls), 4),
        "profit_factor": round(gp / gl, 4) if gl > 0 else (99.0 if gp > 0 else 0.0),
        "ev_per_trade": round(sum(pnls) / len(pnls), 2),
        "max_drawdown": round(-max_dd, 2),
    }


def _fitness(m: dict[str, Any], capital: float, min_trades: int) -> float:
    """GEPA-shaped composite. Sub-min_trades sets score -inf so a single
    lucky trade can never win an in-sample window (first overfit guard)."""
    if m["trade_count"] < min_trades:
        return float("-inf")
    norm_pnl = m["net_pnl"] / capital
    pf = min(m["profit_factor"], 4.0) / 4.0
    dd_ratio = min(abs(m["max_drawdown"]) / capital, 1.0)
    vol_bonus = min(m["trade_count"] / 30.0, 1.0)
    return (W_PNL * norm_pnl + W_PF * pf + W_WIN * m["win_rate"]
            + W_DD * (1.0 - dd_ratio) + W_VOL * vol_bonus)


def _make_cfg(params: dict[str, int]) -> dict[str, Any]:
    return {**DEFAULT_CFG, **params}


def walk_forward_optimize(
    bars_path: str,
    folds: int = 4,
    is_ratio: float = 0.7,
    min_trades: int = 5,
    output: Optional[str] = None,
) -> WalkForwardResult:
    bars_file = Path(bars_path)
    if not bars_file.exists():
        return WalkForwardResult(SKILL_ID, ok=False, error=f"bars file not found: {bars_path}")

    try:
        bars = load_bars(bars_path)
    except Exception as e:
        return WalkForwardResult(SKILL_ID, ok=False, error=f"bar loading failed: {e}")

    n = len(bars)
    fold_span = n // folds
    is_len = int(fold_span * is_ratio)
    oos_len = fold_span - is_len
    if oos_len < 50:
        return WalkForwardResult(
            SKILL_ID, ok=False,
            error=f"OOS window too small ({oos_len} bars) — fewer folds or more data needed")

    combos = [dict(zip(GRID.keys(), vals)) for vals in product(*GRID.values())
              if vals[1] <= vals[2]]  # min_opp_breaks <= max_opp_breaks

    capital = 50000.0  # matches the parity run initial capital
    fold_results: list[FoldResult] = []
    winners: list[tuple] = []
    is_pnl_bars = oos_pnl_bars = 0.0
    is_bars_total = oos_bars_total = 0

    for k in range(folds):
        lo = k * fold_span
        is_bars = bars[lo : lo + is_len]
        oos_bars = bars[lo + is_len : lo + is_len + oos_len]

        best_score, best_params, best_is = float("-inf"), None, None
        for params in combos:
            m = _metrics(run_strategy(is_bars, _make_cfg(params)))
            s = _fitness(m, capital, min_trades)
            if s > best_score:
                best_score, best_params, best_is = s, params, m

        if best_params is None or best_score == float("-inf"):
            # No param set produced enough IS trades — fold is unusable.
            fold_results.append(FoldResult(
                fold=k + 1,
                is_range=f"{is_bars[0].dt} → {is_bars[-1].dt}",
                oos_range=f"{oos_bars[0].dt} → {oos_bars[-1].dt}",
                best_params={}, is_metrics={"trade_count": 0}, oos_metrics={},
                efficiency=None))
            continue

        oos_m = _metrics(run_strategy(oos_bars, _make_cfg(best_params)))
        eff = (round(oos_m["ev_per_trade"] / best_is["ev_per_trade"], 3)
               if best_is["ev_per_trade"] not in (0, 0.0) and oos_m["trade_count"] > 0
               else None)

        winners.append(tuple(sorted(best_params.items())))
        is_pnl_bars += best_is["net_pnl"]
        oos_pnl_bars += oos_m["net_pnl"]
        is_bars_total += len(is_bars)
        oos_bars_total += len(oos_bars)

        fold_results.append(FoldResult(
            fold=k + 1,
            is_range=f"{is_bars[0].dt} → {is_bars[-1].dt}",
            oos_range=f"{oos_bars[0].dt} → {oos_bars[-1].dt}",
            best_params=best_params,
            is_metrics=best_is,
            oos_metrics=oos_m,
            efficiency=eff))

    # Walk-forward efficiency, per-bar normalized so unequal window sizes
    # can't flatter the in-sample side.
    wfe = None
    if is_bars_total and oos_bars_total and is_pnl_bars > 0:
        wfe = round((oos_pnl_bars / oos_bars_total) / (is_pnl_bars / is_bars_total), 3)

    profitable_oos = sum(
        1 for f in fold_results if f.oos_metrics.get("net_pnl", 0) > 0)

    # Consensus = most frequent winning param set; stability = its share.
    consensus: dict[str, int] = {}
    stability = 0.0
    if winners:
        top = max(set(winners), key=winners.count)
        consensus = dict(top)
        stability = round(winners.count(top) / len(winners), 3)

    usable = [f for f in fold_results if f.best_params]
    if not usable:
        verdict = "NO_SIGNAL — no fold produced enough in-sample trades"
    elif wfe is not None and wfe >= 0.5 and profitable_oos >= max(1, len(usable) // 2):
        verdict = "ROBUST — OOS retains >=50% of IS edge across folds"
    elif wfe is not None and wfe >= 0.25:
        verdict = "MARGINAL — OOS edge decays substantially; treat IS metrics as optimistic"
    else:
        verdict = "OVERFIT — IS edge does not survive out-of-sample; do not deploy IS params"

    result = WalkForwardResult(
        skill_id=SKILL_ID, ok=True, bars_total=n,
        folds=[asdict(f) for f in fold_results],
        consensus_params=consensus, param_stability=stability,
        wfe=wfe, oos_profitable_folds=profitable_oos, verdict=verdict)

    if output:
        Path(output).write_text(json.dumps(result.to_dict(), indent=2), encoding="utf-8")
    return result


SKILL_DESCRIPTOR = {
    "id": SKILL_ID,
    "name": "MIDAS Walk-Forward",
    "entrypoint": walk_forward_optimize,
    "phase": 5,
    "runtime_skill": True,
    "sandbox": "PLT-005",
}


def _main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(prog="midas_walk_forward",
                                 description="Walk-forward optimization with OOS anti-overfit guard.")
    ap.add_argument("--bars", required=True, help="OHLCV CSV path")
    ap.add_argument("--folds", type=int, default=4)
    ap.add_argument("--is-ratio", type=float, default=0.7, help="in-sample share of each fold")
    ap.add_argument("--min-trades", type=int, default=5, help="min IS trades for a param set to qualify")
    ap.add_argument("--output", help="write JSON report to file")
    args = ap.parse_args(argv)

    r = walk_forward_optimize(args.bars, args.folds, args.is_ratio, args.min_trades, args.output)
    print(json.dumps(r.to_dict(), indent=2))
    return 0 if r.ok else 1


if __name__ == "__main__":
    raise SystemExit(_main())
