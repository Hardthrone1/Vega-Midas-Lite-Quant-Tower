// src/shared/stageStatus.ts
//
// Turns the store's single global deploy-state machine into nine independent
// stage readings, so the nav spine can show where the run actually is instead
// of a badge somewhere else in the chrome.
//
// One derivation, four consumers: the nav spine, the verdict banner, the header
// verdict chip, and the "needs attention" rail all read from here — so nothing
// can disagree about what is blocked.
//
// Stages 01/02/03/06/07/08 have genuine pass/fail signals in the store. Replay,
// Swarm and Hermes do not (their state is local to their panels), so they read
// as visited/unvisited from the agent message log rather than inventing a
// verdict the pipeline never produced.

import type { Tab } from '../store/useStrategyStore'
import type { Status } from './ui'

export type StageTone = 'cleared' | 'blocked' | 'warn' | 'active' | 'pending'

export type StageReading = {
  id: Tab
  tone: StageTone
  note: string
}

/** The slice of store state this module reads. Keeps the signature honest. */
export type StageStatusInput = {
  symbol: string
  timeframe: string
  session: string
  canonicalSpec: unknown | null
  specValidation: { valid: boolean; issues: Array<{ path: string; message: string }> }
  pineCode: string
  lintResult: { passed: boolean; violations: string[]; warnings: string[] }
  parityResult: { passed: boolean; mismatchCount: number }
  backtestResult: { trades: unknown[]; metrics: Record<string, number | string | null>; equityCurve: unknown[] }
  riskResult: { score: number }
  deployStatus: string
  deployBlockers: string[]
  versionHistory: unknown[]
  pineVault: unknown[]
  agentMessages: Array<{ agent: string; level: string; message: string }>
}

const TONE_TO_COLOR: Record<StageTone, string> = {
  cleared: 'var(--blue)',
  blocked: 'var(--err)',
  warn: 'var(--warn)',
  active: 'var(--line-strong)',
  pending: 'transparent',
}

export const stageAccent = (tone: StageTone): string => TONE_TO_COLOR[tone]

export const toneToStatus = (tone: StageTone): Status =>
  tone === 'blocked' ? 'err' : tone === 'warn' ? 'warn' : tone === 'cleared' ? 'ok' : 'idle'

/** Most recent log line a given producer wrote, if any. */
function lastFrom(s: StageStatusInput, agent: string) {
  for (let i = s.agentMessages.length - 1; i >= 0; i -= 1) {
    if (s.agentMessages[i].agent === agent) return s.agentMessages[i]
  }
  return null
}

/** Stages whose only signal is "has this ever reported in?". */
function visited(s: StageStatusInput, agent: string, idle: string): StageReading['note'] | null {
  const m = lastFrom(s, agent)
  return m ? m.message : idle
}

