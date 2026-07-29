// src/features/hermes/components/HermesConsole.tsx
// A thread against the runtime itself, so the Hermes stage can be interrogated
// rather than only read. Same engine as Ask VEGA, scoped to the runtime.
import { ChatThread } from '../../ask-vega/components/ChatThread'
import { HERMES_SYSTEM_PROMPT, useAgentChat } from '../../ask-vega/lib/useAgentChat'

const QUICK_ASKS = ['Why is fitness 0?', 'Start generation 1', 'Explain the backoff']

export function HermesConsole({ generation, skillCount }: { generation: number; skillCount: number }) {
  const chat = useAgentChat({
    systemPrompt: HERMES_SYSTEM_PROMPT,
    greeting: `Runtime attached. ${skillCount} skills registered, GEPA at generation ${generation}.`,
  })

  return (
    <section className="hermes-console">
      <header className="hermes-console-head">
        <span className="hermes-console-dot" aria-hidden />
        <div>
          <div className="hermes-console-title">Hermes console</div>
          <div className="hermes-console-sub">agent_loop · curator · GEPA</div>
        </div>
      </header>

      <ChatThread
        {...chat}
        onSend={chat.send}
        onExecuteAction={chat.executeAction}
        onSetActionState={chat.setActionState}
        accent="var(--warn)"
        agentName="Hermes"
        placeholder="Ask the runtime…"
        suggestions={QUICK_ASKS}
      />
    </section>
  )
}
