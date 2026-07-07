// src/features/diagnostics/components/DiagnosticsPanel.tsx
import { Panel, Card, Badge, Button, StatusDot } from '../../../shared/ui'
import { useStrategyStore } from '../../../store/useStrategyStore'
import { deployLabel, deployStatusKind, deployProgress, DEPLOY_PIPELINE } from '../../../shared/deployStatus'

export function DiagnosticsPanel() {
  const {
    deployStatus, deployBlockers, lintResult, parityResult, riskResult,
    canonicalSpec, setLintResult, setParityResult, setRiskResult, addAgentMessage,
  } = useStrategyStore()

  // Demo "run checks" — in the full system these come from the agent pipeline.
  const runChecks = () => {
    if (!canonicalSpec) return
    setLintResult({ passed: true, violations: [], warnings: ['No session filter on intrabar mode'] })
    setParityResult({ passed: true, mismatchCount: 0, mismatches: [] })
    setRiskResult({ score: 84, var: 0.021, kelly: 0.18, sharpe: 1.32, drawdown: 0.094 })
    addAgentMessage({ agent: 'Lint', level: 'success', message: 'Lint passed (1 warning)' })
    addAgentMessage({ agent: 'Parity', level: 'success', message: 'Pine/Python parity within tolerance' })
    addAgentMessage({ agent: 'Risk', level: 'success', message: 'Risk score 84 — above threshold' })
  }

  const kind = deployStatusKind(deployStatus)
  const pct = Math.round(deployProgress(deployStatus) * 100)

  return (
    <Panel>
      <header className="panel-header">
        <div className="panel-header-left">
          <span className="panel-step">Step 05</span>
          <h1 className="panel-title">Diagnostics & deploy gate</h1>
        </div>
        <div className="panel-header-right">
          <Button variant="primary" onClick={runChecks} disabled={!canonicalSpec}>Run checks</Button>
        </div>
      </header>
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
              <Badge status={parityResult.passed ? 'ok' : 'idle'}>{parityResult.passed ? 'aligned' : 'pending'}</Badge></div>
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
    </Panel>
  )
}

const fmtNum = (n: number | null) => (n == null ? '—' : n.toFixed(2))
const fmtPct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`)
