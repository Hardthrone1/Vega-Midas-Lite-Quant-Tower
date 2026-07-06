// src/app/layout/TopStatusBar.tsx
import { lazy, Suspense, useState } from 'react'
import { Badge, StatusDot } from '../../shared/ui'
import { useStrategyStore } from '../../store/useStrategyStore'
import { deployLabel, deployStatusKind } from '../../shared/deployStatus'

const AgentConsole = lazy(() =>
  import('../../features/agent-console/components/AgentConsole').then((m) => ({
    default: m.AgentConsole,
  }))
)

export function TopStatusBar() {
  const { symbol, session, executionMode, strategyId, deployStatus } = useStrategyStore()
  const kind = deployStatusKind(deployStatus)
  const [consoleOpen, setConsoleOpen] = useState(false)
  const deployText = deployLabel(deployStatus)

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <h1 className="topbar-heading">
          <span className="brand-mark" aria-hidden>◆</span>
          <span className="brand-name">VEGA</span>
          <span className="brand-sub mono">control tower</span>
        </h1>
      </div>

      <div className="topbar-context mono" aria-label="Trading context">
        <ContextItem label="symbol" value={symbol} />
        <ContextItem label="session" value={session} />
        <ContextItem label="mode" value={executionMode} />
        <ContextItem label="strategy" value={strategyId ? strategyId.slice(0, 14) : '—'} />
      </div>

      <div className="topbar-status">
        <Badge status={kind}>
          <StatusDot status={kind} pulse={kind !== 'idle' && kind !== 'err'} />
          {deployText}
        </Badge>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          Deploy status: {deployText}
        </p>
        <button
          type="button"
          className={`ac-topbar-btn${consoleOpen ? ' ac-topbar-btn--open' : ''}`}
          onClick={() => setConsoleOpen((o) => !o)}
          aria-expanded={consoleOpen}
          aria-controls="agent-console-panel"
          aria-label={consoleOpen ? 'Close Agent Console' : 'Open Agent Console'}
        >
          {consoleOpen ? '✕' : '◆'} Agent
        </button>
      </div>

      {consoleOpen && (
        <Suspense fallback={null}>
          <AgentConsole open={consoleOpen} onClose={() => setConsoleOpen(false)} />
        </Suspense>
      )}
    </header>
  )
}

function ContextItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="ctx-item">
      <span className="ctx-label">{label}</span>
      <span className="ctx-value">{value}</span>
    </div>
  )
}