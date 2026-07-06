// src/features/replay/components/ReplayChart.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
} from 'lightweight-charts'
import { onReplayEvent, type ReplayEvent } from '../lib/replayEvents'
import { type ReplayBar } from '../hooks/useReplayScheduler'

type ReplayChartProps = {
  bars: ReplayBar[]
  currentBarIndex: number
  currentTickIndex: number
  status: 'idle' | 'playing' | 'paused' | 'stepping' | 'finished'
  mode: 'bar_close' | 'intrabar' | 'hybrid'
  className?: string
  onChartReady?: (chart: IChartApi) => void
  onEvent?: (event: ReplayEvent) => void
}

type ReplayMarker = {
  time: Time
  position: 'aboveBar' | 'belowBar'
  color: string
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown'
  text?: string
}

function toChartTime(t: number): Time {
  return Math.floor(t / 1000) as Time
}

function buildCandleData(bars: ReplayBar[], uptoIndex: number): CandlestickData<Time>[] {
  return bars.slice(0, uptoIndex + 1).map((bar) => ({
    time: toChartTime(bar.time),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  }))
}

function markerFromEvent(event: ReplayEvent): ReplayMarker | null {
  const time = event.payload.timestamp ? toChartTime(event.payload.timestamp) : null
  if (time == null) return null
  if (event.type === 'replay:entry') return { time, position: 'belowBar', color: '#2dd4a7', shape: 'arrowUp', text: event.payload.label ?? 'Entry' }
  if (event.type === 'replay:exit') return { time, position: 'aboveBar', color: '#f0506e', shape: 'arrowDown', text: event.payload.label ?? 'Exit' }
  if (event.type === 'replay:signal') return { time, position: 'aboveBar', color: '#6ea8fe', shape: 'circle', text: event.payload.label ?? 'Signal' }
  if (event.type === 'replay:alert') return { time, position: 'aboveBar', color: '#e39a5a', shape: 'square', text: event.payload.label ?? 'Alert' }
  return null
}

export function ReplayChart({
  bars,
  currentBarIndex,
  className,
  onChartReady,
  onEvent,
}: ReplayChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const markersRef = useRef<ReplayMarker[]>([])
  const [ready, setReady] = useState(false)

  const visibleData = useMemo(() => {
    if (!bars.length) return []
    return buildCandleData(bars, Math.max(0, currentBarIndex))
  }, [bars, currentBarIndex])

  useEffect(() => {
    if (!containerRef.current || chartRef.current) return
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: { background: { color: 'transparent' }, textColor: '#a7b0c0', fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: 'rgba(140,160,200,0.06)' }, horzLines: { color: 'rgba(140,160,200,0.07)' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(140,160,200,0.12)' },
      timeScale: { borderColor: 'rgba(140,160,200,0.12)', timeVisible: true, secondsVisible: false },
      handleScroll: true,
      handleScale: true,
    })
    const candle = chart.addCandlestickSeries({
      upColor: '#2dd4a7', downColor: '#f0506e',
      wickUpColor: '#2dd4a7', wickDownColor: '#f0506e',
      borderVisible: false,
    })
    chartRef.current = chart
    candleRef.current = candle
    setReady(true)
    onChartReady?.(chart)

    // Throttled resize handler
    let resizeTimeout: ReturnType<typeof setTimeout>
    const resize = () => {
      if (!containerRef.current || !chartRef.current) return
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        if (!containerRef.current || !chartRef.current) return
        chartRef.current.resize(containerRef.current.clientWidth, containerRef.current.clientHeight)
      }, 50)
    }

    // ResizeObserver detects tab switches and parent layout changes
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(containerRef.current)

    window.addEventListener('resize', resize)
    return () => {
      clearTimeout(resizeTimeout)
      resizeObserver.disconnect()
      window.removeEventListener('resize', resize)
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      setReady(false)
    }
  }, [onChartReady])

  useEffect(() => {
    if (!ready || !candleRef.current) return
    candleRef.current.setData(visibleData)
  }, [ready, visibleData])

  useEffect(() => {
    if (!ready || !chartRef.current || !bars.length) return
    if (currentBarIndex >= bars.length - 1) chartRef.current.timeScale().scrollToRealTime()
    else chartRef.current.timeScale().fitContent()
  }, [bars.length, currentBarIndex, ready])

  useEffect(() => {
    const unsubscribers = [
      onReplayEvent('replay:signal', (event) => { onEvent?.(event); const m = markerFromEvent(event); if (!m || !candleRef.current) return; markersRef.current = [...markersRef.current, m]; candleRef.current.setMarkers(markersRef.current) }),
      onReplayEvent('replay:entry',  (event) => { onEvent?.(event); const m = markerFromEvent(event); if (!m || !candleRef.current) return; markersRef.current = [...markersRef.current, m]; candleRef.current.setMarkers(markersRef.current) }),
      onReplayEvent('replay:exit',   (event) => { onEvent?.(event); const m = markerFromEvent(event); if (!m || !candleRef.current) return; markersRef.current = [...markersRef.current, m]; candleRef.current.setMarkers(markersRef.current) }),
      onReplayEvent('replay:alert',  (event) => { onEvent?.(event); const m = markerFromEvent(event); if (!m || !candleRef.current) return; markersRef.current = [...markersRef.current, m]; candleRef.current.setMarkers(markersRef.current) }),
      onReplayEvent('replay:reset',  (event) => { onEvent?.(event); markersRef.current = []; candleRef.current?.setMarkers([]); candleRef.current?.setData([]) }),
    ]
    return () => { unsubscribers.forEach((u) => u()) }
  }, [onEvent])

  // Resize when fullscreen changes
  useEffect(() => {
    const onFsChange = () => {
      requestAnimationFrame(() => {
        if (!containerRef.current || !chartRef.current) return
        chartRef.current.resize(containerRef.current.clientWidth, containerRef.current.clientHeight)
      })
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  return (
    <div ref={containerRef} className={className ?? 'replay-chart-canvas'} style={{ width: '100%', height: '100%' }} />
  )
}
