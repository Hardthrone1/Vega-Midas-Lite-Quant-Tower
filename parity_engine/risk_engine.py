"""Risk simulation layer for parity engine.

Extends backtest results to track and enforce risk limits:
  • Drawdown limits (max drawdown %, daily loss $, weekly loss $)
  • Per-trade risk (consecutive loss count)
  • Performance floor (minimum expectancy, win rate, profit factor)

Halt semantics are REAL: when a halt-severity limit is breached at bar N,
the backtest is re-run truncated at bar N, any open position is force-closed
at bar N's close (market fill, slippage applied), and equity stays flat for
the remainder — trades after the halt do not exist in the results.

Daily and weekly losses are PER-PERIOD deltas (equity vs the period's opening
equity), not cumulative PnL since inception. Period boundaries use the
payload's session timezone when configured, else UTC.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from datetime import datetime, timezone, tzinfo
from math import sqrt
from zoneinfo import ZoneInfo

from parity_engine.contract import BacktestPayload
from parity_engine.engine import Engine, Bar, EngineResult

# Dispersion below this is float noise; a Sharpe against it would explode.
_STD_EPS = 1e-12


@dataclass
class RiskViolation:
    """Record of a risk limit breach."""
    bar_index: int
    bar_time: int
    limit_name: str
    limit_value: float
    actual_value: float
    severity: str  # "halt" = stop trading, "warn" = informational


@dataclass
class RiskMetrics:
    """Computed risk/performance metrics at the end of the backtest."""
    max_drawdown_pct: float
    current_drawdown_pct: float
    daily_max_loss_usd: float | None
    weekly_max_loss_usd: float | None
    consecutive_losses: int
    consecutive_wins: int
    max_consecutive_losses: int
    max_consecutive_wins: int
    avg_trade_loss_usd: float | None
    profit_factor: float | None
    expectancy: float | None
    sharpe_ratio: float | None


@dataclass
class RiskResult:
    """Enhanced result with risk tracking."""
    engine_result: EngineResult
    risk_violations: list[RiskViolation] = field(default_factory=list)
    risk_metrics: RiskMetrics | None = None
    trading_halted_at_bar: int | None = None
    risk_status: str = "ok"  # "ok", "warn", "halt"

    def to_dict(self) -> dict[str, Any]:
        return {
            "engineResult": self.engine_result.to_dict(),
            "riskViolations": [
                {
                    "barIndex": v.bar_index,
                    "barTime": v.bar_time,
                    "limitName": v.limit_name,
                    "limitValue": v.limit_value,
                    "actualValue": v.actual_value,
                    "severity": v.severity,
                }
                for v in self.risk_violations
            ],
            "riskMetrics": {
                "maxDrawdownPct": self.risk_metrics.max_drawdown_pct,
                "currentDrawdownPct": self.risk_metrics.current_drawdown_pct,
                "dailyMaxLossUsd": self.risk_metrics.daily_max_loss_usd,
                "weeklyMaxLossUsd": self.risk_metrics.weekly_max_loss_usd,
                "consecutiveLosses": self.risk_metrics.consecutive_losses,
                "consecutiveWins": self.risk_metrics.consecutive_wins,
                "maxConsecutiveLosses": self.risk_metrics.max_consecutive_losses,
                "maxConsecutiveWins": self.risk_metrics.max_consecutive_wins,
                "avgTradeLossUsd": self.risk_metrics.avg_trade_loss_usd,
                "profitFactor": self.risk_metrics.profit_factor,
                "expectancy": self.risk_metrics.expectancy,
                "sharpeRatio": self.risk_metrics.sharpe_ratio,
            } if self.risk_metrics else None,
            "tradingHaltedAtBar": self.trading_halted_at_bar,
            "riskStatus": self.risk_status,
        }


class RiskEngine:
    """Wraps parity Engine to enforce risk limits and track violations."""

    def __init__(self, payload: BacktestPayload, bars: list[Bar]):
        self.payload = payload
        self.bars = bars
        self.risk_limits = payload.risk or {}
        s = payload.session
        self._period_tz: tzinfo = timezone.utc
        if s and s.timezone:
            try:
                self._period_tz = ZoneInfo(s.timezone)
            except (KeyError, ValueError, OSError):
                pass

    def run(self) -> RiskResult:
        """Run the backtest, enforce halt limits, report violations + metrics."""
        initial_capital = self.payload.sizing.initialCapital

        # Pass 1: full run, scan for the first halt-severity breach. Signals
        # don't depend on equity (fixed sizing), so trades up to the halt bar
        # are identical between passes — truncation is exact.
        result = Engine(self.payload, self.bars).run()
        period_losses = self._scan_period_losses(result.equity_curve, initial_capital)
        halt = self._first_halt(result.equity_curve, period_losses)

        halted_bar: int | None = None
        violations: list[RiskViolation] = []

        if halt is not None:
            halted_bar = halt.bar_index
            violations.append(halt)
            engine = Engine(self.payload, self.bars[: halted_bar + 1])
            result = engine.run()
            self._force_close_open_trade(engine, result, halted_bar)
            self._extend_curve_flat(result, initial_capital)
            # Recompute period losses on the halted (final) curve for metrics.
            period_losses = self._scan_period_losses(result.equity_curve, initial_capital)

        # Streaks + warn-severity checks on the final closed trades.
        closed = [t for t in result.trades if not t.is_open]
        pnl_values = [t.net_pnl for t in closed]
        streaks = self._streaks(pnl_values)
        violations.extend(self._warn_violations(pnl_values, streaks))

        risk_metrics = self._metrics(result, pnl_values, streaks, period_losses)

        halt_v = [v for v in violations if v.severity == "halt"]
        warn_v = [v for v in violations if v.severity == "warn"]
        risk_status = "halt" if halt_v else ("warn" if warn_v else "ok")

        return RiskResult(
            engine_result=result,
            risk_violations=violations,
            risk_metrics=risk_metrics,
            trading_halted_at_bar=halted_bar,
            risk_status=risk_status,
        )

    # ------------------------------------------------------------------
    # Per-bar halt scanning
    # ------------------------------------------------------------------

    def _period_keys(self, epoch_ms: int) -> tuple[str, tuple[int, int]]:
        dt = datetime.fromtimestamp(epoch_ms / 1000, tz=self._period_tz)
        iso = dt.isocalendar()
        return dt.date().isoformat(), (iso[0], iso[1])

    def _scan_period_losses(
        self, curve: list[dict[str, Any]], initial_capital: float
    ) -> dict[str, dict]:
        """Per-bar daily/weekly PnL as deltas vs each period's OPENING equity.

        Returns {"daily": {date: pnl}, "weekly": {(yr, wk): pnl},
                 "daily_at_bar": [pnl...], "weekly_at_bar": [pnl...]}
        """
        daily: dict[str, float] = {}
        weekly: dict[tuple[int, int], float] = {}
        daily_at_bar: list[float] = []
        weekly_at_bar: list[float] = []

        day_open = week_open = initial_capital
        prev_day: str | None = None
        prev_week: tuple[int, int] | None = None
        prev_eq = initial_capital

        for snap in curve:
            day_key, week_key = self._period_keys(snap["time"])
            if day_key != prev_day:
                day_open = prev_eq  # new day opens at the prior bar's equity
                prev_day = day_key
            if week_key != prev_week:
                week_open = prev_eq
                prev_week = week_key
            eq = snap["equity"]
            daily[day_key] = eq - day_open
            weekly[week_key] = eq - week_open
            daily_at_bar.append(eq - day_open)
            weekly_at_bar.append(eq - week_open)
            prev_eq = eq

        return {"daily": daily, "weekly": weekly,
                "daily_at_bar": daily_at_bar, "weekly_at_bar": weekly_at_bar}

    def _first_halt(
        self, curve: list[dict[str, Any]], period_losses: dict[str, dict]
    ) -> RiskViolation | None:
        """Walk bars in order; return the first halt-severity breach."""
        max_dd_pct = self.risk_limits.get("maxDrawdownPct")
        max_daily = self.risk_limits.get("maxDailyLossCurrency")
        max_weekly = self.risk_limits.get("maxWeeklyLossCurrency")
        if not (max_dd_pct or max_daily or max_weekly):
            return None

        for i, snap in enumerate(curve):
            if max_dd_pct and snap["drawdown"] > max_dd_pct:
                return RiskViolation(i, snap["time"], "maxDrawdownPct",
                                     max_dd_pct, snap["drawdown"], "halt")
            if max_daily and period_losses["daily_at_bar"][i] < -max_daily:
                return RiskViolation(i, snap["time"], "maxDailyLossCurrency",
                                     max_daily, -period_losses["daily_at_bar"][i], "halt")
            if max_weekly and period_losses["weekly_at_bar"][i] < -max_weekly:
                return RiskViolation(i, snap["time"], "maxWeeklyLossCurrency",
                                     max_weekly, -period_losses["weekly_at_bar"][i], "halt")
        return None

    # ------------------------------------------------------------------
    # Halt enforcement
    # ------------------------------------------------------------------

    def _force_close_open_trade(
        self, engine: Engine, result: EngineResult, halted_bar: int
    ) -> None:
        """Close any position still open at the halt bar at its close price
        (market fill: slippage + commission apply), then true-up the last
        equity snapshot to realized equity.
        """
        bar = self.bars[halted_bar]
        for t in result.trades:
            if t.is_open:
                t.exit_fill = engine._build_fill(
                    halted_bar, bar.time, bar.close, t.entry_fill.qty, "exit", t.side
                )
        realized = self.payload.sizing.initialCapital + sum(
            t.net_pnl for t in result.trades if not t.is_open
        )
        if result.equity_curve:
            last = result.equity_curve[-1]
            last["equity"] = round(realized, 4)
            last["open_trade"] = False

    def _extend_curve_flat(self, result: EngineResult, initial_capital: float) -> None:
        """Pad the equity curve flat from the halt bar to the last data bar,
        flagged halted=True, with drawdown recomputed over the padded curve.
        """
        flat_eq = result.equity_curve[-1]["equity"] if result.equity_curve else initial_capital
        for i in range(len(result.equity_curve), len(self.bars)):
            result.equity_curve.append({
                "bar_index": i, "time": self.bars[i].time, "equity": flat_eq,
                "drawdown": 0.0, "open_trade": False, "halted": True,
            })
        peak = initial_capital
        for snap in result.equity_curve:
            peak = max(peak, snap["equity"])
            snap["drawdown"] = round((peak - snap["equity"]) / peak * 100, 4) if peak else 0.0
        result.bars_processed = len(self.bars)

    # ------------------------------------------------------------------
    # Post-run checks & metrics
    # ------------------------------------------------------------------

    @staticmethod
    def _streaks(pnl_values: list[float]) -> dict[str, int]:
        cl = cw = max_cl = max_cw = 0
        for pnl in pnl_values:
            if pnl < 0:
                cl, cw = cl + 1, 0
                max_cl = max(max_cl, cl)
            elif pnl > 0:
                cw, cl = cw + 1, 0
                max_cw = max(max_cw, cw)
        return {"losses": cl, "wins": cw, "max_losses": max_cl, "max_wins": max_cw}

    def _warn_violations(
        self, pnl_values: list[float], streaks: dict[str, int]
    ) -> list[RiskViolation]:
        out: list[RiskViolation] = []
        last_bar = self.bars[-1] if self.bars else None
        bi = last_bar.index if last_bar else 0
        bt = last_bar.time if last_bar else 0

        max_cl = self.risk_limits.get("maxConsecutiveLosses")
        if max_cl and streaks["max_losses"] > max_cl:
            out.append(RiskViolation(bi, bt, "maxConsecutiveLosses",
                                     max_cl, streaks["max_losses"], "warn"))

        if not pnl_values:
            return out

        wins = sum(1 for p in pnl_values if p > 0)
        win_rate = 100 * wins / len(pnl_values)
        gains = sum(p for p in pnl_values if p > 0)
        losses = sum(abs(p) for p in pnl_values if p < 0)
        profit_factor = gains / losses if losses > 0 else (gains if gains > 0 else 0)
        expectancy = sum(pnl_values) / len(pnl_values)

        min_wr = self.risk_limits.get("winRateMin")
        if min_wr and win_rate < min_wr:
            out.append(RiskViolation(bi, bt, "winRateMin", min_wr, win_rate, "warn"))
        min_pf = self.risk_limits.get("profitFactorMin")
        if min_pf and profit_factor < min_pf:
            out.append(RiskViolation(bi, bt, "profitFactorMin", min_pf, profit_factor, "warn"))
        min_ev = self.risk_limits.get("expectancyMin")
        if min_ev is not None and expectancy < min_ev:
            out.append(RiskViolation(bi, bt, "expectancyMin", min_ev, expectancy, "warn"))
        return out

    def _metrics(
        self, result: EngineResult, pnl_values: list[float],
        streaks: dict[str, int], period_losses: dict[str, dict],
    ) -> RiskMetrics:
        curve = result.equity_curve
        max_dd = max((s["drawdown"] for s in curve), default=0.0)
        current_dd = curve[-1]["drawdown"] if curve else 0.0

        gains = sum(p for p in pnl_values if p > 0)
        losses = sum(abs(p) for p in pnl_values if p < 0)
        profit_factor = gains / losses if losses > 0 else (gains if gains > 0 else None)
        expectancy = sum(pnl_values) / len(pnl_values) if pnl_values else None

        sharpe: float | None = None
        if len(pnl_values) > 1 and expectancy is not None:
            std = sqrt(sum((p - expectancy) ** 2 for p in pnl_values) / len(pnl_values))
            if std > _STD_EPS:
                sharpe = expectancy / std * sqrt(252 / len(pnl_values))

        loss_trades = [p for p in pnl_values if p < 0]
        return RiskMetrics(
            max_drawdown_pct=max_dd,
            current_drawdown_pct=current_dd,
            daily_max_loss_usd=min(period_losses["daily"].values()) if period_losses["daily"] else None,
            weekly_max_loss_usd=min(period_losses["weekly"].values()) if period_losses["weekly"] else None,
            consecutive_losses=streaks["losses"],
            consecutive_wins=streaks["wins"],
            max_consecutive_losses=streaks["max_losses"],
            max_consecutive_wins=streaks["max_wins"],
            avg_trade_loss_usd=sum(loss_trades) / len(loss_trades) if loss_trades else None,
            profit_factor=profit_factor,
            expectancy=expectancy,
            sharpe_ratio=sharpe,
        )
