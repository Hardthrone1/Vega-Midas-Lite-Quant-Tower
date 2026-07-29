// src/features/ask-vega/components/AskVegaPanel.tsx
// Ask VEGA — pinned to the bottom of the rail on every stage, and aware of the
// stage you are on. Replaces the old modal agent console: the assistant is
// always present rather than something you open.
import { useStrategyStore } from '../../../store/useStrategyStore'
import { bladeById } from '../../../app/layout/blades'
import { useAgentChat, VEGA_SYSTEM_PROMPT } from '../lib/useAgentChat'
import { ChatThread } from './ChatThread'

const SUGGESTIONS = ['Why is deploy blocked?', 'Explain my risk score', 'Review my Pine code']

export function AskVegaPanel() {
  const activeTab = useStrategyStore((s) => s.activeTab)
  const chat = useAgentChat({ systemPrompt: VEGA_SYSTEM_PROMPT })
  const stage = bladeById(activeTab)

  return (
    <section className="ask-vega">
      <header className="ask-vega-head">
        <span className="ask-vega-mark" aria-hidden>V</span>
        <h3>Ask VEGA</h3>
        <span className="rail-spacer" />
        <span
          className={`ask-vega-dot ask-vega-dot--${
            chat.gatewayOk === true ? 'online' : chat.gatewayOk === false ? 'offline' : 'checking'
          }`}
          role="status"
          aria-label={`Gateway ${chat.gatewayOk === true ? 'online' : chat.gatewayOk === false ? 'offline' : 'checking'}`}
        />
        <span className="ask-vega-stage">step {stage?.step ?? '—'}</span>
      </header>

      <ChatThread
        {...chat}
        onSend={chat.send}
        onExecuteAction={chat.executeAction}
        onSetActionState={chat.setActionState}
        accent="var(--blue)"
        agentName="VEGA"
        placeholder={`Ask about ${stage?.label.toLowerCase() ?? 'this run'}…`}
        suggestions={SUGGESTIONS}
        emptyText="Full run context is sent with every message — deploy state, spec, lint, parity, risk."
      />
    </section>
  )
}
