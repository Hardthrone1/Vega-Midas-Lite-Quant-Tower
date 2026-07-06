// src/shared/adapters/pythonBacktestAdapter.ts
//
// Deterministic, side-effect-free adapter: same spec in -> same payload out.
// This is the contract the Python parity engine consumes. Keeping it pure means
// spec changes always produce identical Python inputs, which is what makes
// backtest-vs-live parity checks trustworthy.

import type { CanonicalStrategySpec } from '../validation/strategySchema'

export type PythonBacktestPayload = {
  schemaVersion: 1
  strategyId: string
  generatedFrom: string // spec meta.version, for traceability
  asset: {
    symbol: string
    timeframe: string
    tickSize: number | null
    pointValue: number | null
  }
  session: {
    name: string | null
    timezone: string | null
    start: string | null
    end: string | null
    rthOnly: boolean
  }
  execution: {
    confirmOnBarClose: boolean
    recalcMode: string
    fillMode: string
    slippageTicks: number
    commissionType: string
    commissionValue: number
    useBarMagnifier: boolean
    processOrdersOnClose: boolean
  }
  sizing: {
    initialCapital: number
    baseCurrency: string
    qtyType: string
    qtyValue: number
    pyramiding: number
  }
  entry: {
    side: string
    orderType: string
    conditions: Array<{ id: string; expression: string }>
  }
  exit: {
    stop: Record<string, unknown>
    target: Record<string, unknown>
    trailing: { enabled: boolean; mode: string; value: number | null }
    timeStopBars: number | null
  }
  risk: Record<string, unknown> | null
}

/**
 * Convert a validated canonical spec into a flat, JSON-serializable payload for
 * the Python backtester. Pure: no Date.now(), no randomness, no I/O.
 */
export function buildPythonBacktestPayload(
  spec: CanonicalStrategySpec
): PythonBacktestPayload {
  return {
    schemaVersion: 1,
    strategyId: spec.meta.strategyId,
    generatedFrom: spec.meta.version,
    asset: {
      symbol: spec.asset.symbol,
      timeframe: spec.asset.timeframe,
      tickSize: spec.asset.tickSize ?? null,
      pointValue: spec.asset.pointValue ?? null,
    },
    session: {
      name: spec.session?.sessionName ?? null,
      timezone: spec.session?.timezone ?? null,
      start: spec.session?.start ?? null,
      end: spec.session?.end ?? null,
      rthOnly: spec.session?.tradeRTHOnly ?? true,
    },
    execution: {
      confirmOnBarClose: spec.entry.confirmOnBarClose,
      recalcMode: spec.properties.recalcMode,
      fillMode: spec.properties.fillMode,
      slippageTicks: spec.properties.slippageTicks,
      commissionType: spec.properties.commissionType,
      commissionValue: spec.properties.commissionValue,
      useBarMagnifier: spec.properties.useBarMagnifier,
      processOrdersOnClose: spec.properties.processOrdersOnClose,
    },
    sizing: {
      initialCapital: spec.properties.initialCapital,
      baseCurrency: spec.properties.baseCurrency,
      qtyType: spec.properties.qtyType,
      qtyValue: spec.properties.qtyValue,
      pyramiding: spec.properties.pyramiding,
    },
    entry: {
      side: spec.entry.side,
      orderType: spec.entry.orderType,
      // conditionSchema is a union: legacy {id, expression, enabled} entries
      // pass through as-is (respecting the enabled flag); normalized
      // {type, parameters} entries are always active and serialize to the
      // same "type(param=value)" expression convention.
      conditions: spec.entry.conditions
        .filter((c) => ('enabled' in c ? c.enabled : true))
        .map((c, i) =>
          'expression' in c
            ? { id: c.id, expression: c.expression }
            : {
                id: `cond_${i + 1}`,
                expression: `${c.type}(${Object.entries(c.parameters)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(', ')})`,
              }
        ),
    },
    exit: {
      stop: { ...spec.exit.stop },
      target: { ...spec.exit.target },
      trailing: {
        enabled: spec.exit.useTrailing,
        mode: spec.exit.trailMode,
        value: spec.exit.trailValue ?? null,
      },
      timeStopBars: spec.exit.timeStopBars ?? null,
    },
    risk: spec.properties.backtestRisk
      ? { ...spec.properties.backtestRisk }
      : null,
  }
}
