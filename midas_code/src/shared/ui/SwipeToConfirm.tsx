// src/shared/ui/SwipeToConfirm.tsx
// Pointer-event swipe slider for high-stakes confirmations.
// Uses refs so move/up handlers never carry stale state; no external drag libs.
import { useCallback, useRef, useState } from 'react'

type Variant = 'approve' | 'deny'

interface SwipeToConfirmProps {
  variant: Variant
  text?: string
  successText?: string
  onConfirm: () => void
  disabled?: boolean
}

const THRESHOLD = 0.9

export function SwipeToConfirm({ variant, text, successText, onConfirm, disabled = false }: SwipeToConfirmProps) {
  const [progress, setProgress] = useState(0)
  const [confirmed, setConfirmed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const activeRef = useRef(false)
  const progressRef = useRef(0)

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || confirmed) return
    e.currentTarget.setPointerCapture(e.pointerId)
    activeRef.current = true
    startXRef.current = e.clientX
    setDragging(true)
  }, [disabled, confirmed])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeRef.current || !trackRef.current) return
    const maxTravel = trackRef.current.offsetWidth - 34 - 8
    const raw = Math.max(0, Math.min((e.clientX - startXRef.current) / maxTravel, 1))
    progressRef.current = raw
    setProgress(raw)
  }, [])

  const onPointerUp = useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = false
    setDragging(false)
    if (progressRef.current >= THRESHOLD) {
      setProgress(1)
      setConfirmed(true)
      onConfirm()
    } else {
      progressRef.current = 0
      setProgress(0)
    }
  }, [onConfirm])

  const onPointerCancel = useCallback(() => {
    activeRef.current = false
    progressRef.current = 0
    setDragging(false)
    setProgress(0)
  }, [])

  const label = text ?? (variant === 'approve' ? 'Swipe to Approve' : 'Swipe to Deny')
  const doneLabel = successText ?? (variant === 'approve' ? 'Approved' : 'Denied')

  return (
    <div
      ref={trackRef}
      className={[
        'stc',
        `stc--${variant}`,
        confirmed ? 'stc--done' : '',
        dragging ? 'stc--dragging' : '',
        disabled ? 'stc--disabled' : '',
      ].filter(Boolean).join(' ')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div className="stc-fill" style={{ width: `${progress * 100}%` }} />
      <div
        className="stc-thumb"
        style={{ left: `calc(4px + ${progress} * (100% - 42px))` }}
      >
        {confirmed ? '✓' : '›'}
      </div>
      <span
        className="stc-label"
        style={{ opacity: confirmed ? 0 : Math.max(0.2, 1 - progress * 4) }}
      >
        {label}
      </span>
      {confirmed && <span className="stc-done-label">{doneLabel}</span>}
    </div>
  )
}
