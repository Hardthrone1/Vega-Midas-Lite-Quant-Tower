// src/app/layout/PortalNav.tsx
// Azure Portal-style left navigation rail. Expanded: icon + step + label.
// Collapsed: icon-only with tooltips, exactly like the portal's resource menu.
import type { CSSProperties } from 'react'
import { Tab, TabList, Tooltip } from '@fluentui/react-components'
import type { Tab as WorkflowTab } from '../../store/useStrategyStore'
import { BLADES } from './blades'

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
          return expanded ? (
            tab
          ) : (
            <Tooltip key={blade.id} content={`${blade.step} · ${blade.label}`} relationship="label" positioning="after">
              {tab}
            </Tooltip>
          )
        })}
      </TabList>
    </nav>
  )
}
