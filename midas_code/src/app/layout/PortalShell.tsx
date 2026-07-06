// src/app/layout/PortalShell.tsx
// The Azure Portal-style application shell:
//   header (command bar) · left nav rail · blade workspace · right context pane.
// Replaces the old three-column AppShell + tab strip.
import { useMemo, useState } from 'react'
import {
  Button,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  InlineDrawer,
} from '@fluentui/react-components'
import { Dismiss20Regular } from '@fluentui/react-icons'
import { useStrategyStore, type Tab } from '../../store/useStrategyStore'
import { AgentTimelinePanel } from '../../features/agent-timeline/components/AgentTimelinePanel'
import { BladeContext, type BladeApi } from './blades'
import { BladeHost } from './BladeHost'
import { PortalHeader } from './PortalHeader'
import { PortalNav } from './PortalNav'

export function PortalShell() {
  const activeTab = useStrategyStore((s) => s.activeTab)
  const setActiveTab = useStrategyStore((s) => s.setActiveTab)

  const [navExpanded, setNavExpanded] = useState(true)
  const [timelineOpen, setTimelineOpen] = useState(true)
  const [stack, setStack] = useState<Tab[]>(() => [activeTab])
  const [maximized, setMaximized] = useState<Tab | null>(null)

  const bladeApi = useMemo<BladeApi>(
    () => ({
      stack,
      maximized,
      resetTo: (tab) => {
        setStack([tab])
        setMaximized(null)
        setActiveTab(tab)
      },
      openBlade: (tab) => {
        const i = stack.indexOf(tab)
        setStack(i === -1 ? [...stack, tab] : stack.slice(0, i + 1))
        setMaximized(null)
        setActiveTab(tab)
      },
      closeBlade: (tab) => {
        const i = stack.indexOf(tab)
        if (i <= 0) return
        const next = stack.slice(0, i)
        setStack(next)
        setActiveTab(next[next.length - 1])
        if (maximized === tab) setMaximized(null)
      },
      toggleMaximize: (tab) => setMaximized((m) => (m === tab ? null : tab)),
    }),
    [stack, maximized, setActiveTab]
  )

  return (
    <div className="portal-root">
      <a href="#portal-content" className="skip-link">
        Skip to main content
      </a>

      <PortalHeader
        onToggleNav={() => setNavExpanded((v) => !v)}
        timelineOpen={timelineOpen}
        onToggleTimeline={() => setTimelineOpen((v) => !v)}
      />

      <div className="portal-body">
        <BladeContext.Provider value={bladeApi}>
          <PortalNav expanded={navExpanded} activeTab={stack[0]} onSelect={bladeApi.resetTo} />

          <main id="portal-content" className="portal-main" tabIndex={-1}>
            <BladeHost />
          </main>
        </BladeContext.Provider>

        <InlineDrawer
          separator
          position="end"
          open={timelineOpen}
          className="portal-context-pane"
        >
          <DrawerHeader>
            <DrawerHeaderTitle
              action={
                <Button
                  appearance="subtle"
                  icon={<Dismiss20Regular />}
                  aria-label="Close agent activity pane"
                  onClick={() => setTimelineOpen(false)}
                />
              }
            >
              Agent activity
            </DrawerHeaderTitle>
          </DrawerHeader>
          <DrawerBody className="portal-context-body">
            <AgentTimelinePanel />
          </DrawerBody>
        </InlineDrawer>
      </div>
    </div>
  )
}
