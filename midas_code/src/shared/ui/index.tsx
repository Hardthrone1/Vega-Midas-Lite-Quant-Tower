// src/shared/ui/index.tsx
import React from 'react'

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

// Badge
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
    <span className={`badge badge-${status} ${className}`.trim()}>
      <StatusDot status={status} />
      {children}
    </span>
  )
}

// Button
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
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      aria-busy={ariaBusy}
      className={`btn btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

// Field
export function Field({
  label, hint, htmlFor, labelId, children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  labelId?: string
  children: React.ReactNode
}) {
  const labelProps = htmlFor ? { htmlFor } : { id: labelId }
  const LabelTag = htmlFor ? 'label' : 'span'

  return (
    <div className="field">
      <LabelTag {...labelProps} className="field-label">{label}</LabelTag>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}

// Empty
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>
}

export { Portal } from './Portal'
export { AnimatedPopover } from './AnimatedPopover'
export { RangeSlider } from './RangeSlider'
