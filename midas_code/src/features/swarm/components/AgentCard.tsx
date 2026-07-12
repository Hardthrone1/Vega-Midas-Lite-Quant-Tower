// src/features/swarm/components/AgentCard.tsx
//
// Prism glass command card for one swarm agent. Collapsed it is a single
// click target (hover lift + "›_" cue make the affordance explicit); open it
// holds a per-agent console: command input → Execute → gateway call on the
// agent's provider lane → response streamed token-by-token behind a live
// terminal cursor. Class contract follows the VEGA Prism spec:
// .vega-glass-panel, .status-live, .avatar-spin, .prism-btn-primary.is-playing,
// the exact .ac-typing DOM, and .ac-dot--online|offline|checking health dots.
import { useCallback, useEffect, useRef, useState } from 'react'

export type AgentHealth = 'online' | 'offline' | 'checking'

// GLOBAL DASHBOARD HEALTH: map status to the exact shared class strings
function getHealthDot(status: AgentHealth) {
  if (status === 'online') return 'ac-dot--online'
  if (status === 'offline') return 'ac-dot--offline'
  return 'ac-dot--checking'
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

const STREAM_TICK_MS = 45

export function AgentCard({
  agentName,
  role,
  model,
  skillTag,
  agentStatus,
  open,
  onToggle,
  onExecute,
}: {
  agentName: string
  role: string
  model: string
  skillTag: string
  agentStatus: AgentHealth
  open: boolean
  onToggle: () => void
  onExecute: (command: string) => Promise<string>
}) {
  // MANDATORY REACT MAPPING STANDARD: async execution is local card state
  const [isExecuting, setIsExecuting] = useState(false)
  const [command, setCommand] = useState('')
  const [tokens, setTokens] = useState<string[]>([])
  const [revealed, setRevealed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const responseRef = useRef<HTMLDivElement>(null)

  const streaming = revealed < tokens.length

  // Token-by-token reveal — the CSS ::after cursor rides the end of
  // .stream-output as words append, exactly like the reference demo.
  useEffect(() => {
    if (!streaming) return
    const id = window.setInterval(() => {
      setRevealed((r) => Math.min(r + 1, tokens.length))
    }, STREAM_TICK_MS)
    return () => window.clearInterval(id)
  }, [streaming, tokens.length])

  // Opening the console moves focus straight into the command line.
  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 140)
    return () => window.clearTimeout(id)
  }, [open])

  // Keep the live cursor in view as long responses scroll the container.
  useEffect(() => {
    const el = responseRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [revealed])

  const handleAgentExecution = useCallback(async () => {
    const cmd = command.trim()
    if (!cmd || isExecuting || agentStatus !== 'online') return
    setIsExecuting(true)
    setError(null)
    setTokens([])
    setRevealed(0)
    try {
      const result = await onExecute(cmd)
      setTokens(result.split(/\s+/).filter(Boolean))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsExecuting(false)
    }
  }, [command, isExecuting, agentStatus, onExecute])

  const showResponse = isExecuting || error !== null || tokens.length > 0

  return (
    <div
      className={[
        'vega-glass-panel agent-card',
        isExecuting ? 'status-live' : '',
        open ? 'agent-card--open' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* HEADER — the whole strip is the open/close affordance */}
      <button
        type="button"
        className="agent-header"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${agentName} — ${open ? 'close' : 'open'} command console`}
      >
        <div className="agent-identity">
          <div className={`agent-avatar ${isExecuting ? 'avatar-spin' : ''}`} aria-hidden="true">
            {initials(agentName)}
          </div>
          <div className="agent-id-text">
            <span className="agent-name">
              {agentName}
              <span className={`ac-dot ${getHealthDot(agentStatus)}`} />
            </span>
            <span className="agent-meta">{role} · {model}</span>
          </div>
        </div>
        <span className="skill-tag-pill">{skillTag}</span>
        <span className="agent-cta-hint mono" aria-hidden="true">{open ? '×' : '›_'}</span>
      </button>

      {/* CONSOLE — 0fr → 1fr grid reveal, no height measuring needed */}
      <div className="agent-console-zone">
        <div className="agent-console-inner">
          <div className="glow-wrapper glow-wrapper--console">
            <div className="agent-console-input">
              <span className="console-prefix mono">~ $</span>
              <input
                ref={inputRef}
                type="text"
                placeholder={agentStatus === 'online' ? 'Awaiting command…' : 'Agent offline — start the gateway'}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAgentExecution() }}
                disabled={isExecuting || agentStatus !== 'online'}
                aria-label={`Command for ${agentName}`}
              />
            </div>
          </div>

          {showResponse && (
            <div className="agent-response" ref={responseRef}>
              {error ? (
                <span className="agent-response-err">{error}</span>
              ) : (
                <div className={`stream-output${isExecuting || streaming ? ' is-streaming' : ''}`}>
                  {/* Only revealed tokens mount, so the ::after cursor always
                      rides the true end of the text as it streams. */}
                  {tokens.slice(0, revealed).map((t, i) => (
                    <span key={i} className="token-word visible">{t}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="agent-footer-toolbar">
            <button
              type="button"
              className={`prism-btn-primary ${isExecuting ? 'is-playing' : ''}`}
              onClick={() => void handleAgentExecution()}
              disabled={isExecuting || agentStatus !== 'online' || !command.trim()}
            >
              {isExecuting ? (
                <div className="ac-typing"><span></span><span></span><span></span></div>
              ) : (
                'Execute Strategy'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
