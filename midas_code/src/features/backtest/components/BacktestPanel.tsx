// src/features/backtest/components/BacktestPanel.tsx
import { useMemo } from 'react'
import { Panel, Card, Button, Empty } from '../../../shared/ui'
import { useStrategyStore } from '../../../store/useStrategyStore'

export function BacktestPanel() {
  const { backtestResult, canonicalSpec, setBacktestResult, addAgentMessage } = useStrategyStore()

  const runBacktest = () => {
    if (!canonicalSpec) return
    // Demo synthetic curve — replaced by the Python backtester payload in the full system.
    const curve: Array<Record<string, unknown>> = []
    let equity = canonicalSpec.properties.initialCapital
    const trades: Array<Record<string, unknown>> = []
    for (let i = 0; i < 60; i++) {
      const pnl = (Math.sin(i / 5) + (i % 7 === 0 ? -1.4 : 0.6)) * 18
      equity += pnl
      curve.push({ i, equity: Math.round(equity) })
      if (i % 3 === 0) trades.push({ i, pnl: Math.round(pnl) })
    }
    const wins = trades.filter((t) => (t.pnl as number) > 0).length
    setBacktestResult({
      trades,
      equityCurve: curve,
      metrics: {
        netProfit: Math.round(equity - canonicalSpec.properties.initialCapital),
        winRate: +(wins / trades.length * 100).toFixed(1),
        profitFactor: 1.74,
        expectancy: 0.42,
        maxDrawdown: -312,
        trades: trades.length,
      },
    })
    addAgentMessage({ agent: 'Backtest', level: 'success', message: `Backtest complete — ${trades.length} trades` })
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

  return (
    <Panel eyebrow="Step 04" title="Backtest preview" actions={
      <Button variant="primary" onClick={runBacktest} disabled={!canonicalSpec}>Run backtest</Button>
    }>
      {!has ? (
        <Empty>No backtest yet. Run one to preview the equity curve and<br />edge metrics before the live-readiness gate.</Empty>
      ) : (
        <div className="col">
          <Card>
            <span className="eyebrow">Equity curve</span>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="spark">
              <polyline points={points} fill="none" stroke="var(--gold)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            </svg>
          </Card>
          <div className="metrics-grid">
            <Metric label="Net P&L" value={`$${m.netProfit}`} good={(m.netProfit as number) >= 0} />
            <Metric label="Win rate" value={`${m.winRate}%`} />
            <Metric label="Profit factor" value={String(m.profitFactor)} good={(m.profitFactor as number) >= 1.5} />
            <Metric label="Expectancy" value={`${m.expectancy}R`} />
            <Metric label="Max DD" value={`$${m.maxDrawdown}`} good={false} />
            <Metric label="Trades" value={String(m.trades)} />
          </div>
        </div>
      )}
    </Panel>
  )
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className={`metric-value mono ${good === true ? 'pos' : good === false ? 'neg' : ''}`}>{value}</span>
    </div>
  )
}
