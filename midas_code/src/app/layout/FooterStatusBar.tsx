// src/app/layout/FooterStatusBar.tsx
// Persistent run context along the bottom edge — what is loaded, and whether
// the gate is holding.
import { useStrategyStore } from '../../store/useStrategyStore'
import { deployLabel } from '../../shared/deployStatus'

export function FooterStatusBar() {
  const symbol = useStrategyStore((s) => s.symbol)
  const timeframe = useStrategyStore((s) => s.timeframe)
  const session = useStrategyStore((s) => s.session)
  const strategyId = useStrategyStore((s) => s.strategyId)
  const deployStatus = useStrategyStore((s) => s.deployStatus)
  const trades = useStrategyStore((s) => s.backtestResult.metrics.trades)
  const pineChars = useStrategyStore((s) => s.pineCode.length)

  const blocked = deployStatus === 'deploy_blocked'
  const items = [
    `${symbol} · ${timeframe} · ${session}`,
    strategyId ? `strategy ${strategyId.slice(0, 14)}` : 'no strategy id',
    trades ? `${trades} trades loaded` : 'no backtest loaded',
    pineChars ? `pine ${pineChars.toLocaleString('en-US')} chars` : 'no pine build',
  ]

  return (
    <footer className="portal-footer">
      {items.map((text) => (
        <span key={text} className="portal-footer-item">
          {text}
        </span>
      ))}
      <span className="portal-footer-spacer" />
      <span
        className="portal-footer-verdict"
        style={{ color: blocked ? 'var(--err)' : deployStatus === 'deploy_ready' ? 'var(--blue)' : 'var(--ink-3)' }}
      >
        {deployLabel(deployStatus)}
      </span>
    </footer>
  )
}
