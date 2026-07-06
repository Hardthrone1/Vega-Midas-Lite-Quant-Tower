// src/features/vault/components/VaultPanel.tsx
import { Panel, Card, Button, Empty, Badge } from '../../../shared/ui'
import { useStrategyStore } from '../../../store/useStrategyStore'
import { deployLabel, deployStatusKind } from '../../../shared/deployStatus'

export function VaultPanel() {
  const { versionHistory, pineVault, addVersion, canonicalSpec, deployStatus, addAgentMessage } = useStrategyStore()

  const save = () => {
    if (!canonicalSpec) return
    const name = `${canonicalSpec.asset.symbol} ${canonicalSpec.asset.timeframe} v${versionHistory.length + 1}`
    addVersion({ name, notes: `Saved at ${deployLabel(deployStatus)}` })
    addAgentMessage({ agent: 'Vault', level: 'success', message: `Saved ${name}` })
  }

  const totalItems = versionHistory.length + pineVault.length

  return (
    <Panel eyebrow="Step 06" title="Strategy vault" actions={
      <Button variant="primary" onClick={save} disabled={!canonicalSpec}>Save version</Button>
    }>
      {totalItems === 0 ? (
        <Empty>No saved versions. Save a spec version here or generate Pine Script via the Swarm tab — both land in this registry.</Empty>
      ) : (
        <div className="col">
          {pineVault.length > 0 && (
            <>
              <div className="eyebrow" style={{ padding: '4px 0 8px' }}>Generated Pine Scripts ({pineVault.length})</div>
              {[...pineVault].reverse().map((v) => (
                <Card key={v.id}>
                  <div className="spread">
                    <div>
                      <div className="mono" style={{ fontSize: 12 }}>{v.name}</div>
                      <div className="sub">{new Date(v.createdAt).toLocaleString()} · {v.code.length} chars · {v.source}</div>
                    </div>
                    <Badge status={v.lintPassed ? 'ok' : v.violations.length ? 'err' : 'warn'}>
                      {v.lintPassed ? 'LINT OK' : `${v.violations.length} violation${v.violations.length > 1 ? 's' : ''}`}
                    </Badge>
                  </div>
                  {!v.lintPassed && v.violations.length > 0 && (
                    <div className="sub" style={{ marginTop: 4, color: 'var(--err)' }}>
                      {v.violations[0]}{v.violations.length > 1 ? ` +${v.violations.length - 1} more` : ''}
                    </div>
                  )}
                </Card>
              ))}
            </>
          )}

          {versionHistory.length > 0 && (
            <>
              <div className="eyebrow" style={{ padding: '4px 0 8px', marginTop: 8 }}>Spec Versions ({versionHistory.length})</div>
              {[...versionHistory].reverse().map((v) => (
                <Card key={v.id}>
                  <div className="spread">
                    <div>
                      <div className="mono">{v.name}</div>
                      <div className="sub">{new Date(v.createdAt).toLocaleString()}</div>
                    </div>
                    <Badge status={deployStatusKind(deployStatus)}>{v.notes}</Badge>
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>
      )}
    </Panel>
  )
}
