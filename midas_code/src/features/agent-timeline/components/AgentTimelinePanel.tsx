// src/features/agent-timeline/components/AgentTimelinePanel.tsx
import { useEffect, useRef, type CSSProperties } from 'react'
import { Panel, Button, Empty, StatusDot } from '../../../shared/ui'
import { useStrategyStore } from '../../../store/useStrategyStore'
import type { Status } from '../../../shared/ui'

const levelToStatus: Record<string, Status> = {
  info: 'info', warn: 'warn', error: 'err', success: 'ok',
}

export function AgentTimelinePanel() {
  const { agentMessages, clearAgentMessages } = useStrategyStore()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentMessages.length])

  return (
    <Panel eyebrow="Live" title="Agent timeline" actions={
      agentMessages.length > 0 ? <Button onClick={clearAgentMessages} aria-label="Clear agent timeline">Clear</Button> : null
    }>
      {agentMessages.length === 0 ? (
        <Empty>Agent activity appears here as the pipeline runs.</Empty>
      ) : (
        <div className="feed" role="log" aria-live="polite" aria-relevant="additions" aria-label="Agent activity log">
          {agentMessages.map((m, i) => (
            <div
              key={m.id}
              className="feed-row stagger-item"
              style={{ '--stagger-i': Math.min(i, 6) } as CSSProperties}
            >
              <StatusDot status={levelToStatus[m.level] ?? 'info'} />
              <span className="feed-agent mono">{m.agent}</span>
              <span className="feed-msg">{m.message}</span>
              <span className="feed-time mono">
                <time dateTime={m.timestamp}>{new Date(m.timestamp).toLocaleTimeString()}</time>
              </span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </Panel>
  )
}
