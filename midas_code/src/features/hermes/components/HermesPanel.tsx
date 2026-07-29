// src/features/hermes/components/HermesPanel.tsx
//
// Hermes runtime blade. Introspects the real agent runtime — discovered skills,
// the Curator's failure-classification policy, and the GEPA parameter search
// space + population — from hermes_state.json (emitted by
// gen_runtime_artifacts.py, synced to public/data). Read-only mirror of what
// hermes/skill_registry.py, hermes/curator.py, and hermes/gepa.py actually hold.
import { useEffect, useMemo, useState } from 'react'
import { Card, Button, Badge, Empty, MetricCard } from '../../../shared/ui'
import { StagePanelHeader } from '../../../shared/ui/StagePanelHeader'
import { useStrategyStore } from '../../../store/useStrategyStore'
import { BladeHeaderActions } from '../../../app/layout/BladeHeaderSlot'
import {
  loadHermesArtifact,
  type HermesArtifact,
} from '../../../shared/adapters/runtimeArtifactAdapter'
import { HermesConsole } from './HermesConsole'

type Section = 'skills' | 'curator' | 'gepa'

export function HermesPanel() {
  const { addAgentMessage } = useStrategyStore()
  const [artifact, setArtifact] = useState<HermesArtifact | null>(null)
  const [section, setSection] = useState<Section>('skills')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await loadHermesArtifact()
      if (!data) {
        addAgentMessage({ agent: 'Hermes', level: 'error', message: 'hermes_state.json not found — run: python gen_runtime_artifacts.py' })
        return
      }
      setArtifact(data)
      addAgentMessage({ agent: 'Hermes', level: 'success', message: `Runtime loaded — ${data.skills.length} skills · GEPA gen ${data.gepa.generation}` })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Best individual by fitness — meaningful once GEPA has evolved.
  const best = useMemo(() => {
    if (!artifact) return null
    return artifact.gepa.individuals.reduce(
      (b, i) => (i.fitness > (b?.fitness ?? -Infinity) ? i : b),
      null as HermesArtifact['gepa']['individuals'][number] | null
    )
  }, [artifact])

  if (!artifact) {
    return (
      <section className="hermes-panel">
        <BladeHeaderActions>
          <Button variant="primary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Load runtime'}</Button>
        </BladeHeaderActions>
        <StagePanelHeader tab="hermes" />
        <Empty>Hermes runtime not loaded. The custom loop dispatches skills,<br />the Curator auto-handles failures, GEPA evolves parameters.</Empty>
      </section>
    )
  }

  const { skills, curator, gepa } = artifact
  const paramKeys = Object.keys(gepa.bounds)

  return (
    <section className="hermes-panel">
      <BladeHeaderActions>
        <div className="seg">
          <button className={`seg-btn ${section === 'skills' ? 'seg-on' : ''}`} onClick={() => setSection('skills')}>Skills</button>
          <button className={`seg-btn ${section === 'curator' ? 'seg-on' : ''}`} onClick={() => setSection('curator')}>Curator</button>
          <button className={`seg-btn ${section === 'gepa' ? 'seg-on' : ''}`} onClick={() => setSection('gepa')}>GEPA</button>
        </div>
      </BladeHeaderActions>

      <StagePanelHeader
        tab="hermes"
        meta={`${skills.length} skills · GEPA generation ${gepa.generation} · ${gepa.total_runs} runs`}
      />
      <div className="hermes-split">
      <div className="col">
        <div className="metrics-grid">
          <MetricCard label="Skills" value={String(skills.length)} status="info" hint="auto-discovered" />
          <MetricCard label="GEPA gen" value={String(gepa.generation)} status="info" hint={`${gepa.size} individuals`} />
          <MetricCard label="Best fitness" value={best ? best.fitness.toFixed(3) : '—'} status={best && best.fitness > 0 ? 'ok' : 'idle'} hint={`${gepa.total_runs} runs`} />
        </div>

        {/* ── Skill registry ── */}
        {section === 'skills' && (
          <Card>
            <span className="eyebrow">Skill registry · hermes/skill_registry.py</span>
            <div className="hermes-skill-list">
              {skills.map((s) => (
                <div key={s.skill_id} className="hermes-skill-row">
                  <div className="hermes-skill-head">
                    <span className="hermes-skill-id mono">{s.skill_id}</span>
                    <span className="hermes-skill-name">{s.name}</span>
                    <span className="hermes-skill-phase">phase {s.phase}</span>
                    {s.runtime_skill && <Badge status="ok">runtime</Badge>}
                  </div>
                  <div className="hermes-skill-tags">
                    {s.tags.map((t) => <span key={t} className="hermes-tag">{t}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Curator policy ── */}
        {section === 'curator' && (
          <>
            <Card>
              <span className="eyebrow">Failure classification · hermes/curator.py</span>
              <div className="hermes-curator-grid">
                {curator.failure_types.map((ft) => (
                  <div key={ft} className={`hermes-ftype hermes-ftype--${ft.toLowerCase()}`}>
                    <span className="hermes-ftype-name">{ft}</span>
                    <span className="hermes-ftype-action">
                      {ft === 'TRANSIENT' ? 'retry + backoff' : ft === 'PARAMETER' ? 'adjust params' : 'skip'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="sub">{curator.backoff.note}</p>
            </Card>
            <Card>
              <span className="eyebrow">Retry backoff (seconds)</span>
              <div className="hermes-backoff">
                {curator.backoff.schedule.map((s, i) => (
                  <span key={i} className="hermes-backoff-step mono">#{i} · {s}s</span>
                ))}
              </div>
            </Card>
            <div className="hermes-pattern-cols">
              <Card>
                <span className="eyebrow">Transient patterns</span>
                <div className="hermes-patterns">
                  {curator.transient_patterns.map((p) => <code key={p} className="hermes-pat">{p}</code>)}
                </div>
              </Card>
              <Card>
                <span className="eyebrow">Parameter patterns</span>
                <div className="hermes-patterns">
                  {curator.parameter_patterns.map((p) => <code key={p} className="hermes-pat">{p}</code>)}
                </div>
              </Card>
            </div>
          </>
        )}

        {/* ── GEPA population ── */}
        {section === 'gepa' && (
          <>
            <Card>
              <span className="eyebrow">Parameter search space · hermes/gepa.py</span>
              <div className="hermes-bounds">
                {paramKeys.map((k) => (
                  <div key={k} className="hermes-bound-row">
                    <span className="hermes-bound-name mono">{k}</span>
                    <span className="hermes-bound-range">{gepa.bounds[k].min} – {gepa.bounds[k].max}</span>
                    <span className="hermes-bound-default">default {gepa.default_params[k]}</span>
                    <span className="hermes-bound-type">{gepa.bounds[k].type}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="codegen-output-card">
              <span className="eyebrow">Population · generation {gepa.generation}</span>
              <div className="hermes-pop-table">
                <div className="hermes-pop-row hermes-pop-head">
                  <span>#</span>
                  {paramKeys.map((k) => <span key={k}>{k}</span>)}
                  <span>fitness</span>
                  <span>runs</span>
                </div>
                {gepa.individuals.map((ind, i) => (
                  <div key={i} className={`hermes-pop-row ${best === ind ? 'hermes-pop-best' : ''}`}>
                    <span className="mono">{i}</span>
                    {paramKeys.map((k) => <span key={k} className="mono">{ind.params[k]}</span>)}
                    <span className="mono">{ind.fitness.toFixed(3)}</span>
                    <span className="mono">{ind.run_count}</span>
                  </div>
                ))}
              </div>
              <p className="sub">{gepa.note}</p>
            </Card>
            <Card>
              <span className="eyebrow">Fitness weights</span>
              <div className="hermes-weights">
                {Object.entries(gepa.fitness_weights).map(([k, v]) => (
                  <span key={k} className="hermes-weight"><b>{k}</b> {v}</span>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
        <HermesConsole generation={gepa.generation} skillCount={skills.length} />
      </div>
    </section>
  )
}
