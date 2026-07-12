// src/app/layout/PortalHeader.tsx
// Azure Portal-style top command bar: hamburger, product brand, global search,
// trading context, deploy status, and utility buttons (agent console, agent
// activity pane, theme toggle, account).
import { lazy, Suspense, useState, useCallback } from 'react'
import { flushSync } from 'react-dom'
import {
  Avatar,
  Badge,
  Button,
  SearchBox,
  Tooltip,
} from '@fluentui/react-components'
import {
  Alert24Regular,
  Navigation24Regular,
  WeatherMoon24Regular,
  WeatherSunny24Regular,
  WindowConsole20Regular,
} from '@fluentui/react-icons'
import { useStrategyStore } from '../../store/useStrategyStore'
import { deployLabel, deployStatusKind } from '../../shared/deployStatus'
import { useThemeMode } from '../theme/ThemeProvider'
import type { Status } from '../../shared/ui'

const AgentConsole = lazy(() =>
  import('../../features/agent-console/components/AgentConsole').then((m) => ({
    default: m.AgentConsole,
  }))
)

const BADGE_COLOR: Record<Status, 'success' | 'warning' | 'danger' | 'informative' | 'subtle'> = {
  ok: 'success',
  warn: 'warning',
  err: 'danger',
  info: 'informative',
  idle: 'subtle',
}

export function PortalHeader({
  onToggleNav,
  timelineOpen,
  onToggleTimeline,
}: {
  onToggleNav: () => void
  timelineOpen: boolean
  onToggleTimeline: () => void
}) {
  const { symbol, session, executionMode, strategyId, deployStatus } = useStrategyStore()
  const { mode, toggleMode } = useThemeMode()
  const [consoleOpen, setConsoleOpen] = useState(false)

  const handleThemeToggle = useCallback((e: React.MouseEvent) => {
    document.documentElement.style.setProperty('--cx', e.clientX + 'px')
    document.documentElement.style.setProperty('--cy', e.clientY + 'px')
    // Must be invoked ON document — detaching the method loses its native
    // receiver and throws "Illegal invocation", silently killing the toggle.
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    if (typeof doc.startViewTransition === 'function') {
      doc.startViewTransition(() => { flushSync(toggleMode) })
    } else {
      toggleMode()
    }
  }, [toggleMode])

  const kind = deployStatusKind(deployStatus)
  const deployText = deployLabel(deployStatus)

  return (
    <header className="portal-header">
      <div className="portal-header-left">
        <Button
          appearance="transparent"
          className="portal-header-iconbtn"
          icon={<Navigation24Regular />}
          onClick={onToggleNav}
          aria-label="Toggle navigation sidebar"
        />
        <span className="portal-header-brand">
          <span className="portal-header-product">VEGA</span>
          <span className="portal-header-sub">Strategy Control Tower</span>
        </span>
      </div>

      <div className="portal-header-search">
        <SearchBox
          appearance="filled-lighter"
          size="small"
          placeholder="Search strategies, specs, and versions"
          aria-label="Global search"
        />
      </div>

      <div className="portal-header-right">
        <div className="portal-header-context mono" aria-label="Trading context">
          <ContextItem label="symbol" value={symbol} />
          <ContextItem label="session" value={session} />
          <ContextItem label="mode" value={executionMode} />
          <ContextItem label="strategy" value={strategyId ? strategyId.slice(0, 14) : '—'} />
        </div>

        <Badge appearance="tint" color={BADGE_COLOR[kind]} className="portal-header-deploy">
          {deployText}
        </Badge>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          Deploy status: {deployText}
        </p>

        <Tooltip content={consoleOpen ? 'Close agent console' : 'Open agent console'} relationship="label">
          <Button
            appearance="transparent"
            className="portal-header-iconbtn"
            icon={<WindowConsole20Regular />}
            onClick={() => setConsoleOpen((o) => !o)}
            aria-expanded={consoleOpen}
            aria-controls="agent-console-panel"
          />
        </Tooltip>

        <Tooltip content={timelineOpen ? 'Hide agent activity' : 'Show agent activity'} relationship="label">
          <Button
            appearance="transparent"
            className="portal-header-iconbtn"
            icon={<Alert24Regular />}
            onClick={onToggleTimeline}
            aria-pressed={timelineOpen}
          />
        </Tooltip>

        <Tooltip content={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} relationship="label">
          <Button
            appearance="transparent"
            className="portal-header-iconbtn"
            icon={mode === 'dark' ? <WeatherSunny24Regular /> : <WeatherMoon24Regular />}
            onClick={handleThemeToggle}
          />
        </Tooltip>

        <Avatar name="Vega Operator" size={28} color="colorful" className="portal-header-avatar" />
      </div>

      {consoleOpen && (
        <Suspense fallback={null}>
          <AgentConsole open={consoleOpen} onClose={() => setConsoleOpen(false)} />
        </Suspense>
      )}
    </header>
  )
}

function ContextItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="portal-ctx-item">
      <span className="portal-ctx-label">{label}</span>
      <span className="portal-ctx-value">{value}</span>
    </div>
  )
}
