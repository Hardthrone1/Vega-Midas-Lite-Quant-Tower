// src/features/agent-timeline/components/AgentTimelinePanel.tsx
import { useEffect, useRef, type CSSProperties } from 'react'
import { Button, Empty, StatusDot } from '../../../shared/ui'
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
    <section className="agent-timeline-panel">
      {/* Single-row unified header */}
      <header className="flex items-center justify-between gap-4 px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="flex items-baseline gap-2 flex-1 min-w-0">
          <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Live</span>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">Agent timeline</h1>
        </div>
        <div className="flex-shrink-0">
          {agentMessages.length > 0 && <Button onClick={clearAgentMessages} aria-label="Clear agent timeline">Clear</Button>}
        </div>
      </header>
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
    </section>
  )
}
