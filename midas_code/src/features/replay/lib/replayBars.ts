// src/features/replay/lib/replayBars.ts
//
// The replay scenario series and the per-instrument contract profiles. Shared
// so the Replay stage and the full-screen chart plot the same bars rather than
// each synthesising their own.
//
// These bars are deterministic scenario data, not market history — the real
// 2026 MGC bars live with the parity run, which has its own timeline.
import type { ReplayBar } from '../hooks/useReplayScheduler'

export type InstrumentProfile = {
  symbol: string
  tickSize: number
  tickValue: number
  pointValue: number
  defaultSlippageTicks: number
  minStopTicks: number
}

export const INSTRUMENT_PROFILES: Record<string, InstrumentProfile> = {
  MGC:     { symbol: 'MGC',   tickSize: 0.1,  tickValue: 1,   pointValue: 10, defaultSlippageTicks: 2, minStopTicks: 8  },
  'MGC1!': { symbol: 'MGC1!', tickSize: 0.1,  tickValue: 1,   pointValue: 10, defaultSlippageTicks: 2, minStopTicks: 8  },
  MNQ:     { symbol: 'MNQ',   tickSize: 0.25, tickValue: 0.5, pointValue: 2,  defaultSlippageTicks: 4, minStopTicks: 12 },
  'MNQ1!': { symbol: 'MNQ1!', tickSize: 0.25, tickValue: 0.5, pointValue: 2,  defaultSlippageTicks: 4, minStopTicks: 12 },
  'NQ1!':  { symbol: 'NQ1!',  tickSize: 0.25, tickValue: 5,   pointValue: 20, defaultSlippageTicks: 2, minStopTicks: 10 },
}

export const profileFor = (symbol: string): InstrumentProfile =>
  INSTRUMENT_PROFILES[symbol] ?? INSTRUMENT_PROFILES.MGC

export const timeframeMinutes = (tf: string) => {
  const m = tf.match(/^(\d+)(m|h)$/i)
  if (!m) return 5
  return m[2].toLowerCase() === 'h' ? Number(m[1]) * 60 : Number(m[1])
}

export function makeReplayBars(symbol: string, timeframe: string): ReplayBar[] {
  const profile = profileFor(symbol)
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
      low: Number((Math.min(open, close) - tick * (7 + (i % 4))).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 120 + i * 3 + Math.round(Math.abs(Math.sin(i)) * 80),
    }
  })
}
