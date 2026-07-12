// src/shared/ui/index.tsx
// Shared primitives, now backed by Fluent UI v9. The exported API is unchanged
// so every feature panel keeps working — but Button/Badge/Field render real
// Fluent components, and Panel/Card surfaces follow the Fluent design tokens
// remapped in portal.css.
import React from 'react'
import {
  Badge as FluentBadge,
  Button as FluentButton,
  Caption1,
  Label,
} from '@fluentui/react-components'

export type Status = 'idle' | 'ok' | 'warn' | 'err' | 'info'

// Panel — forwardRef so consumers can call requestFullscreen on the section element
export const Panel = React.forwardRef<
  HTMLElement,
  {
    eyebrow?: string
    title?: string
    actions?: React.ReactNode
    children: React.ReactNode
    className?: string
  }
>(function Panel({ eyebrow, title, actions, children, className = '' }, ref) {
  return (
    <section ref={ref} className={`panel ${className}`}>
      {(eyebrow || title || actions) && (
        <header className="panel-head">
          <div className="panel-head-text">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {title && <h2 className="panel-title">{title}</h2>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  )
})

// Card
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>
}

// StatusDot
export function StatusDot({ status, pulse = false }: { status: Status; pulse?: boolean }) {
  return <span className={`dot dot-${status} ${pulse ? 'dot-pulse' : ''}`} />
}

const BADGE_COLOR: Record<Status, 'subtle' | 'success' | 'warning' | 'danger' | 'informative'> = {
  idle: 'subtle',
  ok: 'success',
  warn: 'warning',
  err: 'danger',
  info: 'informative',
}

// Badge — Fluent tinted badge; status maps onto the Fluent status palette
export function Badge({
  status = 'idle',
  children,
  className = '',
}: {
  status?: Status
  children: React.ReactNode
  className?: string
}) {
  return (
    <FluentBadge appearance="tint" color={BADGE_COLOR[status]} className={className || undefined}>
      {children}
    </FluentBadge>
  )
}

// Button — Fluent button; legacy variants map onto Fluent appearances
export function Button({
  children, onClick, variant = 'ghost', disabled = false, type = 'button', title, 'aria-label': ariaLabel, 'aria-busy': ariaBusy,
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
  title?: string
  'aria-label'?: string
  'aria-busy'?: boolean
}) {
  return (
    <FluentButton
      appearance={variant === 'primary' ? 'primary' : variant === 'danger' ? 'outline' : 'secondary'}
      className={variant === 'danger' ? 'vega-btn-danger' : variant === 'primary' ? 'vega-btn-glow' : undefined}
      type={type}
      title={title}
      aria-label={ariaLabel}
      aria-busy={ariaBusy}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </FluentButton>
  )
}

// Field — Fluent label + caption around any control (native or Fluent).
// The intake form uses the full Fluent <Field> directly; this wrapper keeps
// the legacy call sites (native selects/inputs) accessible and consistent.
export function Field({
  label, hint, htmlFor, labelId, children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  labelId?: string
  children: React.ReactNode
}) {
  return (
    <div className="field">
      <Label htmlFor={htmlFor} id={htmlFor ? undefined : labelId} size="small" className="field-label">
        {label}
      </Label>
      {children}
      {hint && <Caption1 className="field-hint">{hint}</Caption1>}
    </div>
  )
}

// Empty
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>
}

// MetricCard — glassmorphic stat tile with a semantic status accent.
// Pair with className="stagger-item" and style={{ '--stagger-i': i }} inside
// maps for staggered entry animation.
export function MetricCard({
  label,
  value,
  status = 'idle',
  delta,
  hint,
  className = '',
  style,
}: {
  label: string
  value: React.ReactNode
  status?: Status
  delta?: string
  hint?: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={`metric-card metric-card--${status} ${className}`.trim()} style={style}>
      <span className="metric-card-label">{label}</span>
      <span className="metric-card-value mono tabular">{value}</span>
      {delta && <span className="metric-card-delta">{delta}</span>}
      {hint && <span className="metric-card-hint">{hint}</span>}
    </div>
  )
}

export { Portal } from './Portal'
export { AnimatedPopover } from './AnimatedPopover'
export { RangeSlider } from './RangeSlider'
export { SwipeToConfirm } from './SwipeToConfirm'
