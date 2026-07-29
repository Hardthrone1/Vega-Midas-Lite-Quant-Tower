// src/shared/adapters/parityReportAdapter.ts
//
// Loads the real parity-run artifacts (produced by pine_sweep_backtest.py and
// parity_validator.py at the repo root, synced into public/data by
// scripts/sync-parity-data.mjs) and adapts them to the store's BacktestResult
// and ParityResult shapes. Pure adaptation after fetch: no synthesis, no
// smoothing — the dashboard shows exactly what the validator reported.

export type PythonBacktestArtifact = {
  instrument: string
  initial_capital: number
  bars_csv_path: string
  notes: string
  trades: Array<{
    trade_num: number
    entry_dt: string
    entry_price: number
    entry_signal: string
    exit_dt: string
    exit_price: number
    exit_reason: string
    pnl_usd: number
  }>
}

export type DivergenceReportArtifact = {
  instrument: string
  summary: {
    total_python_trades: number
    total_pine_trades: number
    matched_trades: number
    unmatched_python: number
    unmatched_pine: number
    pass_count: number
    fail_count: number
    overall_status: 'PASS' | 'FAIL'
  }
  matched_trades: Array<{
    trade_num: number
    entry_dt: string
    entry_signal: string
    status: 'PASS' | 'FAIL'
    divergences: string[]
  }>
  unmatched_python_trades: Array<Record<string, unknown>>
  unmatched_pine_trades: Array<Record<string, unknown>>
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export const loadBacktestArtifact = () =>
  fetchJson<PythonBacktestArtifact>('/data/backtest_payload.json')

export const loadDivergenceReport = () =>
  fetchJson<DivergenceReportArtifact>('/data/divergence_report.json')

/** Real trades -> equity curve + edge metrics (store BacktestResult shape). */
export function toBacktestResult(payload: PythonBacktestArtifact) {
  const trades = payload.trades
  let equity = payload.initial_capital
  let peak = equity
  let maxDrawdown = 0
  const equityCurve: Array<Record<string, unknown>> = [
    { i: 0, dt: trades[0]?.entry_dt ?? '', equity },
  ]
  trades.forEach((t, i) => {
    equity += t.pnl_usd
    peak = Math.max(peak, equity)
    maxDrawdown = Math.min(maxDrawdown, equity - peak)
    equityCurve.push({ i: i + 1, dt: t.exit_dt, equity: Math.round(equity * 100) / 100 })
  })

  const wins = trades.filter((t) => t.pnl_usd > 0)
  const losses = trades.filter((t) => t.pnl_usd < 0)
  const grossWin = wins.reduce((s, t) => s + t.pnl_usd, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl_usd, 0))
  const netProfit = grossWin - grossLoss
  const avgLoss = losses.length ? grossLoss / losses.length : 0

  return {
    trades: trades as unknown as Array<Record<string, unknown>>,
    equityCurve,
    metrics: {
      netProfit: Math.round(netProfit),
      winRate: trades.length ? +((wins.length / trades.length) * 100).toFixed(1) : 0,
      profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : null,
      expectancy: avgLoss > 0 ? +(netProfit / trades.length / avgLoss).toFixed(2) : null,
      maxDrawdown: Math.round(maxDrawdown),
      trades: trades.length,
    },
  }
}

export type ParityCell = {
  /** Pine trade number, in execution order. */
  num: number
  state: 'matched' | 'divergent' | 'unmatched'
  label: string
}

/**
 * One cell per Pine trade, in execution order — the parity grid.
 *
 * The two sources name their fields differently: matched rows carry
 * `trade_num`/`entry_dt`/`entry_signal`, while unmatched Pine rows come
 * straight from the Pine side as `num`/`entry`/`signal`. Both are normalised
 * here so the grid never has to know which list a trade came from.
 */
export function toParityCells(report: DivergenceReportArtifact): ParityCell[] {
  const cells: ParityCell[] = []

  for (const m of report.matched_trades) {
    const divergent = m.status === 'FAIL'
    cells.push({
      num: m.trade_num,
      state: divergent ? 'divergent' : 'matched',
      label: divergent
        ? `Pine trade #${m.trade_num} — diverges: ${m.divergences.join(', ')}`
        : `Pine trade #${m.trade_num} — matched (${m.entry_signal}, ${m.entry_dt})`,
    })
  }

  for (const raw of report.unmatched_pine_trades) {
    const t = raw as { num?: number; trade_num?: number; entry?: string; entry_dt?: string; signal?: string; entry_signal?: string }
    const num = t.num ?? t.trade_num ?? 0
    const when = t.entry ?? t.entry_dt ?? 'unknown time'
    const side = t.signal ?? t.entry_signal ?? 'unknown side'
    cells.push({
      num,
      state: 'unmatched',
      label: `Pine trade #${num} — no Python counterpart (${side}, ${when})`,
    })
  }

  return cells.sort((a, b) => a.num - b.num)
}

/** Validator report -> store ParityResult shape. Nothing is softened: an
 *  unmatched trade counts as a mismatch and blocks the deploy gate. */
export function toParityResult(report: DivergenceReportArtifact) {
  const s = report.summary
  const failed = report.matched_trades.filter((m) => m.status === 'FAIL')
  const mismatches: Array<Record<string, unknown>> = [
    ...failed.map((m) => ({ kind: 'divergent', ...m })),
    ...report.unmatched_python_trades.map((t) => ({ kind: 'unmatched_python', ...t })),
    ...report.unmatched_pine_trades.map((t) => ({ kind: 'unmatched_pine', ...t })),
  ]
  return {
    passed: s.overall_status === 'PASS',
    mismatchCount: s.fail_count + s.unmatched_python + s.unmatched_pine,
    mismatches,
  }
}
