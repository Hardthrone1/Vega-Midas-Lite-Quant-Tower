// src/app/layout/BladeHost.tsx
// Renders the breadcrumb trail and the horizontal blade stack — the dynamic
// "Shell + Blade" workspace from the Azure Portal. Each blade has a header
// with controls and close; the last blade flexes to fill the remaining width
// and the track scrolls horizontally when blades overflow.
import { Fragment, Suspense, useState } from 'react'
import {
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem,
  Button,
  Caption1,
  Spinner,
  Text,
  Tooltip,
} from '@fluentui/react-components'
import { Dismiss20Regular, Home20Regular } from '@fluentui/react-icons'
import type { Tab } from '../../store/useStrategyStore'
import { bladeById, useBlades } from './blades'
import { BladeHeaderSlotProvider } from './BladeHeaderSlot'

export function BladeHost() {
  const { stack } = useBlades()

  return (
    <div className="blade-host">
      <BladeBreadcrumb />
      <div className="blade-track" role="region" aria-label="Open blades">
        {stack.map((tab, i) => (
          <Blade key={tab} tab={tab} isRoot={tab === stack[0]} isLast={i === stack.length - 1} />
        ))}
      </div>
    </div>
  )
}

function BladeBreadcrumb() {
  const { stack, openBlade, resetTo } = useBlades()

  return (
    <Breadcrumb aria-label="Blade navigation" size="small" className="blade-breadcrumb">
      <BreadcrumbItem>
        <BreadcrumbButton icon={<Home20Regular />} onClick={() => resetTo('intake')}>
          Home
        </BreadcrumbButton>
      </BreadcrumbItem>
      {stack.map((tab, i) => {
        const def = bladeById(tab)
        if (!def) return null
        const isLast = i === stack.length - 1
        return (
          <Fragment key={tab}>
            <BreadcrumbDivider />
            <BreadcrumbItem>
              <BreadcrumbButton current={isLast} onClick={() => openBlade(tab)}>
                {def.label}
              </BreadcrumbButton>
            </BreadcrumbItem>
          </Fragment>
        )
      })}
    </Breadcrumb>
  )
}

function Blade({ tab, isRoot, isLast }: { tab: Tab; isRoot: boolean; isLast: boolean }) {
  const { closeBlade } = useBlades()
  // The DOM node that panel controls teleport into (see BladeHeaderSlot).
  const [actionsNode, setActionsNode] = useState<HTMLDivElement | null>(null)
  const def = bladeById(tab)
  if (!def) return null

  const Icon = def.icon
  const BladeContent = def.Component

  return (
    <section className={`blade${isLast ? ' blade--last' : ''}`} aria-label={`${def.label} blade`}>
      <header className="blade-header">
        <span className="blade-header-icon" aria-hidden>
          <span className="blade-header-icon-glow" aria-hidden />
          <Icon />
        </span>
        <div className="blade-header-text">
          <Text as="h2" size={400} weight="semibold" block className="blade-title">
            {def.label}
          </Text>
          <Caption1 block className="blade-subtitle">
            <span className="blade-step mono">Step {def.step}</span>
            <span className="blade-subtitle-sep" aria-hidden>·</span>
            <span className="blade-subtitle-desc">{def.description}</span>
          </Caption1>
        </div>
        <div className="blade-header-actions">
          {/* Panel-owned controls teleport into here. */}
          <div className="blade-header-slot" ref={setActionsNode} />
          {!isRoot && (
            <Tooltip content="Close blade" relationship="label">
              <Button
                appearance="subtle"
                size="small"
                className="blade-close-btn"
                icon={<Dismiss20Regular />}
                onClick={() => closeBlade(tab)}
              />
            </Tooltip>
          )}
        </div>
      </header>
      <div className="blade-body">
        <Suspense
          fallback={
            <div className="blade-loading" role="status" aria-live="polite">
              <span className="blade-loading-gauge" aria-hidden>
                <span className="blade-loading-ring" />
                <span className="blade-loading-core" />
              </span>
              <Spinner size="small" label="Loading blade…" />
            </div>
          }
        >
          <BladeHeaderSlotProvider node={actionsNode}>
            <BladeContent />
          </BladeHeaderSlotProvider>
        </Suspense>
      </div>
    </section>
  )
}
