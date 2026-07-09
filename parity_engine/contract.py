"""Typed Python mirror of the dashboard's PythonBacktestPayload contract.

Source of truth: midas_code/src/shared/adapters/pythonBacktestAdapter.ts
Keep these dataclasses in lock-step with that TypeScript type. The parser is
defensive: it accepts the exact JSON the adapter emits and fills sane defaults
so a slightly older/newer payload still loads.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Asset:
    symbol: str
    timeframe: str
    tickSize: float | None = None
    pointValue: float | None = None


@dataclass
class Session:
    name: str | None = None
    timezone: str | None = None
    start: str | None = None
    end: str | None = None
    rthOnly: bool = True


@dataclass
class Execution:
    confirmOnBarClose: bool = True
    recalcMode: str = "close_only"
    fillMode: str = "on_close"
    slippageTicks: int = 0
    commissionType: str = "cash_per_contract"
    commissionValue: float = 0.0
    useBarMagnifier: bool = False
    processOrdersOnClose: bool = True


@dataclass
class Sizing:
    initialCapital: float = 10000.0
    baseCurrency: str = "USD"
    qtyType: str = "fixed"
    qtyValue: float = 1.0
    pyramiding: int = 0


@dataclass
class Condition:
    id: str
    expression: str


@dataclass
class Entry:
    side: str = "both"
    orderType: str = "market"
    conditions: list[Condition] = field(default_factory=list)


@dataclass
class Exit:
    stop: dict[str, Any] = field(default_factory=dict)
    target: dict[str, Any] = field(default_factory=dict)
    trailing: dict[str, Any] = field(default_factory=dict)
    timeStopBars: int | None = None


@dataclass
class BacktestPayload:
    schemaVersion: int
    strategyId: str
    generatedFrom: str
    asset: Asset
    session: Session
    execution: Execution
    sizing: Sizing
    entry: Entry
    exit: Exit
    risk: dict[str, Any] | None = None

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "BacktestPayload":
        a = d.get("asset", {})
        s = d.get("session", {})
        x = d.get("execution", {})
        z = d.get("sizing", {})
        e = d.get("entry", {})
        xt = d.get("exit", {})
        return BacktestPayload(
            schemaVersion=d.get("schemaVersion", 1),
            strategyId=d.get("strategyId", "unknown"),
            generatedFrom=d.get("generatedFrom", ""),
            asset=Asset(
                symbol=a.get("symbol", "MGC1!"),
                timeframe=a.get("timeframe", "5m"),
                tickSize=a.get("tickSize"),
                pointValue=a.get("pointValue"),
            ),
            session=Session(
                name=s.get("name"),
                timezone=s.get("timezone"),
                start=s.get("start"),
                end=s.get("end"),
                rthOnly=s.get("rthOnly", True),
            ),
            execution=Execution(
                confirmOnBarClose=x.get("confirmOnBarClose", True),
                recalcMode=x.get("recalcMode", "close_only"),
                fillMode=x.get("fillMode", "on_close"),
                slippageTicks=int(x.get("slippageTicks", 0)),
                commissionType=x.get("commissionType", "cash_per_contract"),
                commissionValue=float(x.get("commissionValue", 0.0)),
                useBarMagnifier=x.get("useBarMagnifier", False),
                processOrdersOnClose=x.get("processOrdersOnClose", True),
            ),
            sizing=Sizing(
                initialCapital=float(z.get("initialCapital", 10000.0)),
                baseCurrency=z.get("baseCurrency", "USD"),
                qtyType=z.get("qtyType", "fixed"),
                qtyValue=float(z.get("qtyValue", 1.0)),
                pyramiding=int(z.get("pyramiding", 0)),
            ),
            entry=Entry(
                side=e.get("side", "both"),
                orderType=e.get("orderType", "market"),
                conditions=[
                    Condition(id=c.get("id", ""), expression=c.get("expression", ""))
                    for c in e.get("conditions", [])
                ],
            ),
            exit=Exit(
                stop=xt.get("stop", {}) or {},
                target=xt.get("target", {}) or {},
                trailing=xt.get("trailing", {}) or {},
                timeStopBars=xt.get("timeStopBars"),
            ),
            risk=d.get("risk"),
        )


# Default contract economics for the instruments the user trades. The dashboard
# may omit tickSize/pointValue; we backfill from here so PnL is contract-correct.
INSTRUMENT_DEFAULTS: dict[str, dict[str, float]] = {
    "MGC": {"tickSize": 0.1, "pointValue": 10.0},
    "MNQ": {"tickSize": 0.25, "pointValue": 2.0},
    "NQ": {"tickSize": 0.25, "pointValue": 20.0},
}


def resolve_economics(asset: Asset) -> tuple[float, float]:
    """Return (tickSize, pointValue), filling from INSTRUMENT_DEFAULTS by prefix."""
    if asset.tickSize and asset.pointValue:
        return asset.tickSize, asset.pointValue
    root = asset.symbol.rstrip("1!").upper()
    for key, econ in INSTRUMENT_DEFAULTS.items():
        if root.startswith(key):
            return (
                asset.tickSize or econ["tickSize"],
                asset.pointValue or econ["pointValue"],
            )
    return asset.tickSize or 0.25, asset.pointValue or 1.0
