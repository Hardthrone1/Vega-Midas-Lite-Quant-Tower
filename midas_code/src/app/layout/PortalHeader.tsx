// src/app/layout/PortalHeader.tsx
// Command bar: identity, the run's context at a glance, the global check
// trigger, and the deploy verdict. Navigation lives in the spine below, so
// there is no rail toggle or breadcrumb here.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useStrategyStore } from '../../store/useStrategyStore'
import { deployLabel } from '../../shared/deployStatus'
import { CHECK_STEPS, runDiagnosticChecks, type CheckStep } from '../../features/diagnostics/lib/runChecks'

export function PortalHeader() {
  const symbol = useStrategyStore((s) => s.symbol)
  const timeframe = useStrategyStore((s) => s.timeframe)
  const session = useStrategyStore((s) => s.session)
  const executionMode = useStrategyStore((s) => s.executionMode)
  const strategyId = useStrategyStore((s) => s.strategyId)
  const deployStatus = useStrategyStore((s) => s.deployStatus)
  const canonicalSpec = useStrategyStore((s) => s.canonicalSpec)

  const [running, setRunning] = useState(false)
  const [step, setStep] = useState<CheckStep | null>(null)
  // Re-armed on mount, not just initialised: StrictMode runs the cleanup once
  // before the real mount, which would otherwise leave this false for good.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const runChecks = useCallback(async () => {
    if (running || !canonicalSpec) return
    setRunning(true)
    try {
      await runDiagnosticChecks((s) => { if (alive.current) setStep(s) })
    } finally {
      if (alive.current) {
        setRunning(false)
        setStep(null)
      }
    }
  }, [running, canonicalSpec])

  const stepIndex = step ? CHECK_STEPS.findIndex((s) => s.id === step) + 1 : 0
  const runLabel = running
    ? `${CHECK_STEPS[stepIndex - 1]?.label ?? 'Running'} ${stepIndex}/${CHECK_STEPS.length}…`
    : 'Run checks'

  const blocked = deployStatus === 'deploy_blocked'
  const ready = deployStatus === 'deploy_ready'
  const chipTone = blocked ? 'err' : ready ? 'ok' : 'idle'

  const context = [
    { k: 'symbol', v: symbol },
    { k: 'timeframe', v: timeframe },
    { k: 'session', v: session },
    { k: 'mode', v: executionMode },
    { k: 'strategy', v: strategyId ? strategyId.slice(0, 12) : '—' },
  ]

  return (
    <header className="portal-header">
      <span className="portal-header-brand">
        <span className="portal-brand-mark" aria-hidden>V</span>
        <span className="portal-brand-name">VEGA</span>
      </span>

      <div className="portal-header-context" aria-label="Trading context">
        {context.map((c) => (
          <div key={c.k} className="portal-ctx-item">
            <span className="portal-ctx-label">{c.k}</span>
            <span className="portal-ctx-value">{c.v}</span>
          </div>
        ))}
      </div>

      <span className="portal-header-spacer" />

      <button
        type="button"
        className={`portal-runchecks${running ? ' is-running' : ''}`}
        onClick={runChecks}
        disabled={running || !canonicalSpec}
        title={canonicalSpec ? 'Run the deploy-gate checks' : 'Draft a spec first'}
        aria-busy={running}
      >
        {runLabel}
      </button>

      <span className={`portal-verdict-chip portal-verdict-chip--${chipTone}`}>
        {blocked ? 'Blocked' : ready ? 'Ready' : deployLabel(deployStatus)}
      </span>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Deploy status: {deployLabel(deployStatus)}
      </p>

      <span className="portal-header-avatar-chip" aria-label="Vega Operator">VO</span>
    </header>
  )
}
