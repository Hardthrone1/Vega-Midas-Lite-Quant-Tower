// src/features/replay/components/ReplayDiagnosticsOverlay.tsx
import { useEffect, useMemo, useState } from 'react'
import { onReplayEvent, type ReplayEvent } from '../lib/replayEvents'

type DiagnosticItem = {
  id: string
  level: 'info' | 'warn' | 'error' | 'success'
  title: string
  message: string
  barIndex: number
  tickIndex?: number
  timestamp?: number
}

type ReplayDiagnosticsOverlayProps = {
  visible?: boolean
  className?: string
  maxItems?: number
  fillModel?: 'bar_close' | 'intrabar' | 'hybrid'
  onEvent?: (event: ReplayEvent) => void
}

function eventToItem(event: ReplayEvent): DiagnosticItem | null {
  const { type, payload } = event
  const base = {
    id: `${type}-${payload.barIndex}-${payload.tickIndex ?? 0}-${payload.timestamp ?? Date.now()}`,
    barIndex: payload.barIndex,
    tickIndex: payload.tickIndex,
    timestamp: payload.timestamp,
  }

  switch (type) {
    case 'replay:play':
      return { ...base, level: 'success', title: 'Replay', message: 'Playback started' }
    case 'replay:pause':
      return { ...base, level: 'info', title: 'Replay', message: 'Playback paused' }
    case 'replay:step':
      return { ...base, level: 'info', title: 'Replay', message: 'Manual step' }
    case 'replay:seek':
      return { ...base, level: 'info', title: 'Replay', message: `Seek to bar ${payload.barIndex + 1}` }
    case 'replay:bar-open':
      return { ...base, level: 'info', title: 'Bar open', message: payload.label ?? 'Bar opened' }
    case 'replay:bar-close':
      return { ...base, level: 'success', title: 'Bar close', message: payload.label ?? 'Bar closed' }
    case 'replay:intrabar-tick':
      return { ...base, level: 'info', title: 'Intrabar', message: payload.label ?? 'Tick advanced' }
    case 'replay:signal':
      return { ...base, level: 'warn', title: 'Signal', message: payload.label ?? 'Strategy signal' }
    case 'replay:entry':
      return { ...base, level: 'success', title: 'Entry', message: payload.label ?? 'Trade entry' }
    case 'replay:exit':
      return { ...base, level: 'success', title: 'Exit', message: payload.label ?? 'Trade exit' }
    case 'replay:alert':
      return { ...base, level: 'error', title: 'Alert', message: payload.label ?? 'Alert triggered' }
    case 'replay:finish':
      return { ...base, level: 'success', title: 'Replay', message: 'Replay finished' }
    case 'replay:reset':
      return { ...base, level: 'info', title: 'Replay', message: 'Replay reset' }
    default:
      return null
  }
}

export function ReplayDiagnosticsOverlay({
  visible = true,
  className,
  maxItems = 8,
  fillModel = 'bar_close',
  onEvent,
}: ReplayDiagnosticsOverlayProps) {
  const [items, setItems] = useState<DiagnosticItem[]>([])
  const [confirmedBars, setConfirmedBars] = useState<number>(0)
  const [slippageDelta, setSlippageDelta] = useState<number | null>(null)
  const [parityState, setParityState] = useState<'pending' | 'pass' | 'warn' | 'fail'>('pending')

  useEffect(() => {
    const unsubscribers = [
      onReplayEvent('replay:bar-close', (event) => {
        onEvent?.(event)
        const item = eventToItem(event)
        if (!item) return
        setConfirmedBars((v) => v + 1)
        setItems((prev) => [item, ...prev].slice(0, maxItems))
      }),
      onReplayEvent('replay:entry', (event) => {
        onEvent?.(event)
        const item = eventToItem(event)
        if (!item) return
        setItems((prev) => [item, ...prev].slice(0, maxItems))
        const delta = typeof event.payload.data?.slippageDelta === 'number' ? event.payload.data.slippageDelta : null
        if (delta != null) setSlippageDelta(delta)
      }),
      onReplayEvent('replay:exit', (event) => {
        onEvent?.(event)
        const item = eventToItem(event)
        if (!item) return
        setItems((prev) => [item, ...prev].slice(0, maxItems))
        const delta = typeof event.payload.data?.slippageDelta === 'number' ? event.payload.data.slippageDelta : null
        if (delta != null) setSlippageDelta(delta)
      }),
      onReplayEvent('replay:signal', (event) => {
        onEvent?.(event)
        const item = eventToItem(event)
        if (!item) return
        setItems((prev) => [item, ...prev].slice(0, maxItems))
      }),
      onReplayEvent('replay:alert', (event) => {
        onEvent?.(event)
        const item = eventToItem(event)
        if (!item) return
        setItems((prev) => [item, ...prev].slice(0, maxItems))
      }),
      onReplayEvent('replay:finish', (event) => {
        onEvent?.(event)
        const item = eventToItem(event)
        if (!item) return
        setItems((prev) => [item, ...prev].slice(0, maxItems))
        const parity = event.payload.data?.parity as 'pass' | 'warn' | 'fail' | undefined
        if (parity) setParityState(parity)
      }),
      onReplayEvent('replay:reset', (event) => {
        onEvent?.(event)
        setItems([])
        setConfirmedBars(0)
        setSlippageDelta(null)
        setParityState('pending')
      }),
      onReplayEvent('replay:step', (event) => {
        onEvent?.(event)
        const item = eventToItem(event)
        if (!item) return
        setItems((prev) => [item, ...prev].slice(0, maxItems))
      }),
    ]

    return () => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [maxItems, onEvent])

  const summary = useMemo(() => {
    const latest = items[0]
    return {
      latestText: latest ? `${latest.title}: ${latest.message}` : 'Awaiting replay events',
      parityLabel:
        parityState === 'pass' ? 'PASS' : parityState === 'warn' ? 'WARN' : parityState === 'fail' ? 'FAIL' : 'PENDING',
      slippageLabel: slippageDelta == null ? '—' : slippageDelta.toFixed(2),
    }
  }, [items, parityState, slippageDelta])

  if (!visible) return null

  return (
    <div className={className ?? 'replay-diagnostics-overlay'}>
      <div className="replay-diagnostics-header">
        <div className="replay-diagnostics-title">Diagnostics</div>
        <div className="replay-diagnostics-badges">
          <span className={`diag-pill diag-${parityState}`}>Parity {summary.parityLabel}</span>
          <span className="diag-pill">Confirmed {confirmedBars}</span>
          <span className="diag-pill">Slip {summary.slippageLabel}</span>
          <span className="diag-pill">Model {fillModel}</span>
        </div>
      </div>

      <div className="replay-diagnostics-summary">{summary.latestText}</div>

      <div className="replay-diagnostics-list">
        {items.map((item) => (
          <div key={item.id} className={`replay-diagnostic-row diag-${item.level}`}>
            <div className="diag-meta">
              <span className="diag-title">{item.title}</span>
              <span className="diag-bar">bar {item.barIndex + 1}</span>
              {item.tickIndex != null ? <span className="diag-tick">tick {item.tickIndex + 1}</span> : null}
            </div>
            <div className="diag-message">{item.message}</div>
          </div>
        ))}
        {!items.length ? <div className="replay-diagnostics-empty">No diagnostics yet.</div> : null}
      </div>
    </div>
  )
}
