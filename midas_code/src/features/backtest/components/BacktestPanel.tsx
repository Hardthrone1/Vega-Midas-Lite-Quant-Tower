// src/features/backtest/components/BacktestPanel.tsx
import { useMemo, useState, type CSSProperties } from 'react'
import { Card, Button, Empty, MetricCard, type Status } from '../../../shared/ui'
import { useStrategyStore } from '../../../store/useStrategyStore'
import { BladeHeaderActions } from '../../../app/layout/BladeHeaderSlot'
import {
  loadBacktestArtifact,
  loadDivergenceReport,
  toBacktestResult,
  toParityResult,
} from '../../../shared/adapters/parityReportAdapter'

export function BacktestPanel() {
  const { backtestResult, setBacktestResult, setParityResult, addAgentMessage } = useStrategyStore()
  const [loading, setLoading] = useState(false)

  // Loads the real parity-run artifacts (Python backtest of the Pine strategy
  // plus the Pine-vs-Python divergence report) synced from the repo root.
  const runBacktest = async () => {
    setLoading(true)
    try {
      const [payload, report] = await Promise.all([
        loadBacktestArtifact(),
        loadDivergenceReport(),
      ])
      if (!payload) {
        addAgentMessage({ agent: 'Backtest', level: 'error', message: 'backtest_payload.json not found — run pine_sweep_backtest.py and sync-parity-data' })
        return
      }
      setBacktestResult(toBacktestResult(payload))
      addAgentMessage({ agent: 'Backtest', level: 'success', message: `Loaded ${payload.instrument} parity run — ${payload.trades.length} trades (${payload.bars_csv_path})` })
      if (report) {
        const parity = toParityResult(report)
        setParityResult(parity)
        const s = report.summary
        addAgentMessage({
          agent: 'Parity',
          level: parity.passed ? 'success' : 'warn',
          message: `Parity ${s.overall_status}: ${s.pass_count}/${s.matched_trades} matched trades pass, ${parity.mismatchCount} mismatch(es)`,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const points = useMemo(() => {
    const c = backtestResult.equityCurve
    if (!c.length) return ''
    const vals = c.map((p) => p.equity as number)
    const min = Math.min(...vals), max = Math.max(...vals)
    const span = max - min || 1
    return c.map((p, i) => {
      const x = (i / (c.length - 1)) * 100
      const y = 100 - ((p.equity as number - min) / span) * 100
      return `${x.toFixed(2)},${y.toFixed(2)}`
    }).join(' ')
  }, [backtestResult.equityCurve])

  const m = backtestResult.metrics
  const has = backtestResult.equityCurve.length > 0

  const metricCards: Array<{ label: string; value: string; status: Status; hint?: string }> = [
    { label: 'Net P&L', value: `$${m.netProfit}`, status: (m.netProfit as number) >= 0 ? 'ok' : 'err' },
    { label: 'Win rate', value: `${m.winRate}%`, status: 'info' },
    { label: 'Profit factor', value: m.profitFactor == null ? '—' : String(m.profitFactor), status: (m.profitFactor as number) >= 1.5 ? 'ok' : 'warn', hint: 'gate ≥ 1.5' },
    { label: 'Expectancy', value: m.expectancy == null ? '—' : `${m.expectancy}R`, status: 'info' },
    { label: 'Max DD', value: `$${m.maxDrawdown}`, status: 'err' },
    { label: 'Trades', value: String(m.trades), status: 'idle' },
  ]

  return (
    <section className="backtest-panel">
      <BladeHeaderActions>
        <Button variant="primary" onClick={runBacktest} disabled={loading}>{loading ? 'Loading…' : 'Load parity run'}</Button>
      </BladeHeaderActions>
      {!has ? (
        <Empty>No backtest loaded. Load the parity run to see the real equity<br />curve and edge metrics from the Python backtest.</Empty>
      ) : (
        <div className="col">
          <Card>
            <span className="eyebrow">Equity curve</span>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="spark">
              <polyline points={points} fill="none" stroke="var(--gold)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            </svg>
          </Card>
          <div className="metrics-grid">
            {metricCards.map((mc, i) => (
              <MetricCard
                key={mc.label}
                {...mc}
                className="stagger-item"
                style={{ '--stagger-i': i } as CSSProperties}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
