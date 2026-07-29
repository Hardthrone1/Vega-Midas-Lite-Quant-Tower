// src/shared/chart/CandleChart.tsx
// Candlesticks at full size for the overlay. Bars arrive already aggregated to
// the requested interval (see aggregateBars) so switching timeframe is a data
// swap, not a chart rebuild.
import { useEffect, useMemo } from 'react'
import type { CandlestickData, HistogramData, Time } from 'lightweight-charts'
import type { ReplayBar } from '../../features/replay/hooks/useReplayScheduler'
import { useLightweightChart } from './useLightweightChart'

const UP = '#4c8dff'
const DOWN = '#ff4d5e'
const FLAT = '#7d8797'

/** Roll bars up to `minutes`: first open, max high, min low, last close, summed volume. */
export function aggregateBars(bars: ReplayBar[], minutes: number): ReplayBar[] {
  if (minutes <= 1) return bars
  const span = minutes * 60_000
  const out: ReplayBar[] = []
  let cur: ReplayBar | null = null
  let bucket = NaN
  for (const b of bars) {
    const k = Math.floor(b.time / span) * span
    if (!cur || k !== bucket) {
      cur = { ...b, time: k }
      bucket = k
      out.push(cur)
    } else {
      cur.high = Math.max(cur.high, b.high)
      cur.low = Math.min(cur.low, b.low)
      cur.close = b.close
      cur.volume = (cur.volume ?? 0) + (b.volume ?? 0)
    }
  }
  return out
}

export function CandleChart({ bars }: { bars: ReplayBar[] }) {
  const { containerRef, chartRef, ready } = useLightweightChart()

  const { candles, volume } = useMemo(() => {
    const c: CandlestickData<Time>[] = []
    const v: HistogramData<Time>[] = []
    for (const b of bars) {
      const time = Math.floor(b.time / 1000) as Time
      c.push({ time, open: b.open, high: b.high, low: b.low, close: b.close })
      const colour = b.close > b.open ? 'rgba(76,141,255,.42)' : b.close < b.open ? 'rgba(255,77,94,.42)' : 'rgba(125,135,151,.4)'
      v.push({ time, value: b.volume ?? 0, color: colour })
    }
    return { candles: c, volume: v }
  }, [bars])

  useEffect(() => {
    if (!ready || !chartRef.current || candles.length === 0) return
    const chart = chartRef.current

    const candleSeries = chart.addCandlestickSeries({
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
    })
    candleSeries.setData(candles)

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vega-volume',
      color: FLAT,
    })
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    volumeSeries.setData(volume)

    chart.timeScale().fitContent()

    // Only detach if this chart is still live — the chart's own cleanup runs
    // first and disposes its series with it, and removeSeries on a removed
    // chart throws.
    return () => {
      if (chartRef.current !== chart) return
      chart.removeSeries(candleSeries)
      chart.removeSeries(volumeSeries)
    }
  }, [ready, candles, volume, chartRef])

  return <div ref={containerRef} className="chart-canvas" />
}
