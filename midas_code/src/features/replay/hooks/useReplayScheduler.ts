// src/features/replay/hooks/useReplayScheduler.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { emitReplayEvent, type ReplayEvent, type ReplayEventType } from '../lib/replayEvents'

export type ReplayStatus = 'idle' | 'playing' | 'paused' | 'stepping' | 'finished'
export type ReplayMode = 'bar_close' | 'intrabar' | 'hybrid'
export type ReplaySpeed = 0.25 | 0.5 | 1 | 2 | 4 | 8

export type ReplayBar = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export type ReplayDiagnostic = {
  type: 'info' | 'warn' | 'error' | 'success'
  title: string
  message: string
  barIndex: number
  tickIndex?: number
  payload?: Record<string, unknown>
}

type AudioCue = 'play' | 'pause' | 'step' | 'entry' | 'exit' | 'finish' | 'alert' | 'tick'

type SchedulerOptions = {
  bars: ReplayBar[]
  mode?: ReplayMode
  speed?: ReplaySpeed
  ticksPerBar?: number
  audioEnabled?: boolean
  notificationsEnabled?: boolean
  intrabarPath?: 'ohlc' | 'olhc' | 'auto'
  onBar?: (bar: ReplayBar, index: number, tickIndex: number) => void
  onDiagnostic?: (diagnostic: ReplayDiagnostic) => void
  onFinish?: () => void
}

type SchedulerState = {
  status: ReplayStatus
  mode: ReplayMode
  speed: ReplaySpeed
  currentBarIndex: number
  currentTickIndex: number
  totalBars: number
  ticksPerBar: number
  audioEnabled: boolean
  notificationsEnabled: boolean
  intrabarPath: 'ohlc' | 'olhc' | 'auto'
  lastFrameAt: number | null
  accumulatorMs: number
}

const BASE_BAR_MS = 500

function clampIndex(index: number, total: number) {
  return Math.max(0, Math.min(index, Math.max(0, total - 1)))
}

function makeTickPath(bar: ReplayBar, path: 'ohlc' | 'olhc' | 'auto') {
  const bullish = bar.close >= bar.open
  const resolved = path === 'auto' ? (bullish ? 'olhc' : 'ohlc') : path
  if (resolved === 'ohlc') {
    return [bar.open, bar.high, bar.low, bar.close]
  }
  return [bar.open, bar.low, bar.high, bar.close]
}

export function useReplayAudio(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)

  const getContext = useCallback(() => {
    if (!enabled || typeof window === 'undefined') return null
    if (!ctxRef.current) ctxRef.current = new AudioContext()
    return ctxRef.current
  }, [enabled])

  const beep = useCallback(
    async (freq: number, durationMs: number, volume = 0.04) => {
      const ctx = getContext()
      if (!ctx) return
      if (ctx.state === 'suspended') await ctx.resume()

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.value = volume
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + durationMs / 1000)
    },
    [getContext]
  )

  const playCue = useCallback(
    (cue: AudioCue) => {
      if (!enabled) return
      const map: Record<AudioCue, [number, number, number]> = {
        play: [440, 80, 0.04],
        pause: [330, 80, 0.035],
        step: [520, 50, 0.03],
        tick: [600, 30, 0.02],
        entry: [660, 100, 0.05],
        exit: [260, 100, 0.05],
        finish: [880, 140, 0.05],
        alert: [180, 160, 0.06],
      }
      const [f, d, v] = map[cue]
      void beep(f, d, v)
    },
    [beep, enabled]
  )

  useEffect(() => {
    return () => {
      void ctxRef.current?.close()
      ctxRef.current = null
    }
  }, [])

  return { playCue }
}

