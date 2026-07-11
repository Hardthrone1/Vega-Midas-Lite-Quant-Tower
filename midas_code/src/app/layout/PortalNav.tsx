// src/app/layout/PortalNav.tsx
// Azure Portal-style left navigation rail. Expanded: icon + step + label.
// Collapsed: icon-only with tooltips, exactly like the portal's resource menu.
import type { CSSProperties } from 'react'
import { Tab, TabList, Tooltip } from '@fluentui/react-components'
import type { Tab as WorkflowTab } from '../../store/useStrategyStore'
import { BLADES, type BladeDefinition } from './blades'

// Rich tooltip: step + label headline, description underneath. The description
// is the same field that renders as the blade subtitle, so the two never drift.
function NavTooltip({ blade }: { blade: BladeDefinition }) {
  return (
    <span className="nav-tooltip">
      <span className="nav-tooltip-head">
        <span className="nav-tooltip-step mono">{blade.step}</span>
        <span className="nav-tooltip-label">{blade.label}</span>
      </span>
      <span className="nav-tooltip-desc">{blade.description}</span>
    </span>
  )
}

export function PortalNav({
  expanded,
  activeTab,
  onSelect,
}: {
  expanded: boolean
  activeTab: WorkflowTab
  onSelect: (tab: WorkflowTab) => void
}) {
  return (
    <nav
      className={`portal-nav${expanded ? '' : ' portal-nav--collapsed'}`}
      aria-label="Workflow steps"
    >
      <TabList
        vertical
        appearance="subtle"
        selectedValue={activeTab}
        onTabSelect={(_, data) => onSelect(data.value as WorkflowTab)}
        className="portal-nav-tabs"
      >
        {BLADES.map((blade, i) => {
          const Icon = blade.icon
          const tab = (
            <Tab
              key={blade.id}
              value={blade.id}
              icon={<Icon />}
              aria-label={`${blade.step} ${blade.label}`}
              className="stagger-item"
              style={{ '--stagger-i': i } as CSSProperties}
            >
              {expanded && (
                <span className="portal-nav-item">
                  <span className="portal-nav-step mono">{blade.step}</span>
                  <span className="portal-nav-label">{blade.label}</span>
                </span>
              )}
            </Tab>
          )
          // When the rail is expanded, the step + label are already visible, so
          // the hover tooltip is redundant noise — only show it in the collapsed
          // (icon-only) rail. Description is fed from the same blades.tsx config
          // that drives the blade subtitle — one source of truth for the step.
          if (expanded) return tab
          return (
            <Tooltip
              key={blade.id}
              content={{ children: <NavTooltip blade={blade} />, className: 'nav-tooltip-surface' }}
              relationship="description"
              positioning="after"
              withArrow
            >
              {tab}
            </Tooltip>
          )
        })}
      </TabList>
    </nav>
  )
}
