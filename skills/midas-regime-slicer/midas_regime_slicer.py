"""
midas_regime_slicer.py — Regime-Conditional Backtest Slicer, as a Hermes runtime skill.

Skill ID:   QBT-003
Phase:      5
Status:     LIVE — classifies every bar into one of four regimes using
            trailing-only indicators (no lookahead), then slices backtest
            trades by the regime in force at ENTRY.

Regimes (trend gate first, volatility split inside range):
  TREND_UP        efficiency ratio >= threshold, net drift up
  TREND_DOWN      efficiency ratio >= threshold, net drift down
  RANGE_QUIET     below threshold, ATR percentile < 0.5
  RANGE_VOLATILE  below threshold, ATR percentile >= 0.5
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Optional

SKILL_ID = "QBT-003"

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT))
sys.path.insert(0, str(_REPO_ROOT / "skills" / "midas-walk-forward"))

from liquidity_sweep_backtester import OHLCV  # noqa: E402  (bar dataclass)
from midas_walk_forward import DEFAULT_CFG, load_bars, run_strategy  # noqa: E402

REGIMES = ("TREND_UP", "TREND_DOWN", "RANGE_QUIET", "RANGE_VOLATILE")


@dataclass
class RegimeSliceResult:
    skill_id: str
    ok: bool
    bars_total: int = 0
    trades_total: int = 0
    params: dict[str, Any] = field(default_factory=dict)
    classifier: dict[str, Any] = field(default_factory=dict)
    regime_coverage: dict[str, float] = field(default_factory=dict)   # share of bars
    regimes: dict[str, dict[str, Any]] = field(default_factory=dict)  # per-regime metrics
    best_regime: Optional[str] = None
    worst_regime: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _atr_series(bars: list[OHLCV], length: int) -> list[Optional[float]]:
    trs: list[float] = []
    out: list[Optional[float]] = []
    prev_close = None
    atr = None
    for b in bars:
        tr = b.high - b.low if prev_close is None else max(
            b.high - b.low, abs(b.high - prev_close), abs(b.low - prev_close))
        trs.append(tr)
        if len(trs) < length:
            out.append(None)
        elif atr is None:
            atr = sum(trs[-length:]) / length
            out.append(atr)
        else:
            atr = (atr * (length - 1) + tr) / length  # Wilder smoothing
            out.append(atr)
        prev_close = b.close
    return out


def classify_regimes(
    bars: list[OHLCV],
    er_window: int = 48,
    er_threshold: float = 0.30,
    atr_length: int = 14,
    vol_lookback: int = 400,
) -> list[Optional[str]]:
    """Regime label per bar from TRAILING data only — the label at bar i uses
    nothing after bar i, so slicing entries by it is lookahead-free."""
    closes = [b.close for b in bars]
    atrs = _atr_series(bars, atr_length)
    labels: list[Optional[str]] = []
    for i in range(len(bars)):
        if i < er_window or atrs[i] is None:
            labels.append(None)
            continue
        net = closes[i] - closes[i - er_window]
        noise = sum(abs(closes[j] - closes[j - 1]) for j in range(i - er_window + 1, i + 1))
        er = abs(net) / noise if noise > 0 else 0.0
        if er >= er_threshold:
            labels.append("TREND_UP" if net > 0 else "TREND_DOWN")
            continue
        window = [a for a in atrs[max(0, i - vol_lookback) : i + 1] if a is not None]
        rank = sum(1 for a in window if a <= atrs[i]) / len(window)
        labels.append("RANGE_VOLATILE" if rank >= 0.5 else "RANGE_QUIET")
    return labels


def _slice_metrics(pnls: list[float]) -> dict[str, Any]:
    if not pnls:
        return {"trade_count": 0}
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
        "avg_win": round(gp / len(wins), 2) if wins else 0.0,
        "avg_loss": round(sum(losses) / len(losses), 2) if losses else 0.0,
        "max_drawdown": round(-max_dd, 2),
    }


def regime_slice(
    bars_path: str,
    params: Optional[dict[str, Any]] = None,
    trades_json: Optional[str] = None,
    er_window: int = 48,
    er_threshold: float = 0.30,
    atr_length: int = 14,
    vol_lookback: int = 400,
    output: Optional[str] = None,
) -> RegimeSliceResult:
    if not Path(bars_path).exists():
        return RegimeSliceResult(SKILL_ID, ok=False, error=f"bars file not found: {bars_path}")

    try:
        bars = load_bars(bars_path)
    except Exception as e:
        return RegimeSliceResult(SKILL_ID, ok=False, error=f"bar loading failed: {e}")

    labels = classify_regimes(bars, er_window, er_threshold, atr_length, vol_lookback)

    # Trades: either slice an external trade list (entry_dt + pnl_usd, the
    # backtest_payload.json["trades"] shape) or run the parity backtester.
    used_params: dict[str, Any] = {}
    if trades_json:
        try:
            data = json.loads(Path(trades_json).read_text(encoding="utf-8"))
            raw = data["trades"] if isinstance(data, dict) else data
            trade_list = [(str(t["entry_dt"]), float(t["pnl_usd"]))
                          for t in raw if t.get("pnl_usd") is not None]
            used_params = {"source": trades_json}
        except Exception as e:
            return RegimeSliceResult(SKILL_ID, ok=False, error=f"trades json parse failed: {e}")
    else:
        cfg = {**DEFAULT_CFG, **(params or {})}
        used_params = {k: cfg[k] for k in
                       ("pivot_len", "min_opp_breaks", "max_opp_breaks", "tp_l", "sl_l")}
        trades = run_strategy(bars, cfg)
        trade_list = [(t.entry_dt.strftime("%Y-%m-%d %H:%M:%S"), t.pnl_usd)
                      for t in trades]

    # Entry timestamp → bar index (normalize to naive "%Y-%m-%d %H:%M:%S").
    index_of = {b.dt.strftime("%Y-%m-%d %H:%M:%S"): i for i, b in enumerate(bars)}

    per_regime_pnls: dict[str, list[float]] = {r: [] for r in REGIMES}
    unclassified = 0
    for entry_dt, pnl in trade_list:
        i = index_of.get(entry_dt[:19])
        label = labels[i] if i is not None else None
        if label is None:
            unclassified += 1
            continue
        per_regime_pnls[label].append(pnl)

    classified = [l for l in labels if l is not None]
    coverage = {r: round(classified.count(r) / len(classified), 4) if classified else 0.0
                for r in REGIMES}

    regimes = {r: _slice_metrics(per_regime_pnls[r]) for r in REGIMES}
    traded = {r: m for r, m in regimes.items() if m["trade_count"] > 0}
    best = max(traded, key=lambda r: traded[r]["ev_per_trade"]) if traded else None
    worst = min(traded, key=lambda r: traded[r]["ev_per_trade"]) if traded else None

    result = RegimeSliceResult(
        skill_id=SKILL_ID, ok=True,
        bars_total=len(bars), trades_total=len(trade_list),
        params=used_params,
        classifier={"er_window": er_window, "er_threshold": er_threshold,
                    "atr_length": atr_length, "vol_lookback": vol_lookback,
                    "unclassified_trades": unclassified},
        regime_coverage=coverage, regimes=regimes,
        best_regime=best, worst_regime=worst)

    if output:
        Path(output).write_text(json.dumps(result.to_dict(), indent=2), encoding="utf-8")
    return result


SKILL_DESCRIPTOR = {
    "id": SKILL_ID,
    "name": "MIDAS Regime Slicer",
    "entrypoint": regime_slice,
    "phase": 5,
    "runtime_skill": True,
    "sandbox": "PLT-005",
}


def _main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(prog="midas_regime_slicer",
                                 description="Slice backtest performance by market regime.")
    ap.add_argument("--bars", required=True, help="OHLCV CSV path")
    ap.add_argument("--trades-json", help="slice an existing trade list (backtest_payload.json shape)")
    ap.add_argument("--params-json", help="JSON dict of backtester params (ignored with --trades-json)")
    ap.add_argument("--er-window", type=int, default=48)
    ap.add_argument("--er-threshold", type=float, default=0.30)
    ap.add_argument("--vol-lookback", type=int, default=400)
    ap.add_argument("--output", help="write JSON report to file")
    args = ap.parse_args(argv)

    params = json.loads(args.params_json) if args.params_json else None
    r = regime_slice(args.bars, params, args.trades_json,
                     er_window=args.er_window, er_threshold=args.er_threshold,
                     vol_lookback=args.vol_lookback, output=args.output)
    print(json.dumps(r.to_dict(), indent=2))
    return 0 if r.ok else 1


if __name__ == "__main__":
    raise SystemExit(_main())
