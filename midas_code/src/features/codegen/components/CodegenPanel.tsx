// src/features/codegen/components/CodegenPanel.tsx
//
// Canonical codegen blade (AGT-CDG-001). One StrategySpec drives BOTH the Pine
// v5 script and the Python BacktestPayload — they share a spec_hash, so the two
// cannot drift. Loads the real artifact emitted by gen_runtime_artifacts.py
// (synced to public/data), the same real-artifact pattern the Backtest panel
// uses. This is the deterministic counterpart to the LLM-driven Swarm panel.
import { useEffect, useMemo, useState } from 'react'
import { Card, Button, Badge, Empty, MetricCard } from '../../../shared/ui'
import { useStrategyStore } from '../../../store/useStrategyStore'
import { BladeHeaderActions } from '../../../app/layout/BladeHeaderSlot'
import {
  loadCodegenArtifact,
  type CodegenArtifact,
  type CodegenVariant,
} from '../../../shared/adapters/runtimeArtifactAdapter'

// Minimal Pine syntax highlight — mirrors the Swarm panel's highlighter so the
// two Pine surfaces read identically.
function highlightPine(code: string) {
  return code
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(\/\/[^\n]*)/g, '<span class="pine-cmt">$1</span>')
    .replace(/\b(strategy|indicator|input|ta|math|plot|var|if|else|for|while|true|false|and|or|not|barstate|syminfo|close|open|high|low)\b/g,
      '<span class="pine-kw">$1</span>')
    .replace(/(".*?"|'.*?')/g, '<span class="pine-str">$1</span>')
}

type View = 'pine' | 'python'

export function CodegenPanel() {
  const { setPineCode, addAgentMessage } = useStrategyStore()
  const [artifact, setArtifact] = useState<CodegenArtifact | null>(null)
  const [preset, setPreset] = useState<string>('MGC')
  const [view, setView] = useState<View>('pine')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await loadCodegenArtifact()
      if (!data || !data.variants.length) {
        addAgentMessage({ agent: 'Codegen', level: 'error', message: 'codegen_output.json not found — run: python gen_runtime_artifacts.py' })
        return
      }
      setArtifact(data)
      setPreset(data.variants[0].preset)
      addAgentMessage({ agent: 'Codegen', level: 'success', message: `Loaded ${data.variants.length} variant(s) — one spec → Pine + Python` })
    } finally {
      setLoading(false)
    }
  }

  // Auto-load on first open so the blade is populated without a click.
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const variant: CodegenVariant | null = useMemo(
    () => artifact?.variants.find((v) => v.preset === preset) ?? artifact?.variants[0] ?? null,
    [artifact, preset]
  )

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  // Push the generated Pine into the shared store so the deploy gate / Vault
  // can pick up the deterministic build, not just LLM output.
  const useThisBuild = () => {
    if (!variant) return
    setPineCode(variant.pine_code)
    addAgentMessage({ agent: 'Codegen', level: 'success', message: `Pine build ${variant.spec_hash} (${variant.preset}) pushed to pipeline — lint ${variant.lint.passed ? 'PASS' : 'FAIL'}` })
  }

  if (!artifact || !variant) {
    return (
      <section className="codegen-panel">
        <BladeHeaderActions>
          <Button variant="primary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Load codegen'}</Button>
        </BladeHeaderActions>
        <Empty>No codegen output loaded. One canonical StrategySpec generates<br />the Pine v5 script and the Python backtest payload together.</Empty>
      </section>
    )
  }

  const lint = variant.lint
  const trap = lint.trapCheck
  const lintState: 'pass' | 'warn' | 'fail' = !lint.passed ? 'fail' : lint.warnings.length ? 'warn' : 'pass'
  const payloadText = JSON.stringify(variant.payload, null, 2)

  return (
    <section className="codegen-panel">
      <BladeHeaderActions>
        <div className="seg">
          {artifact.variants.map((v) => (
            <button key={v.preset} className={`seg-btn ${preset === v.preset ? 'seg-on' : ''}`} onClick={() => setPreset(v.preset)}>{v.preset}</button>
          ))}
        </div>
        <Button variant="primary" onClick={useThisBuild}>Use this build</Button>
      </BladeHeaderActions>

      <div className="col">
        {/* Parity proof: both outputs carry the SAME spec hash. */}
        <Card>
          <span className="eyebrow">Single source of truth</span>
          <div className="codegen-parity">
            <div className="codegen-parity-node">
              <span className="codegen-parity-label">StrategySpec</span>
              <span className="codegen-hash mono">{variant.spec_hash}</span>
            </div>
            <span className="codegen-parity-arrow">→</span>
            <div className="codegen-parity-outputs">
              <Badge status="ok">Pine v5 · {variant.pine_chars}c</Badge>
              <Badge status="ok">Python payload · schema v{String((variant.payload as { schemaVersion?: number }).schemaVersion ?? '?')}</Badge>
            </div>
          </div>
          <p className="sub">{artifact.note}</p>
        </Card>

        {/* Lint / anti-cheat gate */}
        <div className="metrics-grid">
          <MetricCard label="Lint" value={lint.passed ? 'PASS' : 'FAIL'} status={lint.passed ? 'ok' : 'err'} hint={`${lint.violations.length} violations`} />
          <MetricCard label="Warnings" value={String(lint.warnings.length)} status={lint.warnings.length ? 'warn' : 'ok'} />
          <MetricCard label="Trap check" value={trap.status.toUpperCase()} status={trap.status === 'available' ? 'ok' : trap.status === 'unreliable' || trap.status === 'unavailable' ? 'warn' : 'info'} />
        </div>

        {(lint.violations.length > 0 || lint.warnings.length > 0) && (
          <Card>
            <span className="eyebrow">Anti-cheat linter</span>
            {lint.violations.map((v, i) => (
              <div key={`v${i}`} className="codegen-lint-row codegen-lint-row--fail">✗ {v}</div>
            ))}
            {lint.warnings.map((w, i) => (
              <div key={`w${i}`} className="codegen-lint-row codegen-lint-row--warn">⚠ {w}</div>
            ))}
            <div className="codegen-trap sub">{trap.message}</div>
          </Card>
        )}

        {/* Output viewer: Pine | Python payload */}
        <Card className="codegen-output-card">
          <div className="codegen-output-head">
            <div className="seg">
              <button className={`seg-btn ${view === 'pine' ? 'seg-on' : ''}`} onClick={() => setView('pine')}>Pine v5</button>
              <button className={`seg-btn ${view === 'python' ? 'seg-on' : ''}`} onClick={() => setView('python')}>Python payload</button>
            </div>
            <button className="swarm-copy-btn" onClick={() => copy(view === 'pine' ? variant.pine_code : payloadText)}>
              {copied ? 'COPIED ✓' : 'COPY'}
            </button>
          </div>
          {view === 'pine' ? (
            <div
              className="swarm-pine-out"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: highlightPine(variant.pine_code) }}
            />
          ) : (
            <pre className="swarm-pine-out codegen-json">{payloadText}</pre>
          )}
          <div className={`swarm-lint swarm-lint--${lintState}`}>
            {lintState === 'fail' ? `✗ ${lint.violations.join(' · ')}` : lintState === 'warn' ? `⚠ ${lint.warnings.join(' · ')}` : '✓ Lint passed · no violations'}
          </div>
        </Card>
      </div>
    </section>
  )
}
