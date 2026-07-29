// src/shared/chart/EquityChart.tsx
// The parity run's equity curve at full size. A baseline series pinned to
// starting capital does the colouring natively: blue while the run is in
// profit, red once it is underwater.
import { useEffect, useMemo } from 'react'
import type { LineData, Time } from 'lightweight-charts'
import { useLightweightChart } from './useLightweightChart'

export type EquityPoint = Record<string, unknown>

/** Equity rows carry { i, dt, equity }; dt is an ET timestamp string. */
function toSeries(curve: EquityPoint[]): LineData<Time>[] {
  const seen = new Set<number>()
  const out: LineData<Time>[] = []
  curve.forEach((p, i) => {
    const equity = typeof p.equity === 'number' ? p.equity : Number(p.equity)
    if (!Number.isFinite(equity)) return
    const parsed = typeof p.dt === 'string' ? Date.parse(p.dt.replace(' ', 'T')) : NaN
    // Fall back to the row index when a timestamp is missing or unparseable —
    // lightweight-charts needs strictly ascending, unique times.
    let t = Number.isFinite(parsed) ? Math.floor(parsed / 1000) : i
    while (seen.has(t)) t += 1
    seen.add(t)
    out.push({ time: t as Time, value: equity })
  })
  return out.sort((a, b) => (a.time as number) - (b.time as number))
}

export function EquityChart({ curve, baseline }: { curve: EquityPoint[]; baseline?: number }) {
  const { containerRef, chartRef, ready } = useLightweightChart()
  const data = useMemo(() => toSeries(curve), [curve])

  useEffect(() => {
    if (!ready || !chartRef.current || data.length === 0) return
    const chart = chartRef.current
    const start = baseline ?? data[0].value

    const series = chart.addBaselineSeries({
      baseValue: { type: 'price', price: start },
      topLineColor: '#4c8dff',
      topFillColor1: 'rgba(76, 141, 255, 0.28)',
      topFillColor2: 'rgba(76, 141, 255, 0.02)',
      bottomLineColor: '#ff4d5e',
      bottomFillColor1: 'rgba(255, 77, 94, 0.02)',
      bottomFillColor2: 'rgba(255, 77, 94, 0.28)',
      lineWidth: 2,
    })
    series.setData(data)
    chart.timeScale().fitContent()

    // Only detach if this chart is still live — the chart's own cleanup runs
    // first and disposes its series with it, and removeSeries on a removed
    // chart throws.
    return () => {
      if (chartRef.current === chart) chart.removeSeries(series)
    }
  }, [ready, data, baseline, chartRef])

  return <div ref={containerRef} className="chart-canvas" />
}
