// src/shared/chart/useLightweightChart.ts
//
// Chart lifecycle shared by every lightweight-charts surface: creation with the
// VEGA dark theme, throttled resize, and the two resize triggers that matter
// here — a ResizeObserver on the container (tab switches, layout changes) and
// fullscreenchange (the overlay).
import { useEffect, useRef, useState } from 'react'
import { createChart, CrosshairMode, type IChartApi } from 'lightweight-charts'

const AXIS = 'rgba(139, 148, 166, 0.22)'
const GRID = 'rgba(139, 148, 166, 0.08)'

export function useLightweightChart(onReady?: (chart: IChartApi) => void) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const readyRef = useRef(onReady)
  readyRef.current = onReady
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el || chartRef.current) return

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { color: 'transparent' },
        textColor: '#8b94a6',
        fontFamily: 'Archivo, system-ui, sans-serif',
      },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: AXIS },
      timeScale: { borderColor: AXIS, timeVisible: true, secondsVisible: false },
      handleScroll: true,
      handleScale: true,
    })
    chartRef.current = chart
    setReady(true)
    readyRef.current?.(chart)

    let timer: ReturnType<typeof setTimeout>
    const resize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (!containerRef.current || !chartRef.current) return
        chartRef.current.resize(containerRef.current.clientWidth, containerRef.current.clientHeight)
      }, 50)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(el)
    window.addEventListener('resize', resize)
    document.addEventListener('fullscreenchange', resize)

    return () => {
      clearTimeout(timer)
      observer.disconnect()
      window.removeEventListener('resize', resize)
      document.removeEventListener('fullscreenchange', resize)
      chart.remove()
      chartRef.current = null
      setReady(false)
    }
  }, [])

  return { containerRef, chartRef, ready }
}
