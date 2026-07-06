// src/features/agent-console/components/AgentConsole.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw, X, Zap } from 'lucide-react'
import { useStrategyStore } from '../../../store/useStrategyStore'

const GW_URL = 'http://127.0.0.1:8001'

const SYSTEM_PROMPT = `You are VEGA Orchestrator — an embedded trading strategy assistant with direct read access to the full dashboard state and the ability to propose state changes.

Your role:
- Diagnose issues: deploy blocks, lint violations, parity mismatches, risk failures
- Explain what any piece of state means in plain terms
- Propose concrete fixes as structured action blocks the user can Accept or Reject

When you want to modify dashboard state, emit action blocks in this exact format:
%%ACTION%%
{"action": "ACTION_NAME", "payload": PAYLOAD}
%%END%%

Available actions:
- setLintResult       payload: { passed: boolean, violations: string[], warnings: string[] }
- setParityResult     payload: { passed: boolean, mismatchCount: number, mismatches: [] }
- setRiskResult       payload: { score: number, var: number|null, kelly: number|null, sharpe: number|null, drawdown: number|null }
- setBacktestResult   payload: { trades: [], metrics: {}, equityCurve: [] }
- setPineCode         payload: "the pine code string"
- resetRun            payload: {}

Rules:
- Always explain what you are proposing BEFORE the action block
- Only reference state that is in the context — never fabricate values
- You may emit multiple action blocks in one response
- Be concise and direct`

type Role = 'user' | 'assistant'
type ActionProposal = { action: string; payload: unknown }
type Message = {
  id: string
  role: Role
  content: string
  actions?: ActionProposal[]
  actionStates?: Record<number, 'pending' | 'accepted' | 'rejected'>
}

function parseActions(text: string): { cleaned: string; actions: ActionProposal[] } {
  const actions: ActionProposal[] = []
  const cleaned = text.replace(/%%ACTION%%\n?([\s\S]*?)%%END%%/g, (match, inner) => {
    try {
      const parsed = JSON.parse(inner.trim())
      actions.push({ action: parsed.action, payload: parsed.payload })
    } catch { return match }
    return ''
  }).trim()
  return { cleaned, actions }
}

function buildContext(): string {
  const s = useStrategyStore.getState()
  return JSON.stringify({
    deployStatus: s.deployStatus,
    deployBlockers: s.deployBlockers,
    symbol: s.symbol,
    timeframe: s.timeframe,
    session: s.session,
    executionMode: s.executionMode,
    riskProfile: s.riskProfile,
    canonicalSpec: s.canonicalSpec,
    pineCode: s.pineCode ? s.pineCode.slice(0, 2000) : null,
    lintResult: s.lintResult,
    parityResult: s.parityResult,
    riskResult: s.riskResult,
    backtestMetrics: s.backtestResult.metrics,
    specValidation: s.specValidation,
    recentAgentMessages: s.agentMessages.slice(-6),
  }, null, 2)
}

const ACTION_LABELS: Record<string, string> = {
  setLintResult: 'Set lint result',
  setParityResult: 'Set parity result',
  setRiskResult: 'Set risk score',
  setBacktestResult: 'Set backtest result',
  setPineCode: 'Replace Pine code',
  resetRun: 'Reset run state',
}

let _uid = 0
const uid = () => String(++_uid)

