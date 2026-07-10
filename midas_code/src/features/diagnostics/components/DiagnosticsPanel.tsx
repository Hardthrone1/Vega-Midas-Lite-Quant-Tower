// src/features/diagnostics/components/DiagnosticsPanel.tsx
import { Card, Badge, Button, StatusDot } from '../../../shared/ui'
import { useStrategyStore } from '../../../store/useStrategyStore'
import { BladeHeaderActions } from '../../../app/layout/BladeHeaderSlot'
import { deployLabel, deployStatusKind, deployProgress, DEPLOY_PIPELINE } from '../../../shared/deployStatus'
import { loadDivergenceReport, toParityResult } from '../../../shared/adapters/parityReportAdapter'

export function DiagnosticsPanel() {
  const {
    deployStatus, deployBlockers, lintResult, parityResult, riskResult,
    canonicalSpec, setLintResult, setParityResult, setRiskResult, addAgentMessage,
  } = useStrategyStore()

  // Parity comes from the real divergence report; lint and risk remain demo
  // values until their pipeline stages exist.
  const runChecks = async () => {
    if (!canonicalSpec) return
    setLintResult({ passed: true, violations: [], warnings: ['No session filter on intrabar mode'] })
    setRiskResult({ score: 84, var: 0.021, kelly: 0.18, sharpe: 1.32, drawdown: 0.094 })
    addAgentMessage({ agent: 'Lint', level: 'success', message: 'Lint passed (1 warning) [demo]' })
    addAgentMessage({ agent: 'Risk', level: 'success', message: 'Risk score 84 — above threshold [demo]' })
    const report = await loadDivergenceReport()
    if (!report) {
      addAgentMessage({ agent: 'Parity', level: 'error', message: 'divergence_report.json not found — run parity_validator.py and sync-parity-data' })
      return
    }
    const parity = toParityResult(report)
    setParityResult(parity)
    const s = report.summary
    addAgentMessage({
      agent: 'Parity',
      level: parity.passed ? 'success' : 'warn',
      message: `Parity ${s.overall_status}: ${s.pass_count}/${s.matched_trades} matched trades pass, ${s.fail_count} divergent, ${s.unmatched_python + s.unmatched_pine} unmatched`,
    })
  }

  const kind = deployStatusKind(deployStatus)
  const pct = Math.round(deployProgress(deployStatus) * 100)

  return (
    <section className="diagnostics-panel">
      <BladeHeaderActions>
        <Button variant="primary" onClick={runChecks} disabled={!canonicalSpec}>Run checks</Button>
      </BladeHeaderActions>
      <div className="col">
        {/* Deploy gate */}
        <Card>
          <div className="spread">
            <span className="eyebrow">Deploy gate</span>
            <Badge status={kind}>{deployLabel(deployStatus)}</Badge>
          </div>
          <div className="gate-track">
            <div className="gate-fill" style={{ width: `${pct}%`, background: kind === 'err' ? 'var(--err)' : 'var(--gold)' }} />
          </div>
          <div className="gate-steps">
            {DEPLOY_PIPELINE.map((s) => {
              const reached = deployProgress(deployStatus) >= deployProgress(s) && deployStatus !== 'deploy_blocked'
              return <span key={s} className={`gate-step ${reached ? 'on' : ''}`} title={deployLabel(s)} />
            })}
          </div>
          {deployBlockers.length > 0 && (
            <div className="blockers">
              {deployBlockers.map((b, i) => <div key={i} className="blocker"><StatusDot status="err" /> {b}</div>)}
            </div>
          )}
        </Card>

        {/* Check sections */}
        <div className="grid-2">
          <Card>
            <div className="spread"><span className="eyebrow">Signal integrity</span>
              <Badge status={lintResult.passed ? 'ok' : 'idle'}>{lintResult.passed ? 'pass' : 'pending'}</Badge></div>
            <div className="checklist mono">
              <div>repaint guard</div><div>lookahead guard</div><div>bar-close confirm</div>
            </div>
            {lintResult.warnings.map((w, i) => <div key={i} className="sub warn-text">⚠ {w}</div>)}
            {lintResult.violations.map((v, i) => <div key={i} className="sub err-text">✕ {v}</div>)}
          </Card>
          <Card>
            <div className="spread"><span className="eyebrow">Parity health</span>
              <Badge status={parityResult.passed ? 'ok' : parityResult.mismatchCount > 0 ? 'err' : 'idle'}>
                {parityResult.passed ? 'aligned' : parityResult.mismatchCount > 0 ? 'mismatch' : 'pending'}</Badge></div>
            <div className="mono big">{parityResult.mismatchCount}</div>
            <div className="sub">Pine vs Python mismatches</div>
          </Card>
        </div>

        {/* Risk scorecard */}
        <Card>
          <div className="spread"><span className="eyebrow live-text status-live">Live-readiness</span>
            <Badge status={riskResult.score >= 80 ? 'ok' : riskResult.score > 0 ? 'warn' : 'idle'}>score {riskResult.score}</Badge></div>
          <div className="kv mono">
            <div><span>VaR</span>{fmtPct(riskResult.var)}</div>
            <div><span>Kelly</span>{fmtNum(riskResult.kelly)}</div>
            <div><span>Sharpe</span>{fmtNum(riskResult.sharpe)}</div>
            <div><span>max DD</span>{fmtPct(riskResult.drawdown)}</div>
          </div>
        </Card>
      </div>
    </section>
  )
}

const fmtNum = (n: number | null) => (n == null ? '—' : n.toFixed(2))
const fmtPct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`)
