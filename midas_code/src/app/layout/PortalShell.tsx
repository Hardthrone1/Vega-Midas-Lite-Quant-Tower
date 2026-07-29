// src/app/layout/PortalShell.tsx
// The application shell:
//   header · nav spine · verdict band · stage workspace + right rail · status bar.
// Replaces the Azure-Portal blade stack — one stage is visible at a time and the
// spine carries both navigation and per-stage state.
import { useCallback } from 'react'
import { useStrategyStore, type Tab } from '../../store/useStrategyStore'
import { ChartOverlay } from '../../shared/chart/ChartOverlay'
import { FooterStatusBar } from './FooterStatusBar'
import { NavSpine } from './NavSpine'
import { PortalHeader } from './PortalHeader'
import { RightRail } from './RightRail'
import { StageHost } from './StageHost'
import { VerdictBanner } from './VerdictBanner'

export function PortalShell() {
  const activeTab = useStrategyStore((s) => s.activeTab)
  const setActiveTab = useStrategyStore((s) => s.setActiveTab)

  const navigate = useCallback((tab: Tab) => setActiveTab(tab), [setActiveTab])

  return (
    <div className="portal-root">
      <a href="#portal-content" className="skip-link">
        Skip to main content
      </a>

      <PortalHeader />
      <NavSpine activeTab={activeTab} onSelect={navigate} />
      <VerdictBanner onNavigate={navigate} />

      <div className="portal-body">
        <main id="portal-content" className="portal-main" tabIndex={-1}>
          <StageHost tab={activeTab} />
        </main>
        <RightRail onNavigate={navigate} />
      </div>

      <FooterStatusBar />
      <ChartOverlay />
    </div>
  )
}
