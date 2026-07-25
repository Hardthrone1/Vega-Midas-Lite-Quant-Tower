"""
midas_regime_slicer.py — Regime-Conditional Backtest Slicer, as a Hermes runtime skill.

Skill ID:   QBT-003
Phase:      5
Status:     LIVE — faithful Python port of MIDAS_Regime_Filter.pine (v3, in
            this directory). Classifies every bar with trailing-only
            indicators (no lookahead), then slices backtest trades by the
            confirmed regime in force at ENTRY.

Regime taxonomy (matches the Pine filter's confirmedRegime codes):
  1 TRENDING_EXPANDING   trending and expanding
  2 TRENDING_QUIET       trending, not expanding
  3 RANGING_VOLATILE     not trending, expanding
  4 RANGING_QUIET        not trending, not expanding
  0 UNCONFIRMED          warmup only

Classification is EXHAUSTIVE — one trend boundary, one volatility boundary —
so every ready bar gets a state and the label never goes stale. Trend gate =
Kaufman efficiency ratio AND Wilder ADX (ta.dmi), both against FIXED absolute
thresholds by default. Volatility basis is selectable: fast/slow ATR ratio
(relative, drifts with its own baseline) or an absolute ATR floor in ticks.

Three opt-in rules handle zones whose raw numbers genuinely overlap:
  R1 use_impulse     high ER alone implies trend (ADX lags at impulse starts)
  R2 use_chop        expansion + poor efficiency = volatile range, whatever ADX says
  R3 use_quiet_floor absolute ATR below a floor is quiet, whatever the ratio says

A raw state must persist `persist_bars` bars before it confirms (hysteresis),
and the confirmed regime holds its last value until a new state confirms —
bit for bit the same as the Pine `confirmedRegime` state machine.
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

# Confirmed-regime codes ↔ names, matching the Pine filter.
REGIME_NAMES = {
    1: "TRENDING_EXPANDING",
    2: "TRENDING_QUIET",
    3: "RANGING_VOLATILE",
    4: "RANGING_QUIET",
    0: "UNCONFIRMED",
}
REGIMES = ("TRENDING_EXPANDING", "TRENDING_QUIET", "RANGING_VOLATILE", "RANGING_QUIET")


@dataclass
class RegimeSettings:
    """Input block — 1:1 with the Pine indicator's inputs (v3)."""
    # Signal lengths
    er_len: int = 5
    adx_len: int = 5
    atr_fast_len: int = 5
    atr_slow_len: int = 40
    # Core thresholds (fixed/absolute — the default)
    er_trend_min: float = 0.20
    adx_trend_min: float = 30.0
    persist_bars: int = 2
    # Volatility basis: "Ratio" | "Absolute" | "Both" | "Either"
    vol_basis: str = "Ratio"
    vol_split: float = 0.95        # fast/slow ratio
    abs_vol_ticks: float = 50.0    # absolute ATR floor, in ticks (MGC 5m median)
    tick_size: float = 0.1         # syminfo.mintick (MGC default)
    # Opt-in override rules (default off — reproduce the tuned baseline)
    use_impulse: bool = False      # R1: ER shortcut before ADX ramps
    er_impulse_min: float = 0.55
    use_chop: bool = False         # R2: expansion + poor efficiency = volatile range
    er_chop_max: float = 0.35
    use_quiet_floor: bool = False  # R3: absolute ATR floor forces quiet
    quiet_ticks: float = 40.0
    # Adaptive (legacy — drifts; see the Pine header)
    use_adaptive: bool = False
    calib_len: int = 500
    er_pct: float = 65.0
    adx_pct: float = 55.0
    vol_pct: float = 50.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


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


