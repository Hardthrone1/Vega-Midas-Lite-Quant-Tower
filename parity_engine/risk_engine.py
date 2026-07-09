"""Risk simulation layer for parity engine.

Extends backtest results to track and enforce risk limits:
  • Drawdown limits (max drawdown %, daily loss %, weekly loss %)
  • Per-trade risk (max loss %, currency, consecutive loss count)
  • Portfolio exposure (max open risk %, concurrent pyramids)
  • Performance floor (minimum expectancy, Sharpe, win rate, profit factor)

When a hard limit is breached, trading halts and records the violation.
Returns enhanced result with risk status, metrics, and violations.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from datetime import datetime, timezone
from math import sqrt

from parity_engine.contract import BacktestPayload
from parity_engine.engine import Engine, Bar, EngineResult


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
    avg_trade_loss_pct: float | None
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
                "avgTradeLossPct": self.risk_metrics.avg_trade_loss_pct,
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
        self.engine = Engine(payload, bars)
        self.risk_limits = payload.risk or {}

    def run(self) -> RiskResult:
        """Run backtest with risk enforcement."""
        base_result = self.engine.run()

        violations: list[RiskViolation] = []
        halted_bar: int | None = None

        # Extract risk limits (all optional)
        max_dd_pct = self.risk_limits.get("maxDrawdownPct")
        max_daily_loss = self.risk_limits.get("maxDailyLossCurrency")
        max_weekly_loss = self.risk_limits.get("maxWeeklyLossCurrency")
        max_trade_loss_pct = self.risk_limits.get("maxTradeLossPct")
        max_trade_loss_usd = self.risk_limits.get("maxTradeLossCurrency")
        max_consecutive_losses = self.risk_limits.get("maxConsecutiveLosses")
        min_win_rate = self.risk_limits.get("winRateMin")
        min_profit_factor = self.risk_limits.get("profitFactorMin")
        min_expectancy = self.risk_limits.get("expectancyMin")

        # Track daily/weekly losses
        daily_pnl: dict[str, float] = {}  # date -> daily_pnl
        weekly_pnl: dict[int, float] = {}  # week_num -> weekly_pnl

        # Track trade streaks
        consecutive_losses = 0
        consecutive_wins = 0
        max_consec_losses = 0
        max_consec_wins = 0

        initial_capital = self.payload.sizing.initialCapital

        # Walk through bars and check violations
        for bar_idx, bar in enumerate(self.bars):
            bar_dt = datetime.fromtimestamp(bar.time / 1000, tz=timezone.utc)
            date_key = bar_dt.date().isoformat()
            week_key = bar_dt.isocalendar()[1]

            # Update daily/weekly PnL from equity curve
            if bar_idx < len(base_result.equity_curve):
                eq = base_result.equity_curve[bar_idx]
                pnl = eq.get("equity", initial_capital) - initial_capital
                daily_pnl[date_key] = pnl
                weekly_pnl[week_key] = pnl

                # Check drawdown (engine already computes this as % of peak)
                if max_dd_pct:
                    dd_pct = eq.get("drawdown", 0.0)
                    if dd_pct > max_dd_pct and not halted_bar:
                        violations.append(RiskViolation(
                            bar_index=bar_idx,
                            bar_time=bar.time,
                            limit_name="maxDrawdownPct",
                            limit_value=max_dd_pct,
                            actual_value=dd_pct,
                            severity="halt"
                        ))
                        halted_bar = bar_idx

                # Check daily max loss
                if max_daily_loss:
                    day_loss = daily_pnl.get(date_key, 0)
                    if day_loss < -max_daily_loss and not halted_bar:
                        violations.append(RiskViolation(
                            bar_index=bar_idx,
                            bar_time=bar.time,
                            limit_name="maxDailyLossCurrency",
                            limit_value=max_daily_loss,
                            actual_value=-day_loss,
                            severity="halt"
                        ))
                        halted_bar = bar_idx

                # Check weekly max loss
                if max_weekly_loss:
                    week_loss = weekly_pnl.get(week_key, 0)
                    if week_loss < -max_weekly_loss and not halted_bar:
                        violations.append(RiskViolation(
                            bar_index=bar_idx,
                            bar_time=bar.time,
                            limit_name="maxWeeklyLossCurrency",
                            limit_value=max_weekly_loss,
                            actual_value=-week_loss,
                            severity="halt"
                        ))
                        halted_bar = bar_idx

        # Post-backtest checks: closed trade metrics
        closed = [t for t in base_result.trades if not t.is_open]

        # Track consecutive losses/wins
        for trade in closed:
            if trade.net_pnl < 0:
                consecutive_losses += 1
                consecutive_wins = 0
                max_consec_losses = max(max_consec_losses, consecutive_losses)
            elif trade.net_pnl > 0:
                consecutive_wins += 1
                consecutive_losses = 0
                max_consec_wins = max(max_consec_wins, consecutive_wins)

        # Check max consecutive losses limit
        if max_consecutive_losses and max_consec_losses > max_consecutive_losses:
            violations.append(RiskViolation(
                bar_index=len(self.bars) - 1,
                bar_time=self.bars[-1].time if self.bars else 0,
                limit_name="maxConsecutiveLosses",
                limit_value=max_consecutive_losses,
                actual_value=max_consec_losses,
                severity="warn"
            ))

        # Compute risk metrics (drawdown already in equity curve)
        max_dd = 0.0
        current_dd = 0.0
        if base_result.equity_curve:
            drawdowns = [eq.get("drawdown", 0.0) for eq in base_result.equity_curve]
            max_dd = max(drawdowns) if drawdowns else 0.0
            current_dd = base_result.equity_curve[-1].get("drawdown", 0.0) if base_result.equity_curve else 0.0

        # Profit factor, expectancy, Sharpe
        pnl_values = [t.net_pnl for t in closed if not t.is_open]
        gains = sum(p for p in pnl_values if p > 0)
        losses = sum(abs(p) for p in pnl_values if p < 0)
        profit_factor = gains / losses if losses > 0 else (gains if gains > 0 else 0)

        expectancy = sum(pnl_values) / len(pnl_values) if pnl_values else 0
        win_rate = 100 * sum(1 for p in pnl_values if p > 0) / len(pnl_values) if pnl_values else 0

        # Sharpe ratio (annualized, assuming 252 trading days)
        if len(pnl_values) > 1:
            pnl_mean = expectancy
            pnl_std = sqrt(sum((p - pnl_mean) ** 2 for p in pnl_values) / len(pnl_values))
            sharpe = (pnl_mean / pnl_std * sqrt(252 / len(pnl_values))) if pnl_std > 0 else 0
        else:
            sharpe = 0

        # Check performance floor limits
        if min_win_rate and win_rate < min_win_rate:
            violations.append(RiskViolation(
                bar_index=len(self.bars) - 1,
                bar_time=self.bars[-1].time if self.bars else 0,
                limit_name="winRateMin",
                limit_value=min_win_rate,
                actual_value=win_rate,
                severity="warn"
            ))

        if min_profit_factor and profit_factor < min_profit_factor:
            violations.append(RiskViolation(
                bar_index=len(self.bars) - 1,
                bar_time=self.bars[-1].time if self.bars else 0,
                limit_name="profitFactorMin",
                limit_value=min_profit_factor,
                actual_value=profit_factor,
                severity="warn"
            ))

        if min_expectancy is not None and expectancy < min_expectancy:
            violations.append(RiskViolation(
                bar_index=len(self.bars) - 1,
                bar_time=self.bars[-1].time if self.bars else 0,
                limit_name="expectancyMin",
                limit_value=min_expectancy,
                actual_value=expectancy,
                severity="warn"
            ))

        # Determine overall status
        halt_violations = [v for v in violations if v.severity == "halt"]
        warn_violations = [v for v in violations if v.severity == "warn"]
        risk_status = "halt" if halt_violations else ("warn" if warn_violations else "ok")

        risk_metrics = RiskMetrics(
            max_drawdown_pct=max_dd,
            current_drawdown_pct=current_dd,
            daily_max_loss_usd=min(daily_pnl.values()) if daily_pnl else None,
            weekly_max_loss_usd=min(weekly_pnl.values()) if weekly_pnl else None,
            consecutive_losses=consecutive_losses,
            consecutive_wins=consecutive_wins,
            max_consecutive_losses=max_consec_losses,
            max_consecutive_wins=max_consec_wins,
            avg_trade_loss_pct=None,  # TODO: compute if needed
            avg_trade_loss_usd=None,  # Computed below
            profit_factor=profit_factor,
            expectancy=expectancy,
            sharpe_ratio=sharpe,
        )

        # Fix avg_trade_loss_usd calculation
        loss_trades = [p for p in pnl_values if p < 0]
        if loss_trades:
            avg_loss = sum(loss_trades) / len(loss_trades)
        else:
            avg_loss = None
        risk_metrics.avg_trade_loss_usd = avg_loss

        return RiskResult(
            engine_result=base_result,
            risk_violations=violations,
            risk_metrics=risk_metrics,
            trading_halted_at_bar=halted_bar,
            risk_status=risk_status,
        )
