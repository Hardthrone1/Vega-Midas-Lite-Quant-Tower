// src/app/layout/AppShell.tsx
import { lazy, Suspense, useState } from 'react'
import { ChevronDown, ChevronUp, Radio } from 'lucide-react'
import { TopStatusBar } from './TopStatusBar'
import { AgentTimelinePanel } from '../../features/agent-timeline/components/AgentTimelinePanel'
import { useStrategyStore } from '../../store/useStrategyStore'
import { mainIconMap, VegaIcon } from '../../shared/vega/icons'

const StrategyIntakePanel = lazy(() =>
  import('../../features/strategy-intake/components/StrategyIntakePanel').then((m) => ({
    default: m.StrategyIntakePanel,
  }))
)
const CanonicalSpecPanel = lazy(() =>
  import('../../features/canonical-spec/components/CanonicalSpecPanel').then((m) => ({
    default: m.CanonicalSpecPanel,
  }))
)
const ReplayPanel = lazy(() =>
  import('../../features/replay/components/ReplayPanel').then((m) => ({
    default: m.ReplayPanel,
  }))
)
const SwarmPanel = lazy(() =>
  import('../../features/swarm/components/SwarmPanel').then((m) => ({
    default: m.SwarmPanel,
  }))
)
const DiagnosticsPanel = lazy(() =>
  import('../../features/diagnostics/components/DiagnosticsPanel').then((m) => ({
    default: m.DiagnosticsPanel,
  }))
)
const BacktestPanel = lazy(() =>
  import('../../features/backtest/components/BacktestPanel').then((m) => ({
    default: m.BacktestPanel,
  }))
)
const VaultPanel = lazy(() =>
  import('../../features/vault/components/VaultPanel').then((m) => ({
    default: m.VaultPanel,
  }))
)

const TABS = [
  { id: 'intake',      label: 'Intake',      step: '01' },
  { id: 'spec',        label: 'Spec',        step: '02' },
  { id: 'replay',      label: 'Replay',      step: '03' },
  { id: 'swarm',       label: 'Swarm',       step: '04' },
  { id: 'diagnostics', label: 'Diagnostics', step: '05' },
  { id: 'backtest',    label: 'Backtest',    step: '06' },
  { id: 'vault',       label: 'Vault',       step: '07' },
] as const

function tabId(id: string) {
  return `workflow-tab-${id}`
}

function tabPanelId(id: string) {
  return `workflow-tabpanel-${id}`
}

function TabStageFallback() {
  return (
    <div className="tab-stage-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading workflow step…</span>
    </div>
  )
}

export function AppShell() {
  const { activeTab, setActiveTab } = useStrategyStore()
  const [railOpen, setRailOpen] = useState(true)
  const [timelineOpen, setTimelineOpen] = useState(true)

  return (
    <div className="shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <TopStatusBar />

      <div className={`shell-body${railOpen ? '' : ' rail-closed'}`}>
        <aside className={`shell-left${railOpen ? '' : ' shell-left--hidden'}`} aria-label="Agent timeline sidebar">
          <div className="rail-header">
            <span className="eyebrow rail-header-title">Control Tower</span>
            <button
              type="button"
              className="rail-collapse-btn-inner vega-icon-btn"
              onClick={() => setRailOpen(false)}
              aria-label="Collapse agent timeline sidebar"
            >{'<'}</button>
          </div>

          <div className="rail-scroll">
            <button
              type="button"
              className="intake-drawer-toggle"
              onClick={() => setTimelineOpen((o) => !o)}
              aria-expanded={timelineOpen}
              aria-controls="agent-timeline-panel"
            >
              <Radio size={14} className="tab-icon live-indicator" aria-hidden />
              <span className="eyebrow live-text status-live">Live</span>
              <span className="intake-drawer-toggle-label">Agent Timeline</span>
              <span className="intake-drawer-toggle-arrow vega-icon-btn" aria-hidden>
                {timelineOpen ? <ChevronUp size={12} strokeWidth={1.75} /> : <ChevronDown size={12} strokeWidth={1.75} />}
              </span>
            </button>
            {timelineOpen && (
              <div id="agent-timeline-panel" className="intake-drawer-body">
                <AgentTimelinePanel />
              </div>
            )}
          </div>
        </aside>

        <main id="main-content" className="shell-center" tabIndex={-1}>
          <nav className="tabs" role="tablist" aria-label="VEGA workflow steps">
            {TABS.map((t) => {
              const icon = mainIconMap[t.step]
              const selected = activeTab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={tabId(t.id)}
                  aria-selected={selected}
                  aria-controls={tabPanelId(t.id)}
                  tabIndex={selected ? 0 : -1}
                  className={`tab ${selected ? 'tab-on' : ''}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  {icon && <VegaIcon icon={icon} className="tab-icon" />}
                  <span className="tab-step mono">{t.step}</span>
                  <span className="tab-label">{t.label}</span>
                </button>
              )
            })}
          </nav>

          <div
            className="tab-stage"
            role="tabpanel"
            id={tabPanelId(activeTab)}
            aria-labelledby={tabId(activeTab)}
          >
            <Suspense fallback={<TabStageFallback />}>
              {activeTab === 'intake'      && <StrategyIntakePanel />}
              {activeTab === 'spec'        && <CanonicalSpecPanel />}
              {activeTab === 'replay'      && <ReplayPanel />}
              {activeTab === 'swarm'       && <SwarmPanel />}
              {activeTab === 'diagnostics' && <DiagnosticsPanel />}
              {activeTab === 'backtest'    && <BacktestPanel />}
              {activeTab === 'vault'       && <VaultPanel />}
            </Suspense>
          </div>
        </main>
      </div>

      {!railOpen && (
        <button
          type="button"
          className="rail-open-tab vega-icon-btn"
          onClick={() => setRailOpen(true)}
          aria-label="Open agent timeline sidebar"
        >{'>'}</button>
      )}
    </div>
  )
}