export function useReplayScheduler({
  bars,
  mode = 'bar_close',
  speed = 1,
  ticksPerBar = 4,
  audioEnabled = true,
  notificationsEnabled = true,
  intrabarPath = 'auto',
  onBar,
  onDiagnostic,
  onFinish,
}: SchedulerOptions) {
  const [state, setState] = useState<SchedulerState>({
    status: 'idle',
    mode,
    speed,
    currentBarIndex: 0,
    currentTickIndex: 0,
    totalBars: bars.length,
    ticksPerBar,
    audioEnabled,
    notificationsEnabled,
    intrabarPath,
    lastFrameAt: null,
    accumulatorMs: 0,
  })

  const requestRef = useRef<number | null>(null)
  const stateRef = useRef(state)
  const { playCue } = useReplayAudio(audioEnabled)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    setState((prev) => ({
      ...prev,
      mode,
      speed,
      totalBars: bars.length,
      ticksPerBar,
      audioEnabled,
      notificationsEnabled,
      intrabarPath,
      currentBarIndex: clampIndex(prev.currentBarIndex, bars.length),
    }))
  }, [mode, speed, bars.length, ticksPerBar, audioEnabled, notificationsEnabled, intrabarPath])

  const emit = useCallback(
    (type: ReplayEventType, payload: Omit<ReplayEvent['payload'], 'barIndex'> & { barIndex?: number }) => {
      const event: ReplayEvent = {
        type,
        payload: {
          barIndex: payload.barIndex ?? stateRef.current.currentBarIndex,
          tickIndex: payload.tickIndex,
          timestamp: payload.timestamp,
          price: payload.price,
          label: payload.label,
          severity: payload.severity,
          data: payload.data,
        },
      }
      emitReplayEvent(event)

      if (!notificationsEnabled) return

      const diagMap: Partial<Record<ReplayEventType, ReplayDiagnostic['type']>> = {
        'replay:play': 'success',
        'replay:pause': 'info',
        'replay:step': 'info',
        'replay:seek': 'info',
        'replay:bar-open': 'info',
        'replay:bar-close': 'success',
        'replay:intrabar-tick': 'info',
        'replay:signal': 'warn',
        'replay:entry': 'success',
        'replay:exit': 'success',
        'replay:finish': 'success',
        'replay:alert': 'error',
        'replay:reset': 'info',
      }

      const diagnostic: ReplayDiagnostic = {
        type: payload.severity ?? diagMap[type] ?? 'info',
        title: type,
        message: payload.label ?? type,
        barIndex: payload.barIndex ?? stateRef.current.currentBarIndex,
        tickIndex: payload.tickIndex,
        payload: payload.data,
      }

      onDiagnostic?.(diagnostic)

      const audioMap: Partial<Record<ReplayEventType, AudioCue>> = {
        'replay:play': 'play',
        'replay:pause': 'pause',
        'replay:step': 'step',
        'replay:intrabar-tick': 'tick',
        'replay:signal': 'alert',
        'replay:entry': 'entry',
        'replay:exit': 'exit',
        'replay:finish': 'finish',
        'replay:alert': 'alert',
      }

      const cue = audioMap[type]
      if (cue) playCue(cue)
    },
    [notificationsEnabled, onDiagnostic, playCue]
  )

  const stopLoop = useCallback(() => {
    if (requestRef.current != null) {
      cancelAnimationFrame(requestRef.current)
      requestRef.current = null
    }
  }, [])

  const finish = useCallback(() => {
    stopLoop()
    setState((prev) => ({ ...prev, status: 'finished', lastFrameAt: null, accumulatorMs: 0 }))
    emit('replay:finish', {
      barIndex: stateRef.current.currentBarIndex,
      label: 'Replay finished',
      severity: 'success',
    })
    onFinish?.()
  }, [emit, onFinish, stopLoop])

  const stepBar = useCallback(() => {
    const current = stateRef.current
    const nextIndex = current.currentBarIndex + 1

    if (nextIndex >= bars.length) {
      finish()
      return
    }

    const bar = bars[nextIndex]
    setState((prev) => ({
      ...prev,
      currentBarIndex: nextIndex,
      currentTickIndex: 0,
      status: prev.status === 'stepping' ? 'paused' : prev.status,
      accumulatorMs: 0,
    }))

    emit('replay:bar-open', {
      barIndex: nextIndex,
      timestamp: bar.time,
      price: bar.open,
      label: `Bar ${nextIndex + 1} open`,
      severity: 'info',
      data: { open: bar.open, high: bar.high, low: bar.low, close: bar.close },
    })

    emit('replay:bar-close', {
      barIndex: nextIndex,
      timestamp: bar.time,
      price: bar.close,
      label: `Bar ${nextIndex + 1} close`,
      severity: 'success',
      data: { open: bar.open, high: bar.high, low: bar.low, close: bar.close },
    })

    onBar?.(bar, nextIndex, 0)
  }, [bars, emit, finish, onBar])

  const stepTick = useCallback(() => {
    const current = stateRef.current
    const bar = bars[current.currentBarIndex]
    if (!bar) {
      finish()
      return
    }

    const path = makeTickPath(bar, current.intrabarPath)
    const nextTick = current.currentTickIndex + 1

    if (nextTick >= path.length) {
      setState((prev) => ({
        ...prev,
        currentTickIndex: 0,
      }))
      emit('replay:bar-close', {
        barIndex: current.currentBarIndex,
        timestamp: bar.time,
        price: bar.close,
        label: `Bar ${current.currentBarIndex + 1} close`,
        severity: 'success',
        data: { open: bar.open, high: bar.high, low: bar.low, close: bar.close },
      })
      stepBar()
      return
    }

    const price = path[nextTick]
    setState((prev) => ({
      ...prev,
      currentTickIndex: nextTick,
    }))

    emit('replay:intrabar-tick', {
      barIndex: current.currentBarIndex,
      tickIndex: nextTick,
      timestamp: bar.time,
      price,
      label: `Intrabar tick ${nextTick + 1}`,
      severity: 'info',
      data: { price, pathIndex: nextTick },
    })

    onBar?.(bar, current.currentBarIndex, nextTick)
  }, [bars, emit, finish, onBar])

  const tick = useCallback(
    (timestamp: number) => {
      const current = stateRef.current
      if (current.status !== 'playing') return

      const last = current.lastFrameAt ?? timestamp
      const delta = timestamp - last
      const barMs = BASE_BAR_MS / current.speed
      const tickMs = barMs / Math.max(1, current.ticksPerBar)
      const threshold = current.mode === 'bar_close' ? barMs : tickMs
      const acc = current.accumulatorMs + delta

      if (acc >= threshold) {
        setState((prev) => ({
          ...prev,
          accumulatorMs: acc - threshold,
          lastFrameAt: timestamp,
        }))
        if (current.mode === 'bar_close') stepBar()
        else stepTick()
      } else {
        setState((prev) => ({
          ...prev,
          accumulatorMs: acc,
          lastFrameAt: timestamp,
        }))
      }

      requestRef.current = requestAnimationFrame(tick)
    },
    [stepBar, stepTick]
  )

  const play = useCallback(() => {
    stopLoop()
    setState((prev) => ({ ...prev, status: 'playing', lastFrameAt: null }))
    emit('replay:play', {
      barIndex: stateRef.current.currentBarIndex,
      label: 'Replay started',
      severity: 'success',
    })
    requestRef.current = requestAnimationFrame(tick)
  }, [emit, stopLoop, tick])

  const pause = useCallback(() => {
    stopLoop()
    setState((prev) => ({ ...prev, status: 'paused', lastFrameAt: null }))
    emit('replay:pause', {
      barIndex: stateRef.current.currentBarIndex,
      label: 'Replay paused',
      severity: 'info',
    })
  }, [emit, stopLoop])

  const stepForward = useCallback(() => {
    stopLoop()
    setState((prev) => ({ ...prev, status: 'stepping', lastFrameAt: null, accumulatorMs: 0 }))
    emit('replay:step', {
      barIndex: stateRef.current.currentBarIndex,
      label: 'Manual step',
      severity: 'info',
    })
    if (stateRef.current.mode === 'bar_close') stepBar()
    else stepTick()
  }, [emit, stepBar, stepTick, stopLoop])

  const seek = useCallback(
    (index: number) => {
      const nextIndex = clampIndex(index, bars.length)
      stopLoop()
      setState((prev) => ({
        ...prev,
        currentBarIndex: nextIndex,
        currentTickIndex: 0,
        status: 'paused',
        lastFrameAt: null,
        accumulatorMs: 0,
      }))
      emit('replay:seek', {
        barIndex: nextIndex,
        label: `Seek to bar ${nextIndex + 1}`,
        severity: 'info',
        data: { bar: bars[nextIndex] ?? null },
      })
    },
    [bars, emit, stopLoop]
  )

  const reset = useCallback(() => {
    stopLoop()
    setState((prev) => ({
      ...prev,
      status: 'idle',
      currentBarIndex: 0,
      currentTickIndex: 0,
      lastFrameAt: null,
      accumulatorMs: 0,
    }))
    emit('replay:reset', {
      barIndex: 0,
      label: 'Replay reset',
      severity: 'info',
    })
  }, [emit, stopLoop])

  const setSpeed = useCallback((nextSpeed: ReplaySpeed) => {
    setState((prev) => ({ ...prev, speed: nextSpeed }))
  }, [])

  const setMode = useCallback((nextMode: ReplayMode) => {
    setState((prev) => ({ ...prev, mode: nextMode, currentTickIndex: 0, accumulatorMs: 0 }))
  }, [])

  const setAudioEnabled = useCallback((next: boolean) => {
    setState((prev) => ({ ...prev, audioEnabled: next }))
  }, [])

  const setNotificationsEnabled = useCallback((next: boolean) => {
    setState((prev) => ({ ...prev, notificationsEnabled: next }))
  }, [])

  useEffect(() => {
    return () => stopLoop()
  }, [stopLoop])

  const api = useMemo(
    () => ({
      ...state,
      play,
      pause,
      stepForward,
      seek,
      reset,
      setSpeed,
      setMode,
      setAudioEnabled,
      setNotificationsEnabled,
    }),
    [pause, play, reset, seek, setAudioEnabled, setMode, setNotificationsEnabled, setSpeed, state, stepForward]
  )

  return api
}
