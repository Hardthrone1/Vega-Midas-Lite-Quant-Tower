// src/app/layout/VerdictBanner.tsx
// The deploy verdict as a full-bleed band directly under the spine: the answer
// to "can I ship this" should not be a badge you have to hunt for.
import { useStrategyStore, type Tab } from '../../store/useStrategyStore'

export function VerdictBanner({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const deployStatus = useStrategyStore((s) => s.deployStatus)
  const deployBlockers = useStrategyStore((s) => s.deployBlockers)
  const parityResult = useStrategyStore((s) => s.parityResult)

  const blocked = deployStatus === 'deploy_blocked'
  const ready = deployStatus === 'deploy_ready'

  // Mid-pipeline states get no band — the spine already says where the run is.
  if (!blocked && !ready) return null

  if (blocked) {
    const reason =
      deployBlockers[0] ??
      (parityResult.mismatchCount > 0
        ? `${parityResult.mismatchCount} Pine trade(s) have no Python counterpart.`
        : 'A gate is holding this run.')
    return (
      <section className="verdict-band verdict-band--blocked" aria-live="polite">
        <span className="verdict-dot" aria-hidden />
        <span className="verdict-headline">DEPLOY BLOCKED</span>
        <span className="verdict-rule" aria-hidden />
        <span className="verdict-text">{reason}</span>
        <span className="verdict-spacer" />
        <button type="button" className="verdict-cta" onClick={() => onNavigate('diagnostics')}>
          Inspect parity →
        </button>
      </section>
    )
  }

  return (
    <section className="verdict-band verdict-band--ready" aria-live="polite">
      <span className="verdict-dot" aria-hidden />
      <span className="verdict-headline">DEPLOY READY</span>
      <span className="verdict-rule" aria-hidden />
      <span className="verdict-text">
        Every gate cleared. Pine and Python reconcile, and risk is inside tolerance.
      </span>
      <span className="verdict-spacer" />
      <button type="button" className="verdict-cta" onClick={() => onNavigate('vault')}>
        Promote to vault →
      </button>
    </section>
  )
}
