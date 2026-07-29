// src/features/swarm/components/AgentCard.tsx
//
// One agent in the roster. Selecting it opens that agent's thread in the panel
// beside the list — the conversation lives there rather than inside the card,
// so history survives switching between agents.
export type AgentHealth = 'online' | 'offline' | 'checking'

function healthDot(status: AgentHealth) {
  if (status === 'online') return 'ac-dot--online'
  if (status === 'offline') return 'ac-dot--offline'
  return 'ac-dot--checking'
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

export function AgentCard({
  agentName,
  role,
  model,
  skillTag,
  agentStatus,
  selected,
  messageCount,
  onSelect,
}: {
  agentName: string
  role: string
  model: string
  skillTag: string
  agentStatus: AgentHealth
  selected: boolean
  messageCount: number
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`agent-pick${selected ? ' agent-pick--on' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="agent-pick-head">
        <span className="agent-pick-avatar" aria-hidden>{initials(agentName)}</span>
        <span className="agent-pick-name">{agentName}</span>
        <span className={`ac-dot ${healthDot(agentStatus)}`} aria-hidden />
        <span className="rail-spacer" />
        <span className="skill-tag-pill">{skillTag}</span>
      </span>
      <span className="agent-pick-role">{role}</span>
      <span className="agent-pick-meta">
        {model} · {messageCount} msg{messageCount === 1 ? '' : 's'}
      </span>
    </button>
  )
}
