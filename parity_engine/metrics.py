"""Edge metrics — same definitions the Quant Lab dashboard displays.

Consumes EngineResult.trades and equity_curve. No third-party deps.
Every formula here has a 1:1 mapping to the dashboard's diagnostic panels.
"""
from __future__ import annotations

import math
from typing import Any


def compute_metrics(trades, equity_curve, initial_capital: float) -> dict[str, Any]:
    """
    Returns a flat dict of all edge metrics.
    Trades are Trade objects from engine.py; equity_curve is the list of dicts.
    """
    closed = [t for t in trades if not t.is_open]

    total = len(closed)
    if total == 0:
        return _empty_metrics()

    wins = [t for t in closed if t.net_pnl > 0]
    losses = [t for t in closed if t.net_pnl <= 0]

    win_count = len(wins)
    loss_count = len(losses)
    win_rate = win_count / total * 100.0 if total else 0.0

    gross_profit = sum(t.net_pnl for t in wins)
    gross_loss = abs(sum(t.net_pnl for t in losses))

    avg_win = gross_profit / win_count if win_count else 0.0
    avg_loss = gross_loss / loss_count if loss_count else 0.0

    # +EV: average outcome per trade (net of commission and slippage)
    ev = sum(t.net_pnl for t in closed) / total

    # R-multiple: treat average loss as 1R; each trade PnL / avg_loss
    r_multiples = [t.net_pnl / avg_loss for t in closed] if avg_loss > 0 else []
    avg_r = sum(r_multiples) / len(r_multiples) if r_multiples else 0.0

    # Profit factor
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else math.inf

    # Payoff ratio (avg win / avg loss)
    payoff_ratio = avg_win / avg_loss if avg_loss > 0 else math.inf

    # Max drawdown from equity curve
    peak = initial_capital
    max_dd = 0.0
    for snap in equity_curve:
        eq = snap["equity"]
        if eq > peak:
            peak = eq
        dd = (peak - eq) / peak * 100.0 if peak else 0.0
        if dd > max_dd:
            max_dd = dd

    # Returns for Sharpe / Sortino (trade-level net PnL as pct of capital at entry)
    returns = [t.net_pnl / initial_capital for t in closed]

    sharpe = _sharpe(returns)
    sortino = _sortino(returns)

    # Kelly criterion: f = (p * b - q) / b  where b = payoff_ratio
    p = win_rate / 100.0
    q = 1 - p
    kelly = (p * payoff_ratio - q) / payoff_ratio if payoff_ratio and payoff_ratio != math.inf else 0.0
    kelly = max(0.0, min(kelly, 1.0))  # clamp [0, 1]
    fractional_kelly = kelly / 2.0

    # VaR at 95 % confidence (parametric)
    var_95 = _var(returns, 0.95)
    cvar_95 = _cvar(returns, 0.95)

    # Alpha vs 0 % benchmark (excess return)
    total_return_pct = sum(t.net_pnl for t in closed) / initial_capital * 100.0
    alpha = total_return_pct  # vs zero-return benchmark

    return {
        "total_trades": total,
        "win_rate_pct": round(win_rate, 2),
        "ev": round(ev, 4),
        "r_multiple_avg": round(avg_r, 4),
        "profit_factor": round(profit_factor, 4) if profit_factor != math.inf else None,
        "payoff_ratio": round(payoff_ratio, 4) if payoff_ratio != math.inf else None,
        "gross_profit": round(gross_profit, 4),
        "gross_loss": round(gross_loss, 4),
        "avg_win": round(avg_win, 4),
        "avg_loss": round(avg_loss, 4),
        "max_drawdown_pct": round(max_dd, 4),
        "sharpe": round(sharpe, 4) if sharpe is not None else None,
        "sortino": round(sortino, 4) if sortino is not None else None,
        "kelly": round(kelly, 4),
        "fractional_kelly": round(fractional_kelly, 4),
        "var_95": round(var_95, 4) if var_95 is not None else None,
        "cvar_95": round(cvar_95, 4) if cvar_95 is not None else None,
        "alpha_vs_zero": round(alpha, 4),
        "total_net_pnl": round(sum(t.net_pnl for t in closed), 4),
        "total_return_pct": round(total_return_pct, 4),
    }


def _empty_metrics() -> dict[str, Any]:
    return {k: None for k in [
        "total_trades", "win_rate_pct", "ev", "r_multiple_avg",
        "profit_factor", "payoff_ratio", "gross_profit", "gross_loss",
        "avg_win", "avg_loss", "max_drawdown_pct", "sharpe", "sortino",
        "kelly", "fractional_kelly", "var_95", "cvar_95",
        "alpha_vs_zero", "total_net_pnl", "total_return_pct",
    ]}


def _sharpe(returns: list[float], risk_free: float = 0.0) -> float | None:
    n = len(returns)
    if n < 2:
        return None
    mean = sum(returns) / n - risk_free
    variance = sum((r - mean - risk_free) ** 2 for r in returns) / (n - 1)
    std = math.sqrt(variance) if variance > 0 else 0.0
    return mean / std * math.sqrt(252) if std > 0 else None


def _sortino(returns: list[float], risk_free: float = 0.0) -> float | None:
    n = len(returns)
    if n < 2:
        return None
    mean = sum(returns) / n - risk_free
    neg_sq = [(r - risk_free) ** 2 for r in returns if r < risk_free]
    if not neg_sq:
        return None
    downside_std = math.sqrt(sum(neg_sq) / len(neg_sq))
    return mean / downside_std * math.sqrt(252) if downside_std > 0 else None


def _var(returns: list[float], confidence: float) -> float | None:
    if not returns:
        return None
    sorted_r = sorted(returns)
    index = int((1 - confidence) * len(sorted_r))
    return -sorted_r[index]  # VaR is positive for a loss


def _cvar(returns: list[float], confidence: float) -> float | None:
    if not returns:
        return None
    sorted_r = sorted(returns)
    cutoff = int((1 - confidence) * len(sorted_r))
    tail = sorted_r[:max(1, cutoff)]
    return -sum(tail) / len(tail)
