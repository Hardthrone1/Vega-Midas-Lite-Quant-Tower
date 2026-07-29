// src/app/layout/NavSpine.tsx
// The nine pipeline stages as one horizontal spine. This is simultaneously the
// navigation and the stage indicator: each cell carries its own state bar, so
// "where is this run stuck" is structural rather than a badge parked elsewhere.
import type { CSSProperties } from 'react'
import { useStrategyStore, type Tab } from '../../store/useStrategyStore'
import { deriveStageStatuses, stageAccent, type StageReading } from '../../shared/stageStatus'
import { BLADES } from './blades'

export function NavSpine({ activeTab, onSelect }: { activeTab: Tab; onSelect: (tab: Tab) => void }) {
  const readings = useStrategyStore(deriveStageStatuses)

  return (
    <nav className="nav-spine" aria-label="Pipeline stages">
      {BLADES.map((blade, i) => (
        <NavCell
          key={blade.id}
          step={blade.step}
          label={blade.label}
          description={blade.description}
          reading={readings[blade.id]}
          current={blade.id === activeTab}
          index={i}
          onSelect={() => onSelect(blade.id)}
        />
      ))}
    </nav>
  )
}

function NavCell({
  step,
  label,
  description,
  reading,
  current,
  index,
  onSelect,
}: {
  step: string
  label: string
  description: string
  reading: StageReading
  current: boolean
  index: number
  onSelect: () => void
}) {
  const accent = stageAccent(reading.tone)
  const classes = [
    'nav-cell',
    'stagger-item',
    current ? 'nav-cell--current' : '',
    reading.tone === 'blocked' ? 'nav-cell--blocked' : '',
    reading.tone === 'warn' ? 'nav-cell--warn' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={classes}
      onClick={onSelect}
      aria-current={current ? 'page' : undefined}
      title={`${step} ${label} — ${description}`}
      style={
        {
          '--nav-accent': accent,
          '--nav-mark-fill': reading.tone === 'pending' ? 'transparent' : accent,
          '--stagger-i': index,
        } as CSSProperties
      }
    >
      <span className="nav-cell-bar" aria-hidden />
      <span className="nav-cell-top">
        <span className="nav-cell-step">{step}</span>
        <span className="nav-cell-mark" aria-hidden />
      </span>
      <span className="nav-cell-name">{label}</span>
      <span className="nav-cell-note">{reading.note}</span>
    </button>
  )
}
