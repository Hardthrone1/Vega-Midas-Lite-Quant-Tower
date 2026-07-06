// src/app/layout/BladeHost.tsx
// Renders the breadcrumb trail and the horizontal blade stack — the dynamic
// "Shell + Blade" workspace from the Azure Portal. Every blade has a Fluent
// header with maximize/restore and close; the last blade flexes to fill the
// remaining width and the track scrolls horizontally when blades overflow.
import { Fragment, Suspense } from 'react'
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
import {
  ArrowMaximize20Regular,
  ArrowMinimize20Regular,
  Dismiss20Regular,
  Home20Regular,
} from '@fluentui/react-icons'
import type { Tab } from '../../store/useStrategyStore'
import { bladeById, useBlades } from './blades'

export function BladeHost() {
  const { stack, maximized } = useBlades()
  const visible = maximized ? stack.filter((t) => t === maximized) : stack

  return (
    <div className="blade-host">
      <BladeBreadcrumb />
      <div className="blade-track" role="region" aria-label="Open blades">
        {visible.map((tab, i) => (
          <Blade key={tab} tab={tab} isRoot={tab === stack[0]} isLast={i === visible.length - 1} />
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
  const { closeBlade, toggleMaximize, maximized } = useBlades()
  const def = bladeById(tab)
  if (!def) return null

  const Icon = def.icon
  const BladeContent = def.Component
  const isMaximized = maximized === tab

  return (
    <section className={`blade${isLast ? ' blade--last' : ''}`} aria-label={`${def.label} blade`}>
      <header className="blade-header">
        <span className="blade-header-icon" aria-hidden>
          <Icon />
        </span>
        <div className="blade-header-text">
          <Text as="h2" size={400} weight="semibold" block className="blade-title">
            {def.label}
          </Text>
          <Caption1 block className="blade-subtitle">
            Step {def.step} · {def.description}
          </Caption1>
        </div>
        <div className="blade-header-actions">
          <Tooltip content={isMaximized ? 'Restore' : 'Maximize'} relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={isMaximized ? <ArrowMinimize20Regular /> : <ArrowMaximize20Regular />}
              onClick={() => toggleMaximize(tab)}
            />
          </Tooltip>
          {!isRoot && (
            <Tooltip content="Close" relationship="label">
              <Button
                appearance="subtle"
                size="small"
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
              <Spinner size="small" label="Loading blade…" />
            </div>
          }
        >
          <BladeContent />
        </Suspense>
      </div>
    </section>
  )
}
