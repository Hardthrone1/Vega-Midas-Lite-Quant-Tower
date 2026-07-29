// src/features/swarm/components/AgentThreadPanel.tsx
//
// One conversation per agent. Each agent keeps its own history so switching
// between them resumes where you left off, and a broadcast puts the same
// question to all five lanes at once.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

export type SwarmTurn = {
  id: string
  who: 'you' | 'agent'
  text: string
  time: string
  failed?: boolean
}

export type SwarmAgent = {
  name: string
  role: string
  model: string
  tier: string
}

const initials = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

export function AgentThreadPanel({
  agent,
  turns,
  busy,
  online,
  onSend,
  onBroadcast,
  agentCount,
}: {
  agent: SwarmAgent
  turns: SwarmTurn[]
  busy: boolean
  online: boolean
  onSend: (text: string) => void
  onBroadcast: (text: string) => void
  agentCount: number
}) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, busy])

  const submit = (broadcast: boolean) => {
    const text = draft.trim()
    if (!text || !online) return
    if (broadcast) onBroadcast(text)
    else onSend(text)
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(false)
    }
  }

  return (
    <section className="swarm-thread">
      <header className="swarm-thread-head">
        <span className="swarm-thread-avatar" aria-hidden>{initials(agent.name)}</span>
        <div className="swarm-thread-id">
          <div className="swarm-thread-name">{agent.name}</div>
          <div className="swarm-thread-meta">{agent.role} · {agent.model}</div>
        </div>
        <span className="rail-spacer" />
        <button
          type="button"
          className="swarm-broadcast"
          onClick={() => submit(true)}
          disabled={!online || !draft.trim()}
          title={draft.trim() ? `Send to all ${agentCount} agents` : 'Type a message to broadcast'}
        >
          Broadcast to all {agentCount}
        </button>
      </header>

      <div className="swarm-thread-body">
        {turns.length === 0 && (
          <p className="swarm-thread-empty">
            No messages yet. Ask {agent.name} about the run — it answers on its own {agent.tier.toLowerCase()} lane.
          </p>
        )}
        {turns.map((t) => (
          <div key={t.id} className={`chat-row chat-row--${t.who === 'you' ? 'user' : 'assistant'}`}>
            <div className="chat-bubble">
              <div className="chat-bubble-head">
                <span className="chat-who">{t.who === 'you' ? 'You' : agent.name}</span>
                <span className="chat-time">{t.time}</span>
              </div>
              <div className="chat-text" style={t.failed ? { color: 'var(--err)' } : undefined}>{t.text}</div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="chat-row chat-row--assistant" role="status" aria-busy="true">
            <div className="chat-bubble">
              <div className="chat-typing" aria-hidden><span /><span /><span /></div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="chat-composer">
        <label htmlFor="swarm-composer" className="sr-only">Message {agent.name}</label>
        <textarea
          id="swarm-composer"
          className="chat-input"
          rows={2}
          placeholder={online ? `Message ${agent.name}…` : 'Gateway offline — run: node Vega_Gateway_Server.js'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={!online}
        />
        <button
          type="button"
          className="chat-send"
          onClick={() => submit(false)}
          disabled={!online || !draft.trim()}
          aria-label="Send message"
        >
          ↑
        </button>
      </div>
    </section>
  )
}
