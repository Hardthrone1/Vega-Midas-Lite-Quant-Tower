"""
strategy_spec.py — Canonical strategy specification.

One spec → two outputs (Pine Script v5 + BacktestPayload JSON).
This is the single source of truth that prevents Pine/Python drift.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any


@dataclass
class StrategySpec:
    name: str = "MIDAS Liquidity Sweep"
    version: str = "1.0"

    # --- Instrument ---
    symbol: str = "MGC"
    exchange: str = "COMEX"
    timeframe: str = "5"
    tick_size: float = 0.1
    point_value: float = 10.0

    # --- Entry ---
    entry_type: str = "liquidity_sweep"
    entry_offset: float = 2.0
    entry_side: str = "both"
    confirm_on_bar_close: bool = True

    # --- Exit ---
    tp_points: float = 20.0
    sl_points: float = 10.0
    use_trailing: bool = True
    trail_activation: float = 10.0
    trail_offset: float = 2.0

    # --- Structure filters ---
    pivot_len: int = 3
    min_opp_breaks: int = 2
    max_opp_breaks: int = 2
    retrace_threshold: float = 0.665

    # --- Execution ---
    commission: float = 0.0
    slippage: int = 0
    initial_capital: float = 50000.0
    qty: float = 1.0
    pyramiding: int = 0

    # --- Window ---
    window_start: str = ""
    window_end: str = ""

    # --- Metadata ---
    description: str = ""
    tags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)

    def save(self, path: str | Path) -> None:
        Path(path).write_text(self.to_json(), encoding="utf-8")

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> StrategySpec:
        valid_fields = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in d.items() if k in valid_fields}
        return cls(**filtered)

    @classmethod
    def load(cls, path: str | Path) -> StrategySpec:
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))

    @classmethod
    def liquidity_sweep_mgc(cls) -> StrategySpec:
        return cls(
            name="MIDAS Liquidity Sweep",
            symbol="MGC",
            exchange="COMEX",
            timeframe="5",
            tick_size=0.1,
            point_value=10.0,
            entry_type="liquidity_sweep",
            entry_offset=2.0,
            tp_points=20.0,
            sl_points=10.0,
            use_trailing=True,
            trail_activation=10.0,
            trail_offset=2.0,
            pivot_len=3,
            retrace_threshold=0.665,
            initial_capital=50000.0,
            description="Liquidity sweep strategy on Micro Gold 5m bars",
            tags=["MGC", "liquidity_sweep", "5m"],
        )

    @classmethod
    def liquidity_sweep_mnq(cls) -> StrategySpec:
        return cls(
            name="MIDAS Liquidity Sweep MNQ",
            symbol="MNQ",
            exchange="CME",
            timeframe="5",
            tick_size=0.25,
            point_value=2.0,
            entry_type="liquidity_sweep",
            entry_offset=5.0,
            tp_points=50.0,
            sl_points=25.0,
            use_trailing=True,
            trail_activation=25.0,
            trail_offset=5.0,
            pivot_len=3,
            retrace_threshold=0.665,
            initial_capital=50000.0,
            description="Liquidity sweep strategy on Micro Nasdaq 5m bars",
            tags=["MNQ", "liquidity_sweep", "5m"],
        )