export function AgentConsole({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStrategyStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [gatewayOk, setGatewayOk] = useState<boolean | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    fetch(`${GW_URL}/api/health`, { signal: AbortSignal.timeout(3000) })
      .then(r => setGatewayOk(r.ok))
      .catch(() => setGatewayOk(false))
  }, [open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const executeAction = useCallback((proposal: ActionProposal) => {
    const { action, payload } = proposal
    switch (action) {
      case 'setLintResult':     store.setLintResult(payload as Parameters<typeof store.setLintResult>[0]); break
      case 'setParityResult':   store.setParityResult(payload as Parameters<typeof store.setParityResult>[0]); break
      case 'setRiskResult':     store.setRiskResult(payload as Parameters<typeof store.setRiskResult>[0]); break
      case 'setBacktestResult': store.setBacktestResult(payload as Parameters<typeof store.setBacktestResult>[0]); break
      case 'setPineCode':       store.setPineCode(typeof payload === 'string' ? payload : JSON.stringify(payload)); break
      case 'resetRun':          store.resetRun(); break
      default: console.warn('[AgentConsole] Unknown action:', action)
    }
    store.addAgentMessage({ agent: 'Orchestrator', level: 'success', message: `${ACTION_LABELS[action] ?? action} applied via console` })
  }, [store])

  const setActionState = useCallback((msgId: string, idx: number, state: 'accepted' | 'rejected') => {
    setMessages(prev => prev.map(m =>
      m.id !== msgId ? m : { ...m, actionStates: { ...(m.actionStates ?? {}), [idx]: state } }
    ))
  }, [])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return
    const userMsg: Message = { id: uid(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setBusy(true)
    const context = buildContext()
    const apiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `Current dashboard state:\n\`\`\`json\n${context}\n\`\`\`` },
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ]
    try {
      const resp = await fetch(`${GW_URL}/api/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'nvidia_intake',
          messages: apiMessages,
          max_tokens: 2000,
          temperature: 0.4,
        }),
        signal: AbortSignal.timeout(60000),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error?.message || `Gateway HTTP ${resp.status}`)
      const raw: string = data?.choices?.[0]?.message?.content || '[No response]'
      const { cleaned, actions } = parseActions(raw)
      setMessages(prev => [...prev, {
        id: uid(), role: 'assistant', content: cleaned,
        actions: actions.length ? actions : undefined,
        actionStates: actions.length ? Object.fromEntries(actions.map((_, i) => [i, 'pending' as const])) : undefined,
      }])
    } catch (err) {
      setMessages(prev => [...prev, { id: uid(), role: 'assistant', content: `[Error: ${err instanceof Error ? err.message : String(err)}]` }])
    } finally {
      setBusy(false)
    }
  }, [input, busy, messages])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const deployBadgeKind = store.deployStatus === 'deploy_blocked' ? 'err' : store.deployStatus === 'deploy_ready' ? 'ok' : 'idle'

  if (!open) return null

  return (
    <div
      id="agent-console-panel"
      className="ac-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ac-dialog-title"
    >
      <div className="ac-header">
        <div className="ac-header-left">
          <span id="ac-dialog-title" className="ac-brand">VEGA Orchestrator</span>
          <span
            className={`ac-dot live-indicator ac-dot--${gatewayOk === true ? 'online' : gatewayOk === false ? 'offline' : 'checking'}`}
            role="status"
            aria-live="polite"
            aria-label={`Gateway ${gatewayOk === true ? 'online' : gatewayOk === false ? 'offline' : 'checking'}`}
          />
          <span className="ac-gw-label mono" aria-hidden>{gatewayOk === true ? 'online' : gatewayOk === false ? 'offline' : '…'}</span>
        </div>
        <div className="ac-header-right">
          {messages.length > 0 && (
            <button
              type="button"
              className="ac-icon-btn vega-icon-btn"
              onClick={() => setMessages([])}
              aria-label="Clear conversation"
            >
              <RotateCcw size={12} strokeWidth={1.75} aria-hidden />
            </button>
          )}
          <button
            type="button"
            className="ac-icon-btn vega-icon-btn"
            onClick={onClose}
            aria-label="Close Agent Console"
          >
            <X size={12} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </div>

      <div className="ac-ctx-strip mono">
        <span className={`ac-ctx-badge ac-ctx-badge--${deployBadgeKind}`}>{store.deployStatus}</span>
        <span className="ac-ctx-item">{store.symbol} · {store.timeframe} · {store.session}</span>
        {store.deployBlockers.length > 0 && <span className="ac-ctx-blocker">↳ {store.deployBlockers[0]}</span>}
      </div>

      <div className="ac-messages" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 && (
          <div className="ac-empty">
            <div className="ac-empty-title">Ready</div>
            <div className="ac-empty-sub">Full store context injected with every message. Ask about any state, deploy block, lint violation, or Pine code.</div>
            <div className="ac-suggestions">
              {['Why is deploy blocked?', 'Review my Pine code', 'Fix parity mismatch', 'Explain my risk score'].map(s => (
                <button key={s} className="ac-suggestion" onClick={() => { setInput(s); inputRef.current?.focus() }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`ac-msg ac-msg--${msg.role}`}>
            <span className="ac-msg-who">{msg.role === 'assistant' ? 'Orchestrator' : 'You'}</span>
            {msg.content && <div className="ac-msg-text">{msg.content}</div>}
            {msg.actions?.map((proposal, idx) => {
              const state = msg.actionStates?.[idx] ?? 'pending'
              return (
                <div key={idx} className={`ac-action-card ac-action-card--${state}`}>
                  <div className="ac-action-header">
                    <Zap size={12} className="ac-action-icon" strokeWidth={1.75} aria-hidden />
                    <span className="ac-action-name">{ACTION_LABELS[proposal.action] ?? proposal.action}</span>
                    {state !== 'pending' && (
                      <span className={`ac-action-state ac-action-state--${state}`}>
                        {state === 'accepted' ? '✓ Applied' : '✗ Rejected'}
                      </span>
                    )}
                  </div>
                  <pre className="ac-action-payload">{JSON.stringify(proposal.payload, null, 2)}</pre>
                  {state === 'pending' && (
                    <div className="ac-action-btns">
                      <button className="ac-action-btn ac-action-btn--accept" onClick={() => { executeAction(proposal); setActionState(msg.id, idx, 'accepted') }}>Accept</button>
                      <button className="ac-action-btn ac-action-btn--reject" onClick={() => setActionState(msg.id, idx, 'rejected')}>Reject</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        {busy && (
          <div className="ac-msg ac-msg--assistant" role="status" aria-live="polite" aria-busy="true">
            <span className="ac-msg-who">Orchestrator</span>
            <span className="sr-only">Generating response…</span>
            <div className="ac-typing" aria-hidden><span /><span /><span /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="ac-input-row">
        <label htmlFor="ac-message-input" className="sr-only">Message to VEGA Orchestrator</label>
        <textarea
          id="ac-message-input"
          ref={inputRef}
          className="ac-input"
          rows={2}
          placeholder={gatewayOk === false ? 'Gateway offline — run: node Vega_Gateway_Server.js' : 'Ask the Orchestrator… (Enter to send, Shift+Enter for newline)'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy || gatewayOk === false}
          aria-describedby={busy ? 'ac-busy-status' : undefined}
        />
        {busy && <span id="ac-busy-status" className="sr-only">Sending message…</span>}
        <button
          type="button"
          className="ac-send-btn"
          onClick={send}
          disabled={busy || !input.trim() || gatewayOk === false}
          aria-label={busy ? 'Sending message' : 'Send message'}
        >
          {busy ? '…' : '↑'}
        </button>
      </div>
    </div>
  )
}
