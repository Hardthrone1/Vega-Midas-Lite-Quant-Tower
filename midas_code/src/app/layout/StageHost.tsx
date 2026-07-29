// src/app/layout/StageHost.tsx
// Renders exactly one stage at a time. The old blade stack (several panels side
// by side, plus a breadcrumb) is gone: the spine above is the only navigation,
// so the workspace shows the stage you picked and nothing else.
import { Suspense, useState } from 'react'
import { Spinner } from '@fluentui/react-components'
import type { Tab } from '../../store/useStrategyStore'
import { bladeById } from './blades'
import { BladeHeaderSlotProvider } from './BladeHeaderSlot'

export function StageHost({ tab }: { tab: Tab }) {
  // The DOM node panel-owned controls teleport into (see BladeHeaderSlot).
  const [actionsNode, setActionsNode] = useState<HTMLDivElement | null>(null)
  const def = bladeById(tab)
  if (!def) return null

  const StageContent = def.Component

  return (
    <div className="stage-host">
      <div className="stage-actions-row" ref={setActionsNode} />
      <div className="stage-body" key={tab}>
        <Suspense
          fallback={
            <div className="stage-loading" role="status" aria-live="polite">
              <span className="stage-loading-gauge" aria-hidden>
                <span className="stage-loading-ring" />
                <span className="stage-loading-core" />
              </span>
              <Spinner size="small" label={`Loading ${def.label}…`} />
            </div>
          }
        >
          <BladeHeaderSlotProvider node={actionsNode}>
            <StageContent />
          </BladeHeaderSlotProvider>
        </Suspense>
      </div>
    </div>
  )
}