def _true_ranges(bars: list[OHLCV]) -> list[float]:
    """Pine ta.tr: first bar = high-low, then the standard 3-term max."""
    out: list[float] = []
    prev_close: Optional[float] = None
    for b in bars:
        if prev_close is None:
            out.append(b.high - b.low)
        else:
            out.append(max(b.high - b.low, abs(b.high - prev_close), abs(b.low - prev_close)))
        prev_close = b.close
    return out


def _rma(values: list[Optional[float]], length: int) -> list[Optional[float]]:
    """Pine ta.rma (Wilder): seed with the SMA of the first `length` non-na
    values, then rma = (prev*(len-1) + v)/len. Leading na values are skipped
    so a stream that starts one bar late (like DM) seeds one bar late — the
    exact behaviour of Pine's per-series na handling."""
    out: list[Optional[float]] = [None] * len(values)
    acc: list[float] = []
    rma: Optional[float] = None
    for i, v in enumerate(values):
        if rma is None:
            if v is None:
                continue  # still before this series' first real value
            acc.append(v)
            if len(acc) == length:
                rma = sum(acc) / length
                out[i] = rma
        else:
            vv = 0.0 if v is None else v
            rma = (rma * (length - 1) + vv) / length
            out[i] = rma
    return out


def _dmi_adx(bars: list[OHLCV], di_len: int, adx_len: int) -> list[Optional[float]]:
    """Port of Pine ta.dmi's ADX leg (Wilder). Returns adx[] aligned to bars."""
    n = len(bars)
    tr = _true_ranges(bars)
    plus_dm: list[Optional[float]] = [None] * n
    minus_dm: list[Optional[float]] = [None] * n
    for i in range(1, n):
        up = bars[i].high - bars[i - 1].high
        down = bars[i - 1].low - bars[i].low
        plus_dm[i] = up if (up > down and up > 0) else 0.0
        minus_dm[i] = down if (down > up and down > 0) else 0.0

    trur = _rma(tr, di_len)
    rma_plus = _rma(plus_dm, di_len)
    rma_minus = _rma(minus_dm, di_len)

    dx: list[Optional[float]] = [None] * n
    for i in range(n):
        if trur[i] and trur[i] > 0 and rma_plus[i] is not None and rma_minus[i] is not None:
            plus = 100.0 * rma_plus[i] / trur[i]
            minus = 100.0 * rma_minus[i] / trur[i]
            s = plus + minus
            dx[i] = abs(plus - minus) / (s if s != 0 else 1.0)

    return [100.0 * v if v is not None else None for v in _rma(dx, adx_len)]


def _percentile(window: list[float], pct: float) -> Optional[float]:
    """Pine ta.percentile_linear_interpolation over a trailing window."""
    if len(window) < 30:
        return None
    w = sorted(window)
    rank = (pct / 100.0) * (len(w) - 1)
    lo = int(rank)
    hi = min(lo + 1, len(w) - 1)
    frac = rank - lo
    return w[lo] + (w[hi] - w[lo]) * frac


