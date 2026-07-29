// src/features/backtest/components/BacktestPanel.tsx
//
// The parity run's results. Everything here except the v2 comparison is derived
// from the real Python backtest artifact: the equity curve, per-session P&L,
// how trades ended, and the long/short split all come from the same trades the
// divergence report checks.
import { useMemo, useState, type CSSProperties } from 'react'
import { Card, Button, Empty, MetricCard, type Status } from '../../../shared/ui'
import { StagePanelHeader } from '../../../shared/ui/StagePanelHeader'
import { useStrategyStore } from '../../../store/useStrategyStore'
import { BladeHeaderActions } from '../../../app/layout/BladeHeaderSlot'
import {
  loadBacktestArtifact,
  loadDivergenceReport,
  toBacktestResult,
  toParityResult,
} from '../../../shared/adapters/parityReportAdapter'

type Trade = {
  entry_signal?: string
  exit_reason?: string
  exit_dt?: string
  pnl_usd?: number
}

// v2 is an illustrative stored version — there is no second real artifact to
// diff against yet, so these figures are demo values, flagged as such in the UI.
const V2_COMPARE = [
  { k: 'Net P&L', b: '−$1,910', gate: '> $0' },
  { k: 'Win rate', b: '38.6%', gate: '—' },
  { k: 'Profit factor', b: '0.71', gate: '≥ 1.50' },
  { k: 'Expectancy', b: '−0.14R', gate: '> 0' },
  { k: 'Max drawdown', b: '−$2,240', gate: '—' },
  { k: 'Trades', b: '148', gate: '—' },
]

const money = (n: number) => `${n < 0 ? '−$' : '$'}${Math.abs(Math.round(n)).toLocaleString('en-US')}`

