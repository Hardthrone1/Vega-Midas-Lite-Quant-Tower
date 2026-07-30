// src/shared/adapters/marketDataAdapter.ts
//
// Reads the gateway's Alpha Vantage cache (market_data.js / market_store.js).
// Informational only — nothing here feeds the deploy gate. Alpha Vantage has
// no futures coverage and no free-tier intraday, so this is deliberately not
// a replacement for the MGC series: it's a daily gold print, macro context
// (yields/CPI/dollar), and an independent RSI/ATR/ADX read for a sanity check
// against the Pine/Python numbers — nothing more.
//
// The gateway refreshes this at most once a day; these calls always hit the
// cache; they never trigger a live Alpha Vantage call themselves.
import { gatewayFetch } from '../gateway'

export type MarketBar = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number | null
  source: string
}

export type MacroPoint = {
  series: string
  observedAt: string
  value: number
  unit: string | null
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await gatewayFetch(path)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export const loadMarketBars = (symbol: string, timeframe = '1d', limit = 30) =>
  fetchJson<{ bars: MarketBar[] }>(`/api/market/bars?symbol=${symbol}&timeframe=${timeframe}&limit=${limit}`)
    .then((r) => r?.bars ?? [])

export const loadMacroSeries = (series: string, limit = 30) =>
  fetchJson<{ data: MacroPoint[] }>(`/api/market/macro?series=${series}&limit=${limit}`)
    .then((r) => r?.data ?? [])

export const loadIndicator = (symbol: string, fn: string, period = 14, limit = 30) =>
  fetchJson<{ data: MacroPoint[] }>(`/api/market/indicators?symbol=${symbol}&fn=${fn}&period=${period}&limit=${limit}`)
    .then((r) => r?.data ?? [])

/** One bundled snapshot for the Diagnostics macro card — a handful of small
 *  cached reads, not a single heavy call. */
export type MarketSnapshot = {
  gold: MarketBar | null
  goldPrevClose: number | null
  treasuryYield10y: MacroPoint | null
  cpi: MacroPoint | null
  fxEurUsd: MacroPoint | null
  gldRsi: MacroPoint | null
  gldAtr: MacroPoint | null
  gldAdx: MacroPoint | null
}

export async function loadMarketSnapshot(): Promise<MarketSnapshot> {
  const [gold, yield10y, cpi, fx, rsi, atr, adx] = await Promise.all([
    loadMarketBars('XAUUSD', '1d', 2),
    loadMacroSeries('TREASURY_YIELD_10Y', 1),
    loadMacroSeries('CPI', 1),
    loadMacroSeries('FX_EURUSD', 1),
    loadIndicator('GLD', 'RSI', 14, 1),
    loadIndicator('GLD', 'ATR', 14, 1),
    loadIndicator('GLD', 'ADX', 14, 1),
  ])
  const last = <T,>(arr: T[]): T | null => (arr.length ? arr[arr.length - 1] : null)
  return {
    gold: last(gold),
    goldPrevClose: gold.length > 1 ? gold[gold.length - 2].close : null,
    treasuryYield10y: last(yield10y),
    cpi: last(cpi),
    fxEurUsd: last(fx),
    gldRsi: last(rsi),
    gldAtr: last(atr),
    gldAdx: last(adx),
  }
}
