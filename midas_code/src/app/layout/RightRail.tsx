// src/app/layout/RightRail.tsx
// The constant column: what needs a decision, what the agents just did, and a
// way to ask about any of it — none of which should depend on which stage is open.
import type { Tab } from '../../store/useStrategyStore'
import { AgentTimelinePanel } from '../../features/agent-timeline/components/AgentTimelinePanel'
import { NeedsAttentionPanel } from '../../features/attention/components/NeedsAttentionPanel'
import { AskVegaPanel } from '../../features/ask-vega/components/AskVegaPanel'

export function RightRail({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  return (
    <aside className="portal-rail" aria-label="Run context">
      <NeedsAttentionPanel onNavigate={onNavigate} />
      <AgentTimelinePanel />
      <AskVegaPanel />
    </aside>
  )
}
