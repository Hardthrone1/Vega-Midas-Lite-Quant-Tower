// src/features/diagnostics/components/DiagnosticsPanel.tsx
//
// The deploy gate. Parity is the headline: one cell per Pine trade in execution
// order, so a single unmatched trade reads as a position in the run rather than
// a count. Parity comes from the real divergence report; lint and risk remain
// demo values until their pipeline stages exist.
//
// The checks themselves are triggered from the header (see
// features/diagnostics/lib/runChecks.ts) — this stage displays their result.
import { useEffect, useState } from 'react'
import { Card, Badge, StatusDot } from '../../../shared/ui'
import { StagePanelHeader } from '../../../shared/ui/StagePanelHeader'
import { useStrategyStore } from '../../../store/useStrategyStore'
import { deployLabel, deployProgress, DEPLOY_PIPELINE } from '../../../shared/deployStatus'
import { loadDivergenceReport, toParityCells, type ParityCell } from '../../../shared/adapters/parityReportAdapter'
import { loadMarketSnapshot, type MarketSnapshot } from '../../../shared/adapters/marketDataAdapter'

const GATES = [
  'Draft', 'Spec ready', 'Pine generated', 'Lint passed',
  'Parity checked', 'Backtested', 'Risk scored', 'Deploy ready',
]

/** Parity is the gate that holds this run — index into GATES. */
const FAIL_GATE = 4

