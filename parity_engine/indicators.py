"""Deterministic indicators that must match TradingView's `ta.*` semantics.

Pine's `ta.atr(len)` uses RMA (Wilder's smoothing), not a simple average — a
very common parity bug. We replicate that here. SMA/EMA included for entry
expressions. All functions return a list aligned to the input bars, with `None`
for warmup positions where Pine would emit `na`.
"""
from __future__ import annotations


def true_range(highs, lows, closes):
    tr = [None] * len(closes)
    for i in range(len(closes)):
        if i == 0:
            tr[i] = highs[i] - lows[i]
        else:
            prev_close = closes[i - 1]
            tr[i] = max(
                highs[i] - lows[i],
                abs(highs[i] - prev_close),
                abs(lows[i] - prev_close),
            )
    return tr


def rma(values, length):
    """Wilder's RMA — exactly what Pine's ta.atr / ta.rma use."""
    out = [None] * len(values)
    if length <= 0:
        return out
    # seed with simple average of the first `length` non-None values
    acc = 0.0
    count = 0
    seed_idx = None
    for i, v in enumerate(values):
        if v is None:
            continue
        acc += v
        count += 1
        if count == length:
            seed_idx = i
            out[i] = acc / length
            break
    if seed_idx is None:
        return out
    alpha = 1.0 / length
    for i in range(seed_idx + 1, len(values)):
        v = values[i]
        if v is None:
            out[i] = out[i - 1]
            continue
        prev = out[i - 1]
        out[i] = alpha * v + (1 - alpha) * prev
    return out


def atr(highs, lows, closes, length):
    """ta.atr(length) — RMA of true range."""
    return rma(true_range(highs, lows, closes), length)


def sma(values, length):
    out = [None] * len(values)
    for i in range(len(values)):
        if i + 1 >= length:
            window = values[i - length + 1 : i + 1]
            out[i] = sum(window) / length
    return out


def ema(values, length):
    out = [None] * len(values)
    if not values:
        return out
    k = 2.0 / (length + 1)
    seed = None
    for i in range(len(values)):
        if i + 1 == length:
            seed = sum(values[:length]) / length
            out[i] = seed
        elif i + 1 > length:
            out[i] = values[i] * k + out[i - 1] * (1 - k)
    return out
