// src/features/ask-vega/lib/useAgentChat.ts
//
// The conversation engine behind every chat surface in the app (Ask VEGA in the
// rail, the Hermes console). Extracted from the old AgentConsole so all of them
// share one implementation of: live store context injection, the gateway call,
// and the %%ACTION%% proposal protocol that lets a reply propose a real state
// change the operator can accept or reject.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useStrategyStore } from '../../../store/useStrategyStore'
import { gatewayFetch } from '../../../shared/gateway'

export type Role = 'user' | 'assistant'
export type ActionProposal = { action: string; payload: unknown }
export type ActionState = 'pending' | 'accepted' | 'rejected'

export type ChatMessage = {
  id: string
  role: Role
  content: string
  time: string
  actions?: ActionProposal[]
  actionStates?: Record<number, ActionState>
}

export const ACTION_LABELS: Record<string, string> = {
  setLintResult: 'Set lint result',
  setParityResult: 'Set parity result',
  setRiskResult: 'Set risk score',
  setBacktestResult: 'Set backtest result',
  setPineCode: 'Replace Pine code',
  resetRun: 'Reset run state',
}

const ACTION_CONTRACT = `When you want to modify dashboard state, emit action blocks in this exact format:
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

export const VEGA_SYSTEM_PROMPT = `You are VEGA Orchestrator — an embedded trading strategy assistant with direct read access to the full dashboard state and the ability to propose state changes.

Your role:
- Diagnose issues: deploy blocks, lint violations, parity mismatches, risk failures
- Explain what any piece of state means in plain terms
- Propose concrete fixes as structured action blocks the user can Accept or Reject

${ACTION_CONTRACT}`

export const HERMES_SYSTEM_PROMPT = `You are Hermes — the VEGA agent runtime (agent_loop + Curator + GEPA). You answer questions about the runtime itself: the registered skills, the Curator's failure-classification policy and retry backoff, and the GEPA parameter search (population, bounds, fitness).

Be precise and concise. Only reference values present in the context — if GEPA has not been evaluated yet, say so plainly rather than inventing fitness numbers.

${ACTION_CONTRACT}`

function parseActions(text: string): { cleaned: string; actions: ActionProposal[] } {
  const actions: ActionProposal[] = []
  const cleaned = text
    .replace(/%%ACTION%%\n?([\s\S]*?)%%END%%/g, (match, inner) => {
      try {
        const parsed = JSON.parse(inner.trim())
        actions.push({ action: parsed.action, payload: parsed.payload })
      } catch {
        return match
      }
      return ''
    })
    .trim()
  return { cleaned, actions }
}

/** Live store snapshot injected with every turn, plus which stage the operator is looking at. */
function buildContext(): string {
  const s = useStrategyStore.getState()
  return JSON.stringify(
    {
      currentStage: s.activeTab,
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
    },
    null,
    2
  )
}

let _uid = 0
const uid = () => String(++_uid)
const now = () => new Date().toLocaleTimeString()

export function useAgentChat({
  systemPrompt,
  provider = 'nvidia_intake',
  greeting,
}: {
  systemPrompt: string
  provider?: string
  greeting?: string
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    greeting ? [{ id: uid(), role: 'assistant', content: greeting, time: now() }] : []
  )
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [gatewayOk, setGatewayOk] = useState<boolean | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    gatewayFetch('/api/health', { signal: AbortSignal.timeout(3000) })
      .then((r) => { if (alive.current) setGatewayOk(r.ok) })
      .catch(() => { if (alive.current) setGatewayOk(false) })
    return () => { alive.current = false }
  }, [])

  const executeAction = useCallback((proposal: ActionProposal) => {
    const store = useStrategyStore.getState()
    const { action, payload } = proposal
    switch (action) {
      case 'setLintResult': store.setLintResult(payload as Parameters<typeof store.setLintResult>[0]); break
      case 'setParityResult': store.setParityResult(payload as Parameters<typeof store.setParityResult>[0]); break
      case 'setRiskResult': store.setRiskResult(payload as Parameters<typeof store.setRiskResult>[0]); break
      case 'setBacktestResult': store.setBacktestResult(payload as Parameters<typeof store.setBacktestResult>[0]); break
      case 'setPineCode': store.setPineCode(typeof payload === 'string' ? payload : JSON.stringify(payload)); break
      case 'resetRun': store.resetRun(); break
      default: console.warn('[useAgentChat] Unknown action:', action); return
    }
    store.addAgentMessage({
      agent: 'Orchestrator',
      level: 'success',
      message: `${ACTION_LABELS[action] ?? action} applied via console`,
    })
  }, [])

  const setActionState = useCallback((msgId: string, idx: number, state: ActionState) => {
    setMessages((prev) =>
      prev.map((m) => (m.id !== msgId ? m : { ...m, actionStates: { ...(m.actionStates ?? {}), [idx]: state } }))
    )
  }, [])

  const send = useCallback(
    async (text?: string) => {
      const body = (text ?? input).trim()
      if (!body || busy) return
      setMessages((prev) => [...prev, { id: uid(), role: 'user', content: body, time: now() }])
      setInput('')
      setBusy(true)

      const history = messages.map((m) => ({ role: m.role, content: m.content }))
      try {
        const resp = await gatewayFetch('/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'system', content: `Current dashboard state:\n\`\`\`json\n${buildContext()}\n\`\`\`` },
              ...history,
              { role: 'user', content: body },
            ],
            max_tokens: 2000,
            temperature: 0.4,
          }),
          signal: AbortSignal.timeout(60000),
        })
        const data = await resp.json()
        if (!resp.ok) throw new Error(data?.error?.message || `Gateway HTTP ${resp.status}`)
        const raw: string = data?.choices?.[0]?.message?.content || '[No response]'
        const { cleaned, actions } = parseActions(raw)
        if (!alive.current) return
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: 'assistant',
            content: cleaned,
            time: now(),
            actions: actions.length ? actions : undefined,
            actionStates: actions.length
              ? Object.fromEntries(actions.map((_, i) => [i, 'pending' as const]))
              : undefined,
          },
        ])
      } catch (err) {
        if (!alive.current) return
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: 'assistant',
            content: `[Error: ${err instanceof Error ? err.message : String(err)}]`,
            time: now(),
          },
        ])
      } finally {
        if (alive.current) setBusy(false)
      }
    },
    [input, busy, messages, provider, systemPrompt]
  )

  const clear = useCallback(() => setMessages([]), [])

  return { messages, input, setInput, busy, gatewayOk, send, clear, executeAction, setActionState }
}
