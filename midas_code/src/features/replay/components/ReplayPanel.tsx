// src/features/replay/components/ReplayPanel.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Card } from '../../../shared/ui'
import { useStrategyStore } from '../../../store/useStrategyStore'
import { BladeHeaderActions } from '../../../app/layout/BladeHeaderSlot'
import { ReplayChart } from './ReplayChart'
import { emitReplayEvent, onReplayEvent } from '../lib/replayEvents'
import { type ReplayBar, type ReplayDiagnostic, useReplayScheduler } from '../hooks/useReplayScheduler'
import { makeReplayBars, profileFor } from '../lib/replayBars'
import { StagePanelHeader } from '../../../shared/ui/StagePanelHeader'

// ── Toast for warn/error events ──────────────────────────────────────────────
type Toast = { id: number; level: 'warn' | 'error'; message: string }

function ReplayToast({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [onDismiss])
  return (
    <div className={`replay-toast replay-toast--${toast.level}`} onClick={onDismiss}>
      <span className="replay-toast-dot" />
      <span className="replay-toast-msg">{toast.message}</span>
      <span className="replay-toast-timer" />
    </div>
  )
}

// ── Compact diagnostics state hook ───────────────────────────────────────────
function useReplayDiagState() {
  const [confirmedBars, setConfirmedBars] = useState(0)
  const [slippageDelta, setSlippageDelta] = useState<number | null>(null)
  const [parityState, setParityState] = useState<'pending' | 'pass' | 'warn' | 'fail'>('pending')
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  const addToast = useCallback((level: 'warn' | 'error', message: string) => {
    const id = ++toastId.current
    setToasts(prev => [...prev, { id, level, message }])
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    const unsubs = [
      onReplayEvent('replay:bar-close', () => setConfirmedBars(v => v + 1)),
      onReplayEvent('replay:entry', (e) => {
        const d = e.payload.data?.slippageDelta
        if (typeof d === 'number') setSlippageDelta(d)
      }),
      onReplayEvent('replay:exit', (e) => {
        const d = e.payload.data?.slippageDelta
        if (typeof d === 'number') setSlippageDelta(d)
      }),
      onReplayEvent('replay:finish', (e) => {
        const p = e.payload.data?.parity as 'pass' | 'warn' | 'fail' | undefined
        if (p) setParityState(p)
      }),
      onReplayEvent('replay:signal', (e) => {
        if (e.payload.severity === 'warn') addToast('warn', e.payload.label ?? 'Signal warning')
      }),
      onReplayEvent('replay:alert', (e) => {
        addToast('error', e.payload.label ?? 'Alert triggered')
      }),
      onReplayEvent('replay:reset', () => {
        setConfirmedBars(0)
        setSlippageDelta(null)
        setParityState('pending')
        setToasts([])
      }),
    ]
    return () => { unsubs.forEach(u => u()) }
  }, [addToast])

  return { confirmedBars, slippageDelta, parityState, toasts, dismissToast }
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function ReplayPanel() {
  const { symbol, timeframe, addAgentMessage } = useStrategyStore()
  const openChartOverlay = useStrategyStore((s) => s.openChartOverlay)
  const bars = useMemo(() => makeReplayBars(symbol, timeframe), [symbol, timeframe])
  const profile = profileFor(symbol)
  const emittedMarkers = useRef(new Set<string>())
  const [sidecarOpen, setSidecarOpen] = useState(false)

  const { confirmedBars, slippageDelta, parityState, toasts, dismissToast } = useReplayDiagState()

  const onBar = useCallback((bar: ReplayBar, index: number) => {
    const emitOnce = (key: string, run: () => void) => {
      if (emittedMarkers.current.has(key)) return
      emittedMarkers.current.add(key)
      run()
    }
    if (index === 12) emitOnce(`signal-${index}`, () => emitReplayEvent({ type: 'replay:signal', payload: { barIndex: index, timestamp: bar.time, price: bar.close, label: 'Scenario tag: high-volatility open', severity: 'warn', data: { scenario: 'high-volatility open' } } }))
    if (index === 18) emitOnce(`entry-${index}`, () => emitReplayEvent({ type: 'replay:entry', payload: { barIndex: index, timestamp: bar.time, price: bar.close, label: 'Long test fill', severity: 'success', data: { side: 'long', slippageDelta: profile.defaultSlippageTicks * profile.tickSize } } }))
    if (index === 42) emitOnce(`exit-${index}`,  () => emitReplayEvent({ type: 'replay:exit',  payload: { barIndex: index, timestamp: bar.time, price: bar.close, label: 'Exit test fill',  severity: 'success', data: { side: 'flat', slippageDelta: profile.defaultSlippageTicks * profile.tickSize, parity: 'pass' } } }))
  }, [profile.defaultSlippageTicks, profile.tickSize])

  const scheduler = useReplayScheduler({
    bars, mode: 'intrabar', speed: 1, ticksPerBar: 4, intrabarPath: 'auto',
    audioEnabled: false, notificationsEnabled: true, onBar,
    onDiagnostic: (d: ReplayDiagnostic) => {
      if (d.title === 'replay:finish' || d.title === 'replay:alert')
        addAgentMessage({ agent: 'Replay', level: d.type, message: d.message })
    },
    onFinish: () => emitReplayEvent({ type: 'replay:finish', payload: { barIndex: bars.length - 1, label: 'Parity pass', severity: 'success', data: { parity: 'pass' } } }),
  })

  const resetReplay = () => { emittedMarkers.current.clear(); scheduler.reset() }

  const parityClass = parityState === 'pass' ? 'diag-pass' : parityState === 'fail' ? 'diag-fail' : parityState === 'warn' ? 'diag-warn' : 'diag-pending'
  const slipLabel = slippageDelta == null ? '—' : slippageDelta.toFixed(2)
  const tickInfo = scheduler.mode !== 'bar_close' ? ` · tick ${scheduler.currentTickIndex + 1}` : ''

  return (
    <section className="replay-panel">
      <BladeHeaderActions>
        <button
          type="button"
          className="blade-icon-btn"
          onClick={() => setSidecarOpen(o => !o)}
          aria-expanded={sidecarOpen}
          aria-label={sidecarOpen ? 'Hide contract panel' : 'Show contract panel'}
          title={sidecarOpen ? 'Hide contract panel' : 'Show contract panel'}
        >
          {sidecarOpen ? '⊞' : '⊟'}
        </button>
        <Badge status={scheduler.status === 'playing' ? 'ok' : 'info'} className={scheduler.status === 'playing' ? 'badge-live' : undefined}>{scheduler.status}</Badge>
      </BladeHeaderActions>
      <StagePanelHeader tab="replay" meta={`${symbol} · ${timeframe} · scenario replay`} />

      {/* Toast container */}
      {toasts.length > 0 && (
        <div className="replay-toast-stack">
          {toasts.map(t => <ReplayToast key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />)}
        </div>
      )}

      <div className={`replay-workspace${sidecarOpen ? ' replay-workspace--with-sidecar' : ''}`}>
        <div className="replay-main">
          <div className="replay-chart-wrap">
            <ReplayChart
              bars={bars}
              currentBarIndex={scheduler.currentBarIndex}
              currentTickIndex={scheduler.currentTickIndex}
              status={scheduler.status}
              mode={scheduler.mode}
            />

            {/* Single unified HUD — progress · mode · status / diag pills / controls */}
            <div className="replay-hud">
              {/* Left: bar counter + mode + status */}
              <div className="replay-hud-left mono">
                <span className="replay-hud-progress">
                  {scheduler.currentBarIndex + 1} / {bars.length}
                </span>
                <span className="replay-hud-sep">·</span>
                <span className="replay-hud-mode">{scheduler.mode}{tickInfo}</span>
                <span className="replay-hud-sep">·</span>
                <span className="replay-hud-status">{scheduler.status}</span>
              </div>

              {/* Center: compact diag pills */}
              <div className="replay-hud-diag">
                <span className={`diag-pill ${parityClass}`}>Parity {parityState.toUpperCase()}</span>
                <span className="diag-pill">Confirmed {confirmedBars}</span>
                <span className="diag-pill">Slip {slipLabel}</span>
              </div>

              {/* Right: controls + fullscreen */}
              <div className="replay-hud-btns">
                <button
                  type="button"
                  className={`replay-hud-btn replay-hud-btn--primary${scheduler.status === 'playing' ? ' is-playing' : ''}`}
                  onClick={scheduler.status === 'playing' ? scheduler.pause : scheduler.play}
                  aria-label={scheduler.status === 'playing' ? 'Pause replay' : 'Play replay'}
                >
                  {scheduler.status === 'playing' ? '⏸' : '▶'}
                </button>
                <button type="button" className="replay-hud-btn" onClick={scheduler.stepForward} aria-label="Step forward one bar">⏭</button>
                <button type="button" className="replay-hud-btn" onClick={resetReplay} aria-label="Reset replay">↺</button>
                <button
                  type="button"
                  className="replay-hud-btn replay-hud-btn--fs"
                  onClick={() => openChartOverlay({ source: 'bars' })}
                  aria-label="Open the full-screen chart"
                  title="Open the full-screen chart"
                >
                  ⛶
                </button>
              </div>
            </div>
          </div>
        </div>

        {sidecarOpen && (
          <aside className="replay-sidecar">
            <Card>
              <span className="eyebrow">Contract · {symbol}</span>
              <div className="contract-grid">
                <div><span>Tick size</span><strong>{profile.tickSize}</strong></div>
                <div><span>Tick value</span><strong>${profile.tickValue}</strong></div>
                <div><span>Point value</span><strong>${profile.pointValue}</strong></div>
                <div><span>Slippage</span><strong>{profile.defaultSlippageTicks} ticks</strong></div>
                <div><span>Min stop</span><strong>{profile.minStopTicks} ticks</strong></div>
              </div>
            </Card>
            <Card>
              <span className="eyebrow">Scenario seed</span>
              <div className="scenario-list">
                <Badge status="warn">high-volatility open</Badge>
                <Badge status="info">trend continuation</Badge>
                <Badge status="idle">lunch chop guard</Badge>
              </div>
              <p className="sub">Scenario tags seed the parity/backtest canvas for regime-aware testing.</p>
            </Card>
          </aside>
        )}
      </div>
    </section>
  )
}