export function BacktestPanel() {
  const { backtestResult, setBacktestResult, setParityResult, addAgentMessage } = useStrategyStore()
  const openChartOverlay = useStrategyStore((s) => s.openChartOverlay)
  const [loading, setLoading] = useState(false)
  const [compare, setCompare] = useState(false)

  // Loads the real parity-run artifacts (Python backtest of the Pine strategy
  // plus the Pine-vs-Python divergence report) synced from the repo root.
  const runBacktest = async () => {
    setLoading(true)
    try {
      const [payload, report] = await Promise.all([loadBacktestArtifact(), loadDivergenceReport()])
      if (!payload) {
        addAgentMessage({
          agent: 'Backtest',
          level: 'error',
          message: 'backtest_payload.json not found — run pine_sweep_backtest.py and sync-parity-data',
        })
        return
      }
      setBacktestResult(toBacktestResult(payload))
      addAgentMessage({
        agent: 'Backtest',
        level: 'success',
        message: `Loaded ${payload.instrument} parity run — ${payload.trades.length} trades (${payload.bars_csv_path})`,
      })
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

  const trades = backtestResult.trades as Trade[]

  const points = useMemo(() => {
    const c = backtestResult.equityCurve
    if (!c.length) return ''
    const vals = c.map((p) => p.equity as number)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const span = max - min || 1
    return c
      .map((p, i) => {
        const x = (i / (c.length - 1)) * 100
        const y = 100 - (((p.equity as number) - min) / span) * 100
        return `${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')
  }, [backtestResult.equityCurve])

  // Where starting capital sits in the same 0–100 viewBox as the curve, so the
  // line above/below it reads as in profit / in drawdown.
  const baselineY = useMemo(() => {
    const c = backtestResult.equityCurve
    if (!c.length) return 50
    const vals = c.map((p) => p.equity as number)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const span = max - min || 1
    return 100 - ((vals[0] - min) / span) * 100
  }, [backtestResult.equityCurve])

  const daily = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const t of trades) {
      const day = (t.exit_dt ?? '').slice(0, 10)
      if (!day) continue
      byDay.set(day, (byDay.get(day) ?? 0) + (t.pnl_usd ?? 0))
    }
    return [...byDay.entries()].map(([day, pnl]) => ({ day, pnl }))
  }, [trades])

  const dayMax = useMemo(() => Math.max(1, ...daily.map((d) => Math.abs(d.pnl))), [daily])

  const exits = useMemo(() => {
    const byReason = new Map<string, { n: number; pnl: number }>()
    for (const t of trades) {
      const key = (t.exit_reason ?? 'unknown').toUpperCase()
      const cur = byReason.get(key) ?? { n: 0, pnl: 0 }
      cur.n += 1
      cur.pnl += t.pnl_usd ?? 0
      byReason.set(key, cur)
    }
    const rows = [...byReason.entries()].map(([k, v]) => ({ k, ...v }))
    const peak = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)))
    return rows.sort((a, b) => b.n - a.n).map((r) => ({ ...r, pct: `${(Math.abs(r.pnl) / peak) * 100}%` }))
  }, [trades])

  const sides = useMemo(() => {
    const build = (match: (s: string) => boolean) => {
      const rows = trades.filter((t) => match((t.entry_signal ?? '').toLowerCase()))
      const wins = rows.filter((t) => (t.pnl_usd ?? 0) > 0).length
      return {
        n: rows.length,
        pnl: rows.reduce((sum, t) => sum + (t.pnl_usd ?? 0), 0),
        winRate: rows.length ? (wins / rows.length) * 100 : 0,
      }
    }
    return { long: build((s) => s.includes('long')), short: build((s) => s.includes('short')) }
  }, [trades])

  const m = backtestResult.metrics
  const has = backtestResult.equityCurve.length > 0

  const metricCards: Array<{ label: string; value: string; status: Status; hint?: string }> = [
    { label: 'Net P&L', value: `$${m.netProfit}`, status: (m.netProfit as number) >= 0 ? 'ok' : 'err' },
    { label: 'Win rate', value: `${m.winRate}%`, status: 'info' },
    {
      label: 'Profit factor',
      value: m.profitFactor == null ? '—' : String(m.profitFactor),
      status: (m.profitFactor as number) >= 1.5 ? 'ok' : 'warn',
      hint: 'gate ≥ 1.5',
    },
    { label: 'Expectancy', value: m.expectancy == null ? '—' : `${m.expectancy}R`, status: 'info' },
    { label: 'Max DD', value: `$${m.maxDrawdown}`, status: 'err' },
    { label: 'Trades', value: String(m.trades), status: 'idle' },
  ]

  return (
    <section className="backtest-panel">
      <BladeHeaderActions>
        <Button variant="primary" onClick={runBacktest} disabled={loading}>
          {loading ? 'Loading…' : 'Load parity run'}
        </Button>
      </BladeHeaderActions>

      <StagePanelHeader
        tab="backtest"
        meta={has ? `${m.trades} trades · ${daily.length} sessions · $50,000 start` : 'no run loaded'}
      />

      {!has ? (
        <Empty>
          No backtest loaded. Load the parity run to see the real equity
          <br />
          curve and edge metrics from the Python backtest.
        </Empty>
      ) : (
        <div className="col">
          <div className="metrics-grid">
            {metricCards.map((mc, i) => (
              <MetricCard key={mc.label} {...mc} className="stagger-item" style={{ '--stagger-i': i } as CSSProperties} />
            ))}
          </div>

          <Card>
            <div className="spread">
              <h3 className="diag-h3">Equity</h3>
              <div className="bt-equity-tools">
                <span className="sub">Blue above the starting line · red below it</span>
                <button
                  type="button"
                  className="blade-icon-btn"
                  onClick={() => openChartOverlay({ source: 'parity' })}
                  title="Open the full-screen chart"
                  aria-label="Open the full-screen chart"
                >
                  ⛶
                </button>
              </div>
            </div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="spark bt-equity">
              <defs>
                <clipPath id="bt-above"><rect x="0" y="0" width="100" height={baselineY} /></clipPath>
                <clipPath id="bt-below"><rect x="0" y={baselineY} width="100" height={100 - baselineY} /></clipPath>
              </defs>
              <line
                x1="0" y1={baselineY} x2="100" y2={baselineY}
                stroke="#5d6675" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke"
              />
              <polyline points={points} fill="none" stroke="var(--blue)" strokeWidth="2"
                vectorEffect="non-scaling-stroke" clipPath="url(#bt-above)" />
              <polyline points={points} fill="none" stroke="var(--err)" strokeWidth="2"
                vectorEffect="non-scaling-stroke" clipPath="url(#bt-below)" />
            </svg>
          </Card>

          <div className="bt-split">
            <Card>
              <h3 className="diag-h3">P&amp;L by session day</h3>
              <p className="sub diag-lede">Each column is one session's realised P&amp;L.</p>
              <div className="daily-chart">
                {daily.map((d) => (
                  <div key={d.day} className="daily-col" title={`${d.day} · ${money(d.pnl)}`}>
                    <div className="daily-up">
                      <span style={{ height: d.pnl > 0 ? `${(d.pnl / dayMax) * 100}%` : 0 }} />
                    </div>
                    <div className="daily-axis" />
                    <div className="daily-down">
                      <span style={{ height: d.pnl < 0 ? `${(-d.pnl / dayMax) * 100}%` : 0 }} />
                    </div>
                    <span className="daily-label">{d.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="diag-h3">How trades end</h3>
              <div className="exit-list">
                {exits.map((e) => (
                  <div key={e.k} className="exit-row">
                    <div className="exit-row-head">
                      <span className="exit-k">{e.k}</span>
                      <span className="exit-n">{e.n} trades</span>
                      <span className="rail-spacer" />
                      <span className="exit-pnl" style={{ color: e.pnl < 0 ? 'var(--err)' : 'var(--blue)' }}>
                        {money(e.pnl)}
                      </span>
                    </div>
                    <div className="exit-track">
                      <div
                        className="exit-fill"
                        style={{ width: e.pct, background: e.pnl < 0 ? 'var(--err)' : 'var(--blue)' }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="side-split">
                {([['Long', sides.long], ['Short', sides.short]] as const).map(([label, s]) => (
                  <div key={label} className="side-card">
                    <div className="side-k">{label} · {s.n}</div>
                    <div className="side-pnl" style={{ color: s.pnl < 0 ? 'var(--err)' : 'var(--blue)' }}>
                      {money(s.pnl)}
                    </div>
                    <div className="side-detail">{s.winRate.toFixed(1)}% win rate</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <div className="spread">
              <h3 className="diag-h3">This run vs. vault v2</h3>
              <Button onClick={() => setCompare((v) => !v)}>{compare ? 'Hide v2' : 'Compare with v2'}</Button>
            </div>
            {compare && (
              <>
                <p className="sub diag-lede">
                  v3 is the loaded parity artifact. v2 — the same spec with trailing stops off — is an illustrative
                  stored version, not a second real run.
                </p>
                <div className="cmp-table">
                  <div className="cmp-head">
                    <span>Metric</span>
                    <span>v3 — current</span>
                    <span>v2 — illustrative</span>
                    <span>Gate</span>
                  </div>
                  {V2_COMPARE.map((row, i) => (
                    <div key={row.k} className="cmp-row">
                      <span className="cmp-k">{row.k}</span>
                      <span className="cmp-a">{metricCards[i]?.value ?? '—'}</span>
                      <span className="cmp-b">{row.b}</span>
                      <span className="cmp-gate">{row.gate}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </section>
  )
}
