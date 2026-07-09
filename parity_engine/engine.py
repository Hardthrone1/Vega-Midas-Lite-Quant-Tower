"""Vega Parity Engine — bar-by-bar strategy executor.

Mirrors TradingView Pine `strategy()` execution so backtest behaviour matches
live exactly. The three rules that close the backtest→live gap:

1. Signals evaluated ONLY on confirmed (closed) bars when
   `execution.confirmOnBarClose` is True — the Pine `barstate.isconfirmed` gate.

2. Market orders filled at the NEXT bar's open (not the signal bar's close),
   unless `processOrdersOnClose` is True — Pine's default is next-bar fill for
   market orders during intrabar recalculation.

3. Slippage (in ticks × tickSize, adverse to the trade direction) is applied
   by worsening the fill price — the cost is embedded in the price, never
   charged again as a separate fee. Limit-style fills (profit targets) take no
   slippage, matching TradingView's broker emulator. Commission is charged per
   fill.

4. Stops that gap: when a bar opens beyond the stop (weekend/overnight gap),
   the fill is the bar's open — not the stop price. Targets that gap open
   fill at the (better) open.

5. Session window: when the payload carries session.timezone + start + end,
   entries are only evaluated on bars inside that window (DST-aware via
   zoneinfo; overnight windows like Globex 18:00→17:00 supported). Exits
   still process on every bar so open risk is never ignored.

Usage:
    from parity_engine.contract import BacktestPayload
    from parity_engine.engine import Engine

    payload = BacktestPayload.from_dict(json.load(open("payload.json")))
    bars = load_bars("bars.csv")          # list of OHLCV dicts
    result = Engine(payload, bars).run()  # -> EngineResult
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, time as dtime
from typing import Any
from zoneinfo import ZoneInfo

from .contract import BacktestPayload, resolve_economics
from .expressions import ExpressionError, evaluate
from .indicators import atr


# ---------------------------------------------------------------------------
# Data shapes
# ---------------------------------------------------------------------------

@dataclass
class Bar:
    index: int
    time: int  # epoch ms
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


@dataclass
class Fill:
    bar_index: int
    time: int
    side: str         # "long" | "short"
    direction: str    # "entry" | "exit"
    price: float
    qty: float
    slippage: float
    commission: float


@dataclass
class Trade:
    id: int
    side: str
    entry_fill: Fill
    exit_fill: Fill | None = None
    point_value: float = 1.0  # dollars per 1.0 of price move per contract

    @property
    def is_open(self) -> bool:
        return self.exit_fill is None

    @property
    def gross_pnl(self) -> float:
        if self.exit_fill is None:
            return 0.0
        if self.side == "long":
            points = self.exit_fill.price - self.entry_fill.price
        else:
            points = self.entry_fill.price - self.exit_fill.price
        return points * self.entry_fill.qty * self.point_value

    @property
    def net_pnl(self) -> float:
        # Slippage is already embedded in the fill prices (adverse fills), so
        # the only cost deducted here is commission. Fill.slippage is
        # reporting metadata, not a second charge.
        costs = self.entry_fill.commission
        if self.exit_fill:
            costs += self.exit_fill.commission
        return self.gross_pnl - costs


@dataclass
class EngineResult:
    trades: list[Trade]
    equity_curve: list[dict[str, Any]]
    bars_processed: int
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "trades": [_trade_to_dict(t) for t in self.trades],
            "equity_curve": self.equity_curve,
            "bars_processed": self.bars_processed,
            "error": self.error,
        }


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class Engine:
    def __init__(self, payload: BacktestPayload, bars: list[Bar]):
        self.payload = payload
        self.bars = bars
        self.tick_size, self.point_value = resolve_economics(payload.asset)

        # Precompute indicator series used by condition expressions
        self._highs = [b.high for b in bars]
        self._lows = [b.low for b in bars]
        self._closes = [b.close for b in bars]

        atr_len = self._atr_length_from_spec()
        self._atr_series = atr(self._highs, self._lows, self._closes, atr_len)

        # Session window (entries only). Active when the payload provides
        # timezone + start + end; anything malformed disables gating rather
        # than silently misclassifying bars.
        self._session_tz: ZoneInfo | None = None
        self._session_start: dtime | None = None
        self._session_end: dtime | None = None
        s = payload.session
        if s and s.timezone and s.start and s.end:
            try:
                self._session_tz = ZoneInfo(s.timezone)
                self._session_start = _parse_hhmm(s.start)
                self._session_end = _parse_hhmm(s.end)
            except (KeyError, ValueError, OSError):
                self._session_tz = None
                self._session_start = None
                self._session_end = None

    def _atr_length_from_spec(self) -> int:
        stop = self.payload.exit.stop or {}
        target = self.payload.exit.target or {}
        for d in (stop, target):
            if d.get("mode") in ("atr",) and d.get("atrLength"):
                return int(d["atrLength"])
        return 14  # Pine default

    def run(self) -> EngineResult:
        bars = self.bars
        if not bars:
            return EngineResult([], [], 0, "No bars provided")

        equity = self.payload.sizing.initialCapital
        trades: list[Trade] = []
        equity_curve: list[dict[str, Any]] = []
        trade_id = 0

        # Pending order: dict with keys type/side/price/qty placed on bar i,
        # to be filled at bar i+1's open (unless processOrdersOnClose).
        pending: dict[str, Any] | None = None
        open_trade: Trade | None = None

        for i, bar in enumerate(bars):
            # -----------------------------------------------------------
            # 1. Fill any pending entry at this bar's open
            # -----------------------------------------------------------
            if pending and not self.payload.execution.processOrdersOnClose:
                new_trade = self._open_trade(pending, bar, i, len(trades) + 1)
                open_trade = new_trade
                pending = None

            # -----------------------------------------------------------
            # 2. Intrabar stop / target check for the open trade
            # -----------------------------------------------------------
            if open_trade is not None and open_trade.is_open:
                exit_fill = self._check_stop_target(open_trade, bar, i)
                if exit_fill:
                    open_trade.exit_fill = exit_fill
                    equity += open_trade.net_pnl
                    trades.append(open_trade)
                    open_trade = None
                    pending = None

            # -----------------------------------------------------------
            # 3. Time stop
            # -----------------------------------------------------------
            if open_trade is not None and self.payload.exit.timeStopBars:
                bars_held = i - open_trade.entry_fill.bar_index
                if bars_held >= self.payload.exit.timeStopBars:
                    exit_fill = self._build_fill(
                        i, bar.time, bar.close, open_trade.entry_fill.qty,
                        "exit", open_trade.side
                    )
                    open_trade.exit_fill = exit_fill
                    equity += open_trade.net_pnl
                    trades.append(open_trade)
                    open_trade = None
                    pending = None

            # -----------------------------------------------------------
            # 4. Signal evaluation on confirmed bar
            # -----------------------------------------------------------
            ctx = self._bar_context(i, bar)
            if open_trade is None and pending is None and self._in_session(bar.time):
                signal = self._evaluate_entry(ctx, bar, i)
                if signal:
                    pending = {
                        "direction": "entry",
                        "side": signal,
                        "qty": self.payload.sizing.qtyValue,
                    }
                    if self.payload.execution.processOrdersOnClose:
                        # Fill at this bar's close immediately (on_close mode)
                        new_trade = self._open_trade(pending, bar, i, len(trades) + 1)
                        open_trade = new_trade
                        pending = None

            # -----------------------------------------------------------
            # 5. Equity snapshot
            # -----------------------------------------------------------
            open_unrealized = 0.0
            if open_trade:
                if open_trade.side == "long":
                    points = bar.close - open_trade.entry_fill.price
                else:
                    points = open_trade.entry_fill.price - bar.close
                open_unrealized = points * open_trade.entry_fill.qty * self.point_value

            equity_curve.append({
                "bar_index": i,
                "time": bar.time,
                "equity": round(equity + open_unrealized, 4),
                "drawdown": 0.0,  # filled by metrics.py
                "open_trade": open_trade is not None,
            })

        # -----------------------------------------------------------
        # 6. Mark open trade as still open in results
        # -----------------------------------------------------------
        if open_trade:
            # Don't close it — emit it as still open for transparency
            trades.append(open_trade)

        # Drawdown pass
        peak = self.payload.sizing.initialCapital
        for snap in equity_curve:
            if snap["equity"] > peak:
                peak = snap["equity"]
            snap["drawdown"] = round((peak - snap["equity"]) / peak * 100, 4) if peak else 0.0

        return EngineResult(trades, equity_curve, len(bars))

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    def _in_session(self, epoch_ms: int) -> bool:
        """True when the bar's wall-clock time (in the session's timezone,
        DST-aware) falls inside the session window. Always True when no
        window is configured. Overnight windows (start > end) wrap midnight.
        """
        if self._session_tz is None or self._session_start is None or self._session_end is None:
            return True
        local = datetime.fromtimestamp(epoch_ms / 1000.0, tz=self._session_tz).time()
        start, end = self._session_start, self._session_end
        if start <= end:
            return start <= local < end
        return local >= start or local < end

    def _bar_context(self, i: int, bar: Bar) -> dict[str, float | None]:
        """Build expression evaluation context for bar i."""
        atr_val = self._atr_series[i]
        ctx: dict[str, float | None] = {
            "open": bar.open,
            "high": bar.high,
            "low": bar.low,
            "close": bar.close,
            "volume": bar.volume,
            "bar_index": float(i),
            "atr": atr_val,
        }
        # Convenience aliases matching common Pine names
        if atr_val is not None:
            ctx["atr14"] = atr_val
        return ctx

    def _evaluate_entry(self, ctx: dict, bar: Bar, i: int) -> str | None:
        """Return 'long'|'short' if entry conditions fire, else None."""
        entry = self.payload.entry
        conditions = entry.conditions
        if not conditions:
            return None
        try:
            met = all(evaluate(c.expression, ctx) for c in conditions)
        except ExpressionError:
            met = False
        if not met:
            return None
        side = entry.side
        if side == "both":
            # Simple: go with the bar direction when side is unconstrained
            return "long" if bar.close >= bar.open else "short"
        return side

    def _open_trade(self, pending: dict, bar: "Bar", i: int, trade_id: int) -> "Trade":
        """Create and return a Trade by filling pending at bar open or close."""
        price = bar.open if not self.payload.execution.processOrdersOnClose else bar.close
        fill = self._build_fill(i, bar.time, price, pending["qty"], "entry", pending["side"])
        return Trade(id=trade_id, side=pending["side"], entry_fill=fill,
                     point_value=self.point_value)

    def _build_fill(
        self, bar_index: int, time: int, price: float, qty: float,
        direction: str, side: str, is_limit: bool = False
    ) -> Fill:
        """Build a Fill. Market-style fills (entries, stops) are worsened by
        slippage; limit-style fills (profit targets) take none — matching
        TradingView's broker emulator. The Fill.slippage field records the
        dollar cost of that price adjustment for reporting; it is NOT charged
        again in net_pnl.
        """
        exec_cfg = self.payload.execution
        slip_amount = 0.0 if is_limit else exec_cfg.slippageTicks * self.tick_size

        # Slippage is adverse: entry longs get filled higher, shorts lower; exits vice-versa.
        if direction == "entry":
            fill_price = price + slip_amount if side == "long" else price - slip_amount
        else:
            fill_price = price - slip_amount if side == "long" else price + slip_amount

        comm = self._commission(qty, fill_price)

        return Fill(
            bar_index=bar_index,
            time=time,
            side=side,
            direction=direction,
            price=round(fill_price, 8),
            qty=qty,
            slippage=round(slip_amount * qty * self.point_value, 4),
            commission=round(comm, 4),
        )

    def _commission(self, qty: float, price: float) -> float:
        cfg = self.payload.execution
        ct = cfg.commissionType
        cv = cfg.commissionValue
        if ct == "cash_per_contract":
            return cv * qty
        if ct == "cash_per_order":
            return cv
        if ct == "percent":
            return price * qty * cv / 100.0
        return 0.0

    def _check_stop_target(self, trade: Trade, bar: Bar, i: int) -> Fill | None:
        """Check intrabar stop/target touch. Returns exit Fill or None.

        Gap handling: a stop is a stop-market order — if the bar OPENS beyond
        the stop (weekend/overnight gap), the realistic fill is the open, not
        the stop price. A target is a limit order — a favorable gap fills at
        the (better) open, and limit fills take no slippage.

        When both stop and target lie inside one bar's range the stop is
        assumed to hit first (conservative; sub-bar data would be needed to
        know the true touch order).
        """
        stop_price = self._resolve_stop(trade, bar, i)
        target_price = self._resolve_target(trade, bar, i)

        qty = trade.entry_fill.qty
        side = trade.side

        if side == "long":
            if stop_price is not None and bar.low <= stop_price:
                price = min(stop_price, bar.open)  # gap down fills at the open
                return self._build_fill(i, bar.time, price, qty, "exit", side)
            if target_price is not None and bar.high >= target_price:
                price = max(target_price, bar.open)  # gap up fills at the better open
                return self._build_fill(i, bar.time, price, qty, "exit", side, is_limit=True)
        else:
            if stop_price is not None and bar.high >= stop_price:
                price = max(stop_price, bar.open)
                return self._build_fill(i, bar.time, price, qty, "exit", side)
            if target_price is not None and bar.low <= target_price:
                price = min(target_price, bar.open)
                return self._build_fill(i, bar.time, price, qty, "exit", side, is_limit=True)
        return None

    def _resolve_stop(self, trade: Trade, bar: Bar, i: int) -> float | None:
        stop = self.payload.exit.stop or {}
        mode = stop.get("mode", "none")
        entry_p = trade.entry_fill.price
        side = trade.side
        atr_val = self._atr_series[i]

        if mode == "fixed_ticks":
            v = float(stop.get("value", 0))
            return entry_p - v * self.tick_size if side == "long" else entry_p + v * self.tick_size
        if mode == "fixed_pct":
            v = float(stop.get("value", 0)) / 100.0
            return entry_p * (1 - v) if side == "long" else entry_p * (1 + v)
        if mode == "atr" and atr_val is not None:
            mult = float(stop.get("atrMultiplier", 1.5))
            return entry_p - mult * atr_val if side == "long" else entry_p + mult * atr_val
        if mode == "rr_multiple":
            # Not typically used for stop, but handle gracefully
            return None
        return None

    def _resolve_target(self, trade: Trade, bar: Bar, i: int) -> float | None:
        target = self.payload.exit.target or {}
        mode = target.get("mode", "none")
        entry_p = trade.entry_fill.price
        side = trade.side
        atr_val = self._atr_series[i]
        stop_p = self._resolve_stop(trade, bar, i)

        if mode == "fixed_ticks":
            v = float(target.get("value", 0))
            return entry_p + v * self.tick_size if side == "long" else entry_p - v * self.tick_size
        if mode == "fixed_pct":
            v = float(target.get("value", 0)) / 100.0
            return entry_p * (1 + v) if side == "long" else entry_p * (1 - v)
        if mode == "atr" and atr_val is not None:
            mult = float(target.get("atrMultiplier", 2.0))
            return entry_p + mult * atr_val if side == "long" else entry_p - mult * atr_val
        if mode == "rr_multiple" and stop_p is not None:
            rr = float(target.get("rrMultiple", 2.0))
            risk = abs(entry_p - stop_p)
            return entry_p + rr * risk if side == "long" else entry_p - rr * risk
        return None


def _parse_hhmm(value: str) -> dtime:
    """Parse 'HH:MM' into a time; raises ValueError on malformed input."""
    h, m = value.strip().split(":")
    return dtime(int(h), int(m))


# ---------------------------------------------------------------------------
# Serialisation helper
# ---------------------------------------------------------------------------

def _trade_to_dict(t: Trade) -> dict[str, Any]:
    def fill_d(f: Fill | None) -> dict | None:
        if f is None:
            return None
        return {
            "bar_index": f.bar_index,
            "time": f.time,
            "side": f.side,
            "direction": f.direction,
            "price": f.price,
            "qty": f.qty,
            "slippage": f.slippage,
            "commission": f.commission,
        }

    return {
        "id": t.id,
        "side": t.side,
        "entry": fill_d(t.entry_fill),
        "exit": fill_d(t.exit_fill),
        "gross_pnl": round(t.gross_pnl, 4) if not t.is_open else None,
        "net_pnl": round(t.net_pnl, 4) if not t.is_open else None,
        "is_open": t.is_open,
    }


def bars_from_dicts(raw: list[dict]) -> list[Bar]:
    """Convert a list of plain dicts (from CSV or JSON) into Bar objects."""
    result = []
    for i, d in enumerate(raw):
        result.append(Bar(
            index=i,
            time=int(d.get("time", 0)),
            open=float(d.get("open", 0)),
            high=float(d.get("high", 0)),
            low=float(d.get("low", 0)),
            close=float(d.get("close", 0)),
            volume=float(d.get("volume", 0)),
        ))
    return result