def classify_regimes(bars: list[OHLCV], s: RegimeSettings) -> list[int]:
    """Confirmed regime code per bar (0=warming up, 1..4). Trailing-only, so
    slicing entries by it is lookahead-free. Bit-for-bit port of the Pine v2
    filter's rawState → hysteresis → confirmedRegime state machine.

    Classification is EXHAUSTIVE: one trend boundary, one volatility
    boundary, so every ready bar gets a state and the label never goes
    stale. (v1 used two disjoint gates whose gap swallowed 56% of bars,
    freezing the label for hours at a time.)"""
    n = len(bars)
    closes = [b.close for b in bars]
    tr = _true_ranges(bars)
    atr_fast = _rma(tr, s.atr_fast_len)
    atr_slow = _rma(tr, s.atr_slow_len)
    adx = _dmi_adx(bars, s.adx_len, s.adx_len)

    # Precompute the raw indicator series so percentiles see full history.
    er_s: list[Optional[float]] = [None] * n
    vr_s: list[Optional[float]] = [None] * n
    for i in range(n):
        if i >= s.er_len:
            net = abs(closes[i] - closes[i - s.er_len])
            path = sum(abs(closes[j] - closes[j - 1]) for j in range(i - s.er_len + 1, i + 1))
            er_s[i] = 0.0 if path == 0 else net / path
        if atr_slow[i] and atr_slow[i] != 0 and atr_fast[i] is not None:
            vr_s[i] = atr_fast[i] / atr_slow[i]

    def thresh(series: list[Optional[float]], i: int, pct: float) -> Optional[float]:
        lo = max(0, i - s.calib_len + 1)
        return _percentile([v for v in series[lo:i + 1] if v is not None], pct)

    confirmed = candidate = count = 0
    out: list[int] = [0] * n
    for i in range(n):
        er, a, vr = er_s[i], adx[i], vr_s[i]

        if s.use_adaptive:
            et = thresh(er_s, i, s.er_pct) if er is not None else None
            at = thresh(adx, i, s.adx_pct) if a is not None else None
            vt = thresh(vr_s, i, s.vol_pct) if vr is not None else None
        else:
            et, at, vt = s.er_trend_min, s.adx_trend_min, s.vol_split

        if er is None or a is None or vr is None or et is None or at is None or vt is None:
            raw = 0  # warming up — indicators/thresholds not yet defined
        else:
            atr_ticks = (atr_fast[i] or 0.0) / s.tick_size
            exp_ratio = vr >= vt
            exp_abs = atr_ticks >= s.abs_vol_ticks
            if s.vol_basis == "Absolute":
                is_expanding = exp_abs
            elif s.vol_basis == "Both":
                is_expanding = exp_ratio and exp_abs
            elif s.vol_basis == "Either":
                is_expanding = exp_ratio or exp_abs
            else:  # "Ratio"
                is_expanding = exp_ratio

            # R3 — an absolutely small ATR is quiet regardless of the ratio.
            if s.use_quiet_floor and atr_ticks < s.quiet_ticks:
                is_expanding = False

            trend_core = er >= et and a >= at
            trend_impulse = s.use_impulse and er >= s.er_impulse_min      # R1
            chop_override = s.use_chop and is_expanding and er < s.er_chop_max  # R2
            is_trending = (trend_core or trend_impulse) and not chop_override

            if is_trending:
                raw = 1 if is_expanding else 2
            else:
                raw = 3 if is_expanding else 4

        # Hysteresis: a raw state must persist persist_bars bars to confirm;
        # confirmed holds its last non-zero value otherwise.
        if raw == candidate:
            count += 1
        else:
            candidate, count = raw, 1
        if count >= s.persist_bars and candidate != 0:
            confirmed = candidate
        out[i] = confirmed
    return out


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
    settings: Optional[RegimeSettings] = None,
    output: Optional[str] = None,
) -> RegimeSliceResult:
    if not Path(bars_path).exists():
        return RegimeSliceResult(SKILL_ID, ok=False, error=f"bars file not found: {bars_path}")

    try:
        bars = load_bars(bars_path)
    except Exception as e:
        return RegimeSliceResult(SKILL_ID, ok=False, error=f"bar loading failed: {e}")

    settings = settings or RegimeSettings()
    codes = classify_regimes(bars, settings)  # 0..4 per bar

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
        code = codes[i] if i is not None else 0
        if code == 0:  # UNCONFIRMED / warmup — not attributable
            unclassified += 1
            continue
        per_regime_pnls[REGIME_NAMES[code]].append(pnl)

    # Coverage over CONFIRMED bars only (code != 0); UNCONFIRMED tracked apart.
    confirmed_bars = [c for c in codes if c != 0]
    coverage = {r: round(sum(1 for c in confirmed_bars if REGIME_NAMES[c] == r) / len(confirmed_bars), 4)
                if confirmed_bars else 0.0 for r in REGIMES}

    regimes = {r: _slice_metrics(per_regime_pnls[r]) for r in REGIMES}
    traded = {r: m for r, m in regimes.items() if m["trade_count"] > 0}
    best = max(traded, key=lambda r: traded[r]["ev_per_trade"]) if traded else None
    worst = min(traded, key=lambda r: traded[r]["ev_per_trade"]) if traded else None

    result = RegimeSliceResult(
        skill_id=SKILL_ID, ok=True,
        bars_total=len(bars), trades_total=len(trade_list),
        params=used_params,
        classifier={**settings.to_dict(),
                    "unconfirmed_bar_share": round((len(codes) - len(confirmed_bars)) / len(codes), 4) if codes else 0.0,
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
    # Regime filter settings — 1:1 with MIDAS_Regime_Filter.pine (v3) inputs.
    ap.add_argument("--er-len", type=int, default=5)
    ap.add_argument("--adx-len", type=int, default=5)
    ap.add_argument("--atr-fast-len", type=int, default=5)
    ap.add_argument("--atr-slow-len", type=int, default=40)
    ap.add_argument("--er-trend-min", type=float, default=0.20)
    ap.add_argument("--adx-trend-min", type=float, default=30.0)
    ap.add_argument("--persist-bars", type=int, default=2)
    ap.add_argument("--vol-basis", default="Ratio", choices=["Ratio", "Absolute", "Both", "Either"])
    ap.add_argument("--vol-split", type=float, default=0.95)
    ap.add_argument("--abs-vol-ticks", type=float, default=50.0)
    ap.add_argument("--tick-size", type=float, default=0.1, help="syminfo.mintick (MGC 0.1, MNQ 0.25)")
    ap.add_argument("--r1-impulse", action="store_true", help="R1: ER shortcut before ADX ramps")
    ap.add_argument("--er-impulse-min", type=float, default=0.55)
    ap.add_argument("--r2-chop", action="store_true", help="R2: expansion + poor efficiency = volatile range")
    ap.add_argument("--er-chop-max", type=float, default=0.35)
    ap.add_argument("--r3-quiet-floor", action="store_true", help="R3: absolute ATR floor forces quiet")
    ap.add_argument("--quiet-ticks", type=float, default=40.0)
    ap.add_argument("--adaptive", action="store_true", help="legacy rolling-percentile thresholds (drifts)")
    ap.add_argument("--calib-len", type=int, default=500)
    ap.add_argument("--er-pct", type=float, default=65.0)
    ap.add_argument("--adx-pct", type=float, default=55.0)
    ap.add_argument("--vol-pct", type=float, default=50.0)
    ap.add_argument("--output", help="write JSON report to file")
    args = ap.parse_args(argv)

    params = json.loads(args.params_json) if args.params_json else None
    settings = RegimeSettings(
        er_len=args.er_len, adx_len=args.adx_len,
        atr_fast_len=args.atr_fast_len, atr_slow_len=args.atr_slow_len,
        er_trend_min=args.er_trend_min, adx_trend_min=args.adx_trend_min,
        persist_bars=args.persist_bars,
        vol_basis=args.vol_basis, vol_split=args.vol_split,
        abs_vol_ticks=args.abs_vol_ticks, tick_size=args.tick_size,
        use_impulse=args.r1_impulse, er_impulse_min=args.er_impulse_min,
        use_chop=args.r2_chop, er_chop_max=args.er_chop_max,
        use_quiet_floor=args.r3_quiet_floor, quiet_ticks=args.quiet_ticks,
        use_adaptive=args.adaptive, calib_len=args.calib_len,
        er_pct=args.er_pct, adx_pct=args.adx_pct, vol_pct=args.vol_pct)
    r = regime_slice(args.bars, params, args.trades_json, settings=settings, output=args.output)
    print(json.dumps(r.to_dict(), indent=2))
    return 0 if r.ok else 1


if __name__ == "__main__":
    raise SystemExit(_main())
