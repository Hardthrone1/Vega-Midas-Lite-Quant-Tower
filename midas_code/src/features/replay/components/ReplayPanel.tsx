// src/features/replay/components/ReplayPanel.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Card } from '../../../shared/ui'
import { useStrategyStore } from '../../../store/useStrategyStore'
import { ReplayChart } from './ReplayChart'
import { emitReplayEvent, onReplayEvent } from '../lib/replayEvents'
import { type ReplayBar, type ReplayDiagnostic, useReplayScheduler } from '../hooks/useReplayScheduler'

type InstrumentProfile = {
  symbol: string
  tickSize: number
  tickValue: number
  pointValue: number
  defaultSlippageTicks: number
  minStopTicks: number
}

const INSTRUMENT_PROFILES: Record<string, InstrumentProfile> = {
  MGC:    { symbol: 'MGC',   tickSize: 0.1,  tickValue: 1,   pointValue: 10, defaultSlippageTicks: 2, minStopTicks: 8  },
  'MGC1!':{ symbol: 'MGC1!', tickSize: 0.1,  tickValue: 1,   pointValue: 10, defaultSlippageTicks: 2, minStopTicks: 8  },
  MNQ:    { symbol: 'MNQ',   tickSize: 0.25, tickValue: 0.5, pointValue: 2,  defaultSlippageTicks: 4, minStopTicks: 12 },
  'MNQ1!':{ symbol: 'MNQ1!', tickSize: 0.25, tickValue: 0.5, pointValue: 2,  defaultSlippageTicks: 4, minStopTicks: 12 },
  'NQ1!': { symbol: 'NQ1!',  tickSize: 0.25, tickValue: 5,   pointValue: 20, defaultSlippageTicks: 2, minStopTicks: 10 },
}

const timeframeMinutes = (tf: string) => {
  const m = tf.match(/^(\d+)(m|h)$/i)
  if (!m) return 5
  return m[2].toLowerCase() === 'h' ? Number(m[1]) * 60 : Number(m[1])
}

function makeReplayBars(symbol: string, timeframe: string): ReplayBar[] {
  const profile = INSTRUMENT_PROFILES[symbol] ?? INSTRUMENT_PROFILES.MGC
  const step = timeframeMinutes(timeframe) * 60_000
  const start = Date.UTC(2026, 5, 24, 13, 30)
  const base = symbol.includes('NQ') ? 21480 : 3350
  const tick = profile.tickSize
  return Array.from({ length: 72 }, (_, i) => {
    const open = base + i * tick * (symbol.includes('NQ') ? 2.8 : 1.3) + Math.sin(i / 4) * tick * 18
    const close = open + Math.sin(i / 3.2) * tick * 10 + (i > 36 ? tick * 1.5 : 0)
    return {
      time: start + i * step,
      open: Number(open.toFixed(2)),
      high: Number((Math.max(open, close) + tick * (8 + (i % 5))).toFixed(2)),
      low:  Number((Math.min(open, close) - tick * (7 + (i % 4))).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 120 + i * 3 + Math.round(Math.abs(Math.sin(i)) * 80),
    }
  })
}

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
  const bars = useMemo(() => makeReplayBars(symbol, timeframe), [symbol, timeframe])
  const profile = INSTRUMENT_PROFILES[symbol] ?? INSTRUMENT_PROFILES.MGC
  const emittedMarkers = useRef(new Set<string>())
  const [sidecarOpen, setSidecarOpen] = useState(false)
  const panelRef = useRef<HTMLElement | null>(null)
  const [isFs, setIsFs] = useState(false)

  // Track real fullscreen state
  useEffect(() => {
    const onFsChange = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      panelRef.current?.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }, [])

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
    <section className="replay-panel" ref={(el: HTMLElement | null) => { panelRef.current = el }}>
      {/* Single-row unified header */}
      <header className="flex items-center justify-between gap-4 px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="flex items-baseline gap-2 flex-1 min-w-0">
          <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Step 03</span>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">Replay</h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            className="w-8 h-8 inline-flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 bg-transparent hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/10 text-gray-600 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
            onClick={() => setSidecarOpen(o => !o)}
            aria-expanded={sidecarOpen}
            aria-label={sidecarOpen ? 'Hide contract panel' : 'Show contract panel'}
            title={sidecarOpen ? 'Hide' : 'Show'}
          >
            {sidecarOpen ? '⊞' : '⊟'}
          </button>
          <Badge status={scheduler.status === 'playing' ? 'ok' : 'info'}>{scheduler.status}</Badge>
        </div>
      </header>
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
                <button type="button" className="replay-hud-btn replay-hud-btn--fs" onClick={toggleFullscreen} aria-label={isFs ? 'Exit fullscreen' : 'Enter fullscreen'}>
                  {isFs ? '⊡' : '⛶'}
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
