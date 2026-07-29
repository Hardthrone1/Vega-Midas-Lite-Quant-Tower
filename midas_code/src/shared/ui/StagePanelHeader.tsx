// src/shared/ui/StagePanelHeader.tsx
// The "Step 06 / Diagnostics" headline each stage opens with. Reads the blade
// registry so step numbers and labels can never drift from the nav spine.
import type { ReactNode } from 'react'
import type { Tab } from '../../store/useStrategyStore'
import { bladeById } from '../../app/layout/blades'

export function StagePanelHeader({
  tab,
  title,
  meta,
}: {
  tab: Tab
  /** Overrides the registry label when the stage knows a better name (e.g. the loaded strategy). */
  title?: string
  meta?: ReactNode
}) {
  const def = bladeById(tab)
  if (!def) return null

  return (
    <header className="stage-headline">
      <div>
        <div className="stage-headline-eyebrow">Step {def.step}</div>
        <h2 className="stage-headline-title">{title ?? def.label}</h2>
      </div>
      <div className="stage-headline-desc">{meta ?? def.description}</div>
    </header>
  )
}
