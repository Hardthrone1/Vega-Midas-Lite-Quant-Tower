// src/features/canonical-spec/components/CanonicalSpecPanel.tsx
import { useMemo, useState } from 'react'
import { Card, Button, Badge, Empty } from '../../../shared/ui'
import { useStrategyStore } from '../../../store/useStrategyStore'

export function CanonicalSpecPanel() {
  const {
    canonicalSpec, specValidation, propertyValidation,
    regeneratePythonPayload, pythonPayload, addAgentMessage,
  } = useStrategyStore()
  const [view, setView] = useState<'summary' | 'json'>('summary')

  const json = useMemo(
    () => (canonicalSpec ? JSON.stringify(canonicalSpec, null, 2) : ''),
    [canonicalSpec]
  )

  if (!canonicalSpec) {
    return (
      <section className="canonical-spec-panel">
        <header className="flex items-center justify-between gap-4 px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
          <div className="flex items-baseline gap-2 flex-1 min-w-0">
            <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Step 02</span>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">Canonical spec</h1>
          </div>
        </header>
        <Empty>No spec yet. Draft one from intake — it becomes the single source<br />both Pine and Python are generated from.</Empty>
      </section>
    )
  }

  const validBadge = specValidation.valid
    ? <Badge status="ok">valid</Badge>
    : <Badge status="err">{specValidation.issues.length} issue(s)</Badge>

  const regen = () => {
    regeneratePythonPayload()
    addAgentMessage({ agent: 'Spec', level: 'info', message: 'Python payload regenerated from spec' })
  }

  return (
    <section className="canonical-spec-panel">
      {/* Single-row unified header */}
      <header className="flex items-center justify-between gap-4 px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="flex items-baseline gap-2 flex-1 min-w-0">
          <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Step 02</span>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">Canonical spec</h1>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {validBadge}
          <div className="seg">
            <button className={`seg-btn ${view === 'summary' ? 'seg-on' : ''}`} onClick={() => setView('summary')}>summary</button>
            <button className={`seg-btn ${view === 'json' ? 'seg-on' : ''}`} onClick={() => setView('json')}>json</button>
          </div>
        </div>
      </header>
      {!specValidation.valid && specValidation.issues.length > 0 && (
        <Card className="issues">
          {specValidation.issues.map((i, n) => (
            <div key={n} className="issue"><code>{i.path}</code> {i.message}</div>
          ))}
        </Card>
      )}

      {view === 'summary' ? (
        <div className="col">
          <div className="grid-2">
            <Card><span className="eyebrow">Asset</span><div className="mono big">{canonicalSpec.asset.symbol}</div><div className="sub">{canonicalSpec.asset.timeframe} · {canonicalSpec.asset.contract ?? 'custom'}</div></Card>
            <Card><span className="eyebrow">Session</span><div className="mono big">{canonicalSpec.session?.sessionName ?? '—'}</div><div className="sub">{canonicalSpec.session?.tradeRTHOnly ? 'RTH only' : 'all hours'}</div></Card>
            <Card><span className="eyebrow">Entry</span><div className="mono big">{canonicalSpec.entry.side}</div><div className="sub">{canonicalSpec.entry.conditions.length} condition(s) · {canonicalSpec.entry.confirmOnBarClose ? 'bar-close' : 'intrabar'}</div></Card>
            <Card><span className="eyebrow">Exit</span><div className="mono big">{canonicalSpec.exit.stop.mode} / {canonicalSpec.exit.target.mode}</div><div className="sub">{canonicalSpec.exit.useTrailing ? 'trailing on' : 'fixed'}</div></Card>
          </div>
          <Card>
            <span className="eyebrow">Properties</span>
            <div className="kv mono">
              <div><span>capital</span>{canonicalSpec.properties.initialCapital} {canonicalSpec.properties.baseCurrency}</div>
              <div><span>qty</span>{canonicalSpec.properties.qtyValue} ({canonicalSpec.properties.qtyType})</div>
              <div><span>commission</span>{canonicalSpec.properties.commissionValue} ({canonicalSpec.properties.commissionType})</div>
              <div><span>slippage</span>{canonicalSpec.properties.slippageTicks} ticks</div>
              <div><span>fill</span>{canonicalSpec.properties.fillMode}</div>
              <div><span>recalc</span>{canonicalSpec.properties.recalcMode}</div>
            </div>
            {!propertyValidation.valid && propertyValidation.issues.length > 0 &&
              <div className="sub err-text">{propertyValidation.issues.length} property issue(s)</div>}
          </Card>
          <div className="spread">
            <span className="sub">Python payload: {pythonPayload ? <Badge status="ok">ready</Badge> : <Badge>not built</Badge>}</span>
            <Button onClick={regen}>Regenerate Python payload</Button>
          </div>
        </div>
      ) : (
        <pre className="json">{json}</pre>
      )}
    </section>
  )
}
