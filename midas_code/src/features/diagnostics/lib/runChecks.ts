// src/features/diagnostics/lib/runChecks.ts
//
// The deploy-gate check sequence, extracted so the global "Run checks" control
// in the header and the Diagnostics stage drive exactly the same pipeline.
//
// Parity comes from the real divergence report; lint and risk remain demo
// values until their pipeline stages exist (unchanged from before this moved).
import { useStrategyStore } from '../../../store/useStrategyStore'
import { loadDivergenceReport, toParityResult } from '../../../shared/adapters/parityReportAdapter'

export type CheckStep = 'lint' | 'risk' | 'parity' | 'gate'

export const CHECK_STEPS: Array<{ id: CheckStep; label: string }> = [
  { id: 'lint', label: 'Lint' },
  { id: 'risk', label: 'Risk' },
  { id: 'parity', label: 'Parity' },
  { id: 'gate', label: 'Gate' },
]

/** Reveal cadence for the header's streaming readout. */
export const CHECK_STEP_MS = 620

export async function runDiagnosticChecks(onStep?: (step: CheckStep) => void): Promise<void> {
  const store = useStrategyStore.getState()
  if (!store.canonicalSpec) return

  const pause = () => new Promise((r) => setTimeout(r, CHECK_STEP_MS))

  onStep?.('lint')
  store.setLintResult({ passed: true, violations: [], warnings: ['No session filter on intrabar mode'] })
  store.addAgentMessage({ agent: 'Lint', level: 'success', message: 'Lint passed (1 warning) [demo]' })
  await pause()

  onStep?.('risk')
  store.setRiskResult({ score: 84, var: 0.021, kelly: 0.18, sharpe: 1.32, drawdown: 0.094 })
  store.addAgentMessage({ agent: 'Risk', level: 'success', message: 'Risk score 84 — above threshold [demo]' })
  await pause()

  onStep?.('parity')
  const report = await loadDivergenceReport()
  if (!report) {
    store.addAgentMessage({
      agent: 'Parity',
      level: 'error',
      message: 'divergence_report.json not found — run parity_validator.py and sync-parity-data',
    })
    return
  }
  const parity = toParityResult(report)
  store.setParityResult(parity)
  const s = report.summary
  store.addAgentMessage({
    agent: 'Parity',
    level: parity.passed ? 'success' : 'warn',
    message: `Parity ${s.overall_status}: ${s.pass_count}/${s.matched_trades} matched trades pass, ${s.fail_count} divergent, ${s.unmatched_python + s.unmatched_pine} unmatched`,
  })
  await pause()

  onStep?.('gate')
  const after = useStrategyStore.getState()
  store.addAgentMessage({
    agent: 'Gate',
    level: after.deployStatus === 'deploy_blocked' ? 'error' : 'success',
    message:
      after.deployStatus === 'deploy_blocked'
        ? `Deploy blocked — ${after.deployBlockers[0] ?? 'a gate is holding'}`
        : 'All gates cleared',
  })
}