export function DiagnosticsPanel() {
  const { deployStatus, deployBlockers, lintResult, parityResult, riskResult } = useStrategyStore()
  const [cells, setCells] = useState<ParityCell[]>([])
  const [market, setMarket] = useState<MarketSnapshot | null>(null)

  // The grid needs per-trade detail the store's ParityResult doesn't carry, so
  // it reads the report directly — the same file the checks fetch.
  useEffect(() => {
    let alive = true
    void loadDivergenceReport().then((r) => {
      if (alive && r) setCells(toParityCells(r))
    })
    return () => { alive = false }
  }, [parityResult])

  // Alpha Vantage cache — informational only, refreshed by the gateway at
  // most once a day. Never gates the deploy checks.
  useEffect(() => {
    let alive = true
    void loadMarketSnapshot().then((snap) => { if (alive) setMarket(snap) })
    return () => { alive = false }
  }, [])

  const progress = deployProgress(deployStatus)
  const blocked = deployStatus === 'deploy_blocked'
  const unmatched = cells.filter((c) => c.state !== 'matched')
  const reconciled = cells.length - unmatched.length

  return (
    <section className="diagnostics-panel">
      <StagePanelHeader
        tab="diagnostics"
        meta={<>Deploy gate · signal integrity · parity · risk<br />{deployLabel(deployStatus)}</>}
      />

      <div className="col">
        <div className="gate-grid">
          {GATES.map((label, i) => {
            // A gate machine only reaches the failing step by clearing the ones
            // before it, so a block reads as "cleared up to here, then failed".
            const failed = blocked && i === FAIL_GATE
            const reached = blocked ? i < FAIL_GATE : progress >= deployProgress(DEPLOY_PIPELINE[i])
            return (
              <div
                key={label}
                className={`gate-card${failed ? ' gate-card--failed' : reached ? ' gate-card--cleared' : ''}`}
              >
                <span className="gate-card-n">0{i + 1}</span>
                <span className="gate-card-label">{label}</span>
                <span className="gate-card-state">{failed ? 'Failed' : reached ? 'Cleared' : 'Held'}</span>
              </div>
            )
          })}
        </div>

        {deployBlockers.length > 0 && (
          <div className="blockers">
            {deployBlockers.map((b, i) => (
              <div key={i} className="blocker"><StatusDot status="err" /> {b}</div>
            ))}
          </div>
        )}

        <div className="diag-split">
          <Card>
            <div className="spread">
              <h3 className="diag-h3">Pine ↔ Python parity</h3>
              <Badge status={parityResult.passed ? 'ok' : parityResult.mismatchCount > 0 ? 'err' : 'idle'}>
                {parityResult.passed ? 'Pass' : parityResult.mismatchCount > 0 ? 'Fail' : 'Pending'}
              </Badge>
            </div>
            <p className="sub diag-lede">
              Every square is one Pine trade in execution order. Filled means Python produced the same trade.
            </p>

            {cells.length === 0 ? (
              <p className="sub">Run the checks to load the divergence report.</p>
            ) : (
              <>
                <div className="parity-grid">
                  {cells.map((c) => (
                    <span key={c.num} title={c.label} className={`parity-cell parity-cell--${c.state}`} />
                  ))}
                </div>

                <div className="parity-stats">
                  <ParityStat v={cells.length} k="Pine trades" />
                  <ParityStat v={reconciled} k="Reconciled" tone="blue" />
                  <ParityStat v={unmatched.length} k="Unmatched" tone={unmatched.length ? 'red' : 'blue'} />
                  <ParityStat
                    v={parityResult.mismatchCount}
                    k="Mismatches"
                    tone={parityResult.mismatchCount ? 'red' : 'blue'}
                  />
                </div>

                {unmatched.length > 0 && (
                  <div className="parity-callout">
                    <div className="parity-callout-head">
                      Unmatched — Pine trade {unmatched.map((u) => u.num).join(', ')}
                    </div>
                    <div className="parity-callout-body">
                      {unmatched[0].label}. Everything either side of it reconciles, which points at entry-offset
                      rounding rather than the signal itself.
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>

          <div className="col">
            <Card>
              <div className="spread">
                <h3 className="diag-h3">Signal integrity</h3>
                <Badge status={lintResult.passed ? 'ok' : 'idle'}>{lintResult.passed ? 'pass' : 'pending'}</Badge>
              </div>
              <div className="integrity-list">
                <IntegrityRow label="Repaint guard" ok={lintResult.passed} />
                <IntegrityRow label="Lookahead guard" ok={lintResult.passed} />
                <IntegrityRow label="Bar-close confirm" ok={lintResult.passed} />
                {lintResult.warnings.map((w, i) => (
                  <IntegrityRow key={i} label={w} ok={false} state="Warning" />
                ))}
                {lintResult.violations.map((v, i) => (
                  <IntegrityRow key={`v${i}`} label={v} ok={false} state="Failed" tone="err" />
                ))}
              </div>
            </Card>

            <Card>
              <div className="spread">
                <h3 className="diag-h3">Risk</h3>
                <span className="risk-score" style={{ color: riskResult.score >= 80 ? 'var(--blue)' : 'var(--warn)' }}>
                  {riskResult.score}
                  <span className="risk-score-max">/100</span>
                </span>
              </div>
              <div className="risk-track">
                <div className="risk-fill" style={{ width: `${Math.max(0, Math.min(100, riskResult.score))}%` }} />
              </div>
              <div className="kv mono">
                <div><span>VaR</span>{fmtPct(riskResult.var)}</div>
                <div><span>Kelly</span>{fmtNum(riskResult.kelly)}</div>
                <div><span>Sharpe</span>{fmtNum(riskResult.sharpe)}</div>
                <div><span>max DD</span>{fmtPct(riskResult.drawdown)}</div>
              </div>
            </Card>

            <Card>
              <div className="spread">
                <h3 className="diag-h3">Macro &amp; third opinion</h3>
                <Badge status={market ? 'ok' : 'idle'}>Alpha Vantage</Badge>
              </div>
              <p className="sub diag-lede">
                Independent daily read — cached, refreshed once a day. Not part of the deploy gate.
              </p>
              {!market ? (
                <p className="sub">Loading cached market data…</p>
              ) : (
                <div className="kv mono">
                  <div><span>Gold (XAUUSD)</span>{fmtGold(market.gold?.close, market.goldPrevClose)}</div>
                  <div><span>10Y yield</span>{fmtUnit(market.treasuryYield10y?.value, '%')}</div>
                  <div><span>CPI</span>{fmtNum(market.cpi?.value ?? null)}</div>
                  <div><span>EUR/USD</span>{fmtNum(market.fxEurUsd?.value ?? null)}</div>
                  <div><span>GLD RSI(14)</span>{fmtNum(market.gldRsi?.value ?? null)}</div>
                  <div><span>GLD ATR(14)</span>{fmtNum(market.gldAtr?.value ?? null)}</div>
                  <div><span>GLD ADX(14)</span>{fmtNum(market.gldAdx?.value ?? null)}</div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}

function ParityStat({ v, k, tone }: { v: number; k: string; tone?: 'blue' | 'red' }) {
  const color = tone === 'red' ? 'var(--err)' : tone === 'blue' ? 'var(--blue)' : '#fff'
  return (
    <div className="parity-stat">
      <span className="parity-stat-v" style={{ color }}>{v}</span>
      <span className="parity-stat-k">{k}</span>
    </div>
  )
}

function IntegrityRow({ label, ok, state, tone }: { label: string; ok: boolean; state?: string; tone?: 'err' }) {
  const color = tone === 'err' ? 'var(--err)' : ok ? 'var(--blue)' : 'var(--warn)'
  return (
    <div className="integrity-row">
      <span
        className="integrity-mark"
        style={{ background: ok ? color : 'transparent', boxShadow: `inset 0 0 0 2px ${color}` }}
      />
      <span className="integrity-label">{label}</span>
      <span className="integrity-state" style={{ color }}>{state ?? (ok ? 'Pass' : 'Pending')}</span>
    </div>
  )
}

const fmtNum = (n: number | null) => (n == null ? '—' : n.toFixed(2))
const fmtPct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`)
const fmtUnit = (n: number | null | undefined, unit: string) => (n == null ? '—' : `${n.toFixed(2)}${unit}`)
const fmtGold = (close: number | null | undefined, prevClose: number | null) => {
  if (close == null) return '—'
  if (prevClose == null) return `$${close.toFixed(2)}`
  const chg = ((close - prevClose) / prevClose) * 100
  return `$${close.toFixed(2)} (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%)`
}
