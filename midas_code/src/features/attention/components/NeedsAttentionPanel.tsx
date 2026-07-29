// src/features/attention/components/NeedsAttentionPanel.tsx
// Everything standing between this run and a promotion, ranked, each row a
// jump to the stage that owns it. Derived from the same signals as the nav
// spine (see shared/stageStatus.ts) so the two can never disagree.
import type { CSSProperties } from 'react'
import { useStrategyStore, type Tab } from '../../../store/useStrategyStore'
import { deriveAttention } from '../../../shared/stageStatus'
import { bladeById } from '../../../app/layout/blades'

const stepOf = (id: Tab) => bladeById(id)?.step ?? '—'

export function NeedsAttentionPanel({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const items = useStrategyStore((s) => deriveAttention(s, stepOf))
  const blocking = items.filter((i) => i.tone === 'blocked').length

  return (
    <section className="attention-panel">
      <header className="rail-section-head">
        <h3>Needs attention</h3>
        <span className="rail-spacer" />
        <span
          className="rail-count"
          style={{ color: blocking > 0 ? 'var(--err)' : items.length > 0 ? 'var(--warn)' : 'var(--blue)' }}
        >
          {items.length}
        </span>
      </header>

      <div className="attention-list">
        {items.length === 0 ? (
          <p className="attention-empty">Nothing is blocking. Run the checks to re-verify the gate.</p>
        ) : (
          items.map((item, i) => (
            <button
              key={`${item.kind}-${item.text}`}
              type="button"
              className="attention-row stagger-item"
              style={{ '--stagger-i': Math.min(i, 6) } as CSSProperties}
              onClick={() => onNavigate(item.where)}
            >
              <span className="attention-row-top">
                <span className={`attention-dot attention-dot--${item.tone}`} aria-hidden />
                <span className={`attention-kind attention-kind--${item.tone}`}>{item.kind}</span>
                <span className="rail-spacer" />
                <span className="attention-where">Step {item.step}</span>
              </span>
              <span className="attention-text">{item.text}</span>
            </button>
          ))
        )}
      </div>
    </section>
  )
}
