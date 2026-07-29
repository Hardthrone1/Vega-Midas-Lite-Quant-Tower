// src/features/ask-vega/components/ChatThread.tsx
// Presentation for a chat surface: bubbles, typing indicator, action-proposal
// cards and the composer. Stateless — the conversation lives in useAgentChat,
// so Ask VEGA and the Hermes console look and behave identically.
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { SwipeToConfirm } from '../../../shared/ui'
import { ACTION_LABELS, type ActionProposal, type ChatMessage } from '../lib/useAgentChat'

export type ChatThreadProps = {
  messages: ChatMessage[]
  input: string
  setInput: (v: string) => void
  busy: boolean
  gatewayOk: boolean | null
  onSend: (text?: string) => void
  onExecuteAction: (proposal: ActionProposal) => void
  onSetActionState: (msgId: string, idx: number, state: 'accepted' | 'rejected') => void
  /** Colour identity: blue for VEGA, orange for Hermes, purple for swarm agents. */
  accent: string
  agentName: string
  placeholder: string
  suggestions?: string[]
  emptyText?: string
}

export function ChatThread({
  messages,
  input,
  setInput,
  busy,
  gatewayOk,
  onSend,
  onExecuteAction,
  onSetActionState,
  accent,
  agentName,
  placeholder,
  suggestions = [],
  emptyText,
}: ChatThreadProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  const offline = gatewayOk === false

  return (
    <div className="chat-thread" style={{ ['--chat-accent' as string]: accent }}>
      <div className="chat-messages" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 && (
          <div className="chat-empty">
            {emptyText && <p className="chat-empty-text">{emptyText}</p>}
            {suggestions.length > 0 && (
              <div className="chat-suggestions">
                {suggestions.map((s) => (
                  <button key={s} type="button" className="chat-suggestion" onClick={() => onSend(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`chat-row chat-row--${msg.role}`}>
            <div className="chat-bubble">
              <div className="chat-bubble-head">
                <span className="chat-who">{msg.role === 'assistant' ? agentName : 'You'}</span>
                <span className="chat-time">{msg.time}</span>
              </div>
              {msg.content && <div className="chat-text">{msg.content}</div>}
              {msg.actions?.map((proposal, idx) => {
                const state = msg.actionStates?.[idx] ?? 'pending'
                return (
                  <div key={idx} className={`chat-action chat-action--${state}`}>
                    <div className="chat-action-head">
                      <span className="chat-action-name">{ACTION_LABELS[proposal.action] ?? proposal.action}</span>
                      {state !== 'pending' && (
                        <span className={`chat-action-state chat-action-state--${state}`}>
                          {state === 'accepted' ? '✓ Applied' : '✗ Rejected'}
                        </span>
                      )}
                    </div>
                    <pre className="chat-action-payload">{JSON.stringify(proposal.payload, null, 2)}</pre>
                    {state === 'pending' && (
                      <div className="chat-action-btns">
                        <SwipeToConfirm
                          key={`${msg.id}-${idx}-accept`}
                          variant="approve"
                          text="Swipe to Accept"
                          successText="Accepted"
                          onConfirm={() => {
                            onExecuteAction(proposal)
                            onSetActionState(msg.id, idx, 'accepted')
                          }}
                        />
                        <SwipeToConfirm
                          key={`${msg.id}-${idx}-reject`}
                          variant="deny"
                          text="Swipe to Reject"
                          successText="Rejected"
                          onConfirm={() => onSetActionState(msg.id, idx, 'rejected')}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {busy && (
          <div className="chat-row chat-row--assistant" role="status" aria-busy="true">
            <div className="chat-bubble">
              <span className="sr-only">Generating response…</span>
              <div className="chat-typing" aria-hidden>
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="chat-composer">
        <label htmlFor={`chat-input-${agentName}`} className="sr-only">
          Message {agentName}
        </label>
        <textarea
          id={`chat-input-${agentName}`}
          className="chat-input"
          rows={2}
          placeholder={offline ? 'Gateway offline — run: node Vega_Gateway_Server.js' : placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy || offline}
        />
        <button
          type="button"
          className="chat-send"
          onClick={() => onSend()}
          disabled={busy || !input.trim() || offline}
          aria-label={busy ? 'Sending message' : 'Send message'}
        >
          {busy ? '…' : '↑'}
        </button>
      </div>
    </div>
  )
}