export function deriveStageStatuses(s: StageStatusInput): Record<Tab, StageReading> {
  const specDrafted = s.canonicalSpec != null
  // A spec rehydrated from storage carries no validation result — that means
  // "not re-checked yet", not "invalid", so only real issues count as broken.
  const specBroken = specDrafted && s.specValidation.issues.length > 0
  const specValid = specDrafted && !specBroken
  const lintRan = s.lintResult.passed || s.lintResult.violations.length > 0 || s.lintResult.warnings.length > 0
  const parityRan = s.parityResult.passed || s.parityResult.mismatchCount > 0
  const hasBacktest = s.backtestResult.equityCurve.length > 0
  const saved = s.versionHistory.length + s.pineVault.length
  const gateBlocked = s.deployStatus === 'deploy_blocked'

  const intake: StageReading = {
    id: 'intake',
    tone: specDrafted ? 'cleared' : 'active',
    note: specDrafted ? `${s.symbol} · ${s.timeframe} · ${s.session}` : 'awaiting a spec',
  }

  const spec: StageReading = {
    id: 'spec',
    tone: specBroken ? 'blocked' : specValid ? 'cleared' : 'pending',
    note: specBroken
      ? `${s.specValidation.issues.length} validation issue${s.specValidation.issues.length === 1 ? '' : 's'}`
      : specValid
        ? `${(s.canonicalSpec as { entry?: { conditions?: unknown[] } })?.entry?.conditions?.length ?? 0} entry conditions`
        : 'not drafted',
  }

  const codegen: StageReading = {
    id: 'codegen',
    tone: !s.pineCode
      ? 'pending'
      : !lintRan
        ? 'cleared'
        : !s.lintResult.passed
          ? 'blocked'
          : s.lintResult.warnings.length > 0
            ? 'warn'
            : 'cleared',
    note: !s.pineCode
      ? 'no build loaded'
      : !s.lintResult.passed && lintRan
        ? s.lintResult.violations[0] ?? 'lint failed'
        : s.lintResult.warnings.length > 0
          ? s.lintResult.warnings[0]
          : `Pine v5 · ${s.pineCode.length.toLocaleString('en-US')} chars`,
  }

  const replay: StageReading = {
    id: 'replay',
    tone: lastFrom(s, 'Replay') ? 'cleared' : 'pending',
    note: visited(s, 'Replay', 'not replayed') ?? 'not replayed',
  }

  const swarm: StageReading = {
    id: 'swarm',
    tone: lastFrom(s, 'Swarm') ? 'cleared' : 'pending',
    note: visited(s, 'Swarm', '5 agents idle') ?? '5 agents idle',
  }

  const diagnostics: StageReading = {
    id: 'diagnostics',
    tone: gateBlocked ? 'blocked' : parityRan ? 'cleared' : 'pending',
    note: gateBlocked
      ? s.deployBlockers[0] ?? 'deploy blocked'
      : parityRan
        ? s.parityResult.passed
          ? 'parity aligned'
          : `${s.parityResult.mismatchCount} mismatch`
        : 'checks not run',
  }

  const backtest: StageReading = {
    id: 'backtest',
    tone: hasBacktest ? 'cleared' : 'pending',
    note: hasBacktest
      ? `${s.backtestResult.metrics.trades ?? 0} trades · net $${s.backtestResult.metrics.netProfit ?? 0}`
      : 'no run loaded',
  }

  const vault: StageReading = {
    id: 'vault',
    tone: saved > 0 ? 'cleared' : 'pending',
    note: saved > 0 ? `${saved} saved item${saved === 1 ? '' : 's'}` : 'awaiting a clean run',
  }

  const hermes: StageReading = {
    id: 'hermes',
    tone: lastFrom(s, 'Hermes') ? 'cleared' : 'pending',
    note: visited(s, 'Hermes', 'runtime not loaded') ?? 'runtime not loaded',
  }

  return { intake, spec, codegen, replay, swarm, diagnostics, backtest, vault, hermes }
}

export type AttentionItem = {
  kind: string
  where: Tab
  step: string
  tone: 'blocked' | 'warn'
  text: string
}

/**
 * Everything standing between the operator and a promotion, most severe first.
 * Derived from the same signals as the spine so the two can never disagree.
 */
export function deriveAttention(
  s: StageStatusInput,
  stepOf: (id: Tab) => string
): AttentionItem[] {
  const items: AttentionItem[] = []

  if (s.deployStatus === 'deploy_blocked') {
    for (const blocker of s.deployBlockers) {
      items.push({ kind: 'Blocking', where: 'diagnostics', step: stepOf('diagnostics'), tone: 'blocked', text: blocker })
    }
  }

  if (s.parityResult.mismatchCount > 0) {
    items.push({
      kind: 'Parity',
      where: 'diagnostics',
      step: stepOf('diagnostics'),
      tone: 'blocked',
      text: `${s.parityResult.mismatchCount} Pine trade${s.parityResult.mismatchCount === 1 ? ' has' : 's have'} no Python counterpart — the two execution paths disagree.`,
    })
  }

  for (const v of s.lintResult.violations) {
    items.push({ kind: 'Lint', where: 'codegen', step: stepOf('codegen'), tone: 'blocked', text: v })
  }

  const pf = s.backtestResult.metrics.profitFactor
  if (typeof pf === 'number' && s.backtestResult.equityCurve.length > 0 && pf < 1.5) {
    items.push({
      kind: 'Below gate',
      where: 'backtest',
      step: stepOf('backtest'),
      tone: pf < 1 ? 'blocked' : 'warn',
      text: `Profit factor ${pf} — the deploy gate needs 1.50 or better.`,
    })
  }

  const expectancy = s.backtestResult.metrics.expectancy
  if (typeof expectancy === 'number' && expectancy < 0) {
    items.push({
      kind: 'Negative edge',
      where: 'backtest',
      step: stepOf('backtest'),
      tone: 'warn',
      text: `Expectancy ${expectancy}R per trade over ${s.backtestResult.metrics.trades ?? 0} trades.`,
    })
  }

  for (const w of s.lintResult.warnings) {
    items.push({ kind: 'Warning', where: 'codegen', step: stepOf('codegen'), tone: 'warn', text: w })
  }

  if (s.riskResult.score > 0 && s.riskResult.score < 80) {
    items.push({
      kind: 'Risk',
      where: 'diagnostics',
      step: stepOf('diagnostics'),
      tone: 'warn',
      text: `Risk score ${s.riskResult.score} — below the 80 threshold.`,
    })
  }

  return items.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'blocked' ? -1 : 1))
}
