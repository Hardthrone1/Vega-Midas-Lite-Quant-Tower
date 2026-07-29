// src/shared/chart/ChartOverlay.tsx
// The full-screen chart. Mounted once by the shell so both Replay and Backtest
// open the same surface, with a source switch between the instrument's bars and
// the parity run's equity — the two never share a timeline, so they stay
// separate views rather than one overlaid plot.
import { useEffect, useMemo } from 'react'
import { useStrategyStore } from '../../store/useStrategyStore'
import { makeReplayBars } from '../../features/replay/lib/replayBars'
import { aggregateBars, CandleChart } from './CandleChart'
import { EquityChart } from './EquityChart'

const TIMEFRAMES = [1, 5, 15, 60]
const tfLabel = (m: number) => (m === 60 ? '1h' : `${m}m`)

export function ChartOverlay() {
  const overlay = useStrategyStore((s) => s.chartOverlay)
  const closeChart = useStrategyStore((s) => s.closeChartOverlay)
  const setChartSource = useStrategyStore((s) => s.setChartSource)
  const setChartTimeframe = useStrategyStore((s) => s.setChartTimeframe)
  const symbol = useStrategyStore((s) => s.symbol)
  const timeframe = useStrategyStore((s) => s.timeframe)
  const equityCurve = useStrategyStore((s) => s.backtestResult.equityCurve)
  const metrics = useStrategyStore((s) => s.backtestResult.metrics)

  const open = overlay !== null

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeChart() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeChart])

  const baseBars = useMemo(() => makeReplayBars(symbol, timeframe), [symbol, timeframe])
  const bars = useMemo(
    () => (overlay ? aggregateBars(baseBars, overlay.timeframe) : []),
    [baseBars, overlay]
  )

  if (!overlay) return null

  const onBars = overlay.source === 'bars'
  const hasEquity = equityCurve.length > 0

  return (
    <div className="chart-overlay" role="dialog" aria-modal="true" aria-label="Full-screen chart">
      <header className="chart-overlay-head">
        <span className="chart-overlay-title">
          {onBars ? `${symbol} · ${timeframe}` : `${symbol} · parity run`}
        </span>

        <div className="chart-seg">
          <button
            type="button"
            className={`chart-seg-btn${onBars ? ' is-on' : ''}`}
            onClick={() => setChartSource('bars')}
          >
            {symbol} bars
          </button>
          <button
            type="button"
            className={`chart-seg-btn${!onBars ? ' is-on' : ''}`}
            onClick={() => setChartSource('parity')}
          >
            Parity run
          </button>
        </div>

        {onBars && (
          <div className="chart-seg chart-seg--tf">
            {TIMEFRAMES.map((m) => (
              <button
                key={m}
                type="button"
                className={`chart-seg-btn${overlay.timeframe === m ? ' is-on' : ''}`}
                onClick={() => setChartTimeframe(m)}
              >
                {tfLabel(m)}
              </button>
            ))}
          </div>
        )}

        <span className="chart-overlay-sub">
          {onBars
            ? `${bars.length} bars · replay scenario series`
            : hasEquity
              ? `${metrics.trades ?? 0} trades · net $${metrics.netProfit ?? 0}`
              : 'no parity run loaded'}
        </span>

        <div className="chart-legend">
          {onBars ? (
            <>
              <span className="chart-legend-item"><i className="chart-swatch chart-swatch--up" />Up</span>
              <span className="chart-legend-item"><i className="chart-swatch chart-swatch--down" />Down</span>
              <span className="chart-legend-item"><i className="chart-swatch chart-swatch--vol" />Volume</span>
            </>
          ) : (
            <span className="chart-legend-item"><i className="chart-swatch chart-swatch--eq" />Equity</span>
          )}
        </div>

        <span className="chart-overlay-spacer" />
        <button type="button" className="chart-close" onClick={closeChart}>
          Close · Esc
        </button>
      </header>

      <div className="chart-overlay-body">
        {onBars ? (
          <CandleChart bars={bars} />
        ) : hasEquity ? (
          <EquityChart curve={equityCurve} />
        ) : (
          <div className="chart-overlay-empty">
            Load the parity run on the Backtest stage to plot its equity curve.
          </div>
        )}
      </div>

      <footer className="chart-overlay-foot">
        <span>
          {onBars
            ? 'Blue = close above open · red = below · volume along the base'
            : 'Equity after each closed trade, against starting capital'}
        </span>
        <span className="chart-overlay-spacer" />
        <span>Scroll to zoom · drag to pan · double-click to reset</span>
      </footer>
    </div>
  )
}
