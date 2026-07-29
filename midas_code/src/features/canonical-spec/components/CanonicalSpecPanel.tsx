// src/features/canonical-spec/components/CanonicalSpecPanel.tsx
import { useMemo, useState } from 'react'
import { Card, Button, Badge, Empty } from '../../../shared/ui'
import { StagePanelHeader } from '../../../shared/ui/StagePanelHeader'
import { useStrategyStore } from '../../../store/useStrategyStore'
import { BladeHeaderActions } from '../../../app/layout/BladeHeaderSlot'

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
        <BladeHeaderActions>
          <Badge>no spec</Badge>
        </BladeHeaderActions>
        <StagePanelHeader tab="spec" />
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
      <BladeHeaderActions>
        {validBadge}
        <div className="seg">
          <button className={`seg-btn ${view === 'summary' ? 'seg-on' : ''}`} onClick={() => setView('summary')}>Summary</button>
          <button className={`seg-btn ${view === 'json' ? 'seg-on' : ''}`} onClick={() => setView('json')}>JSON</button>
        </div>
      </BladeHeaderActions>
      <StagePanelHeader
        tab="spec"
        title={canonicalSpec.meta?.name || 'Spec'}
        meta={`${canonicalSpec.asset.symbol} · ${canonicalSpec.asset.timeframe} · ${canonicalSpec.entry.conditions.length} entry condition(s)`}
      />
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
            <div className="spec-props">
              <div><span>Capital</span><strong>{canonicalSpec.properties.initialCapital} {canonicalSpec.properties.baseCurrency}</strong></div>
              <div><span>Quantity</span><strong>{canonicalSpec.properties.qtyValue} · {canonicalSpec.properties.qtyType}</strong></div>
              <div><span>Commission</span><strong>{canonicalSpec.properties.commissionValue} · {canonicalSpec.properties.commissionType}</strong></div>
              <div><span>Slippage</span><strong>{canonicalSpec.properties.slippageTicks} ticks</strong></div>
              <div><span>Fill</span><strong>{canonicalSpec.properties.fillMode}</strong></div>
              <div><span>Recalc</span><strong>{canonicalSpec.properties.recalcMode}</strong></div>
            </div>
            {!propertyValidation.valid && propertyValidation.issues.length > 0 &&
              <div className="sub err-text">{propertyValidation.issues.length} property issue(s)</div>}
          </Card>
          <div className="spread spec-footer">
            <span className="sub">Python payload {pythonPayload ? <Badge status="ok">ready</Badge> : <Badge>not built</Badge>}</span>
            <Button onClick={regen}>Regenerate Python payload</Button>
          </div>
        </div>
      ) : (
        <pre className="json">{json}</pre>
      )}
    </section>
  )
}
