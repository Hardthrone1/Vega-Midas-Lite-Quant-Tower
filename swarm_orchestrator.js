/**
 * swarm_orchestrator.js — live multi-agent swarm for the VEGA gateway.
 *
 * This is the orchestration the archived Vega_Orchestrator.legacy.js used to do
 * in the browser, rebuilt as a server-side module that runs INSIDE the gateway.
 * It reuses the gateway's own callProvider (rate limiting, circuit breakers,
 * retries) instead of talking to itself over HTTP, so every swarm call is
 * governed by the same resilience infrastructure as a normal chat request.
 *
 * Pipeline:  fan-out (analysis agents, concurrent)
 *              → synthesis (one model merges the analyses into a thesis)
 *              → audit (a coder model turns the thesis into Pine, first valid wins)
 *              → anti-cheat / overfitting lint on the produced Pine.
 *
 * The gateway injects its internals via createSwarmOrchestrator(...); this module
 * has no direct provider/network knowledge of its own.
 */

// Swarm roster mapped onto the gateway's provider slots. We deliberately do NOT
// hardcode model ids here — each agent uses whatever model the operator has
// configured for its slot (resolveModelForProvider falls back to the slot
// default), so the swarm follows the same config as the rest of the gateway.
const SWARM_AGENTS = {
  architect: { id: 'architect', name: 'Architect',  provider: 'nvidia_intake',   lane: 'architect', temperature: 0.3 },
  quant:     { id: 'quant',     name: 'Quant Core',  provider: 'nvidia_backtest', lane: 'quant',     temperature: 0.4 },
  coder:     { id: 'coder',     name: 'Pine Coder',  provider: 'nvidia_pine',     lane: 'coder',     temperature: 0.5 },
  synth:     { id: 'synth',     name: 'Synthesis',   provider: 'gemini',          lane: 'synth',     temperature: 0.4 },
  lint:      { id: 'lint',      name: 'Lint',        provider: 'nvidia_lint',     lane: 'lint',      temperature: 0.2 },
}

// Default analysis fan-out when the caller doesn't specify agents.
const DEFAULT_ANALYSIS_AGENTS = ['architect', 'quant']
// Audit is tried in order; first agent that returns usable code wins.
const AUDIT_ORDER = ['coder', 'quant']
// Synthesis prefers the multimodal synth slot, falls back to the architect slot.
const SYNTH_ORDER = ['synth', 'architect']

const isErr = (s) => typeof s !== 'string' || s.startsWith('[Error')

function extractPine(raw) {
  if (typeof raw !== 'string') return String(raw ?? '')
  const m = raw.match(/```(?:pinescript|pine)?\s*\n([\s\S]*?)\n```/i) || raw.match(/```([\s\S]*?)```/i)
  return (m ? m[1] : raw).trim()
}

// ==================== ANTI-CHEAT / OVERFITTING LINTER ====================
// Ported verbatim (pure, no deps) from Vega_Orchestrator.legacy.js so the
// server-side audit and the client-side pre-lint stay in lockstep.
function validatePineScriptRules(code) {
  const violations = []
  const warnings = []

  if (typeof code !== 'string') code = String(code)

  const hasEntry = /strategy\.entry\s*\(/i.test(code)
  if (hasEntry && !code.includes('barstate.isconfirmed')) {
    violations.push('strategy.entry() detected but barstate.isconfirmed validation missing')
  }

  const lookaheadPatterns = [
    /close\s*\[\s*-/i,
    /\[bar_index\s*\+\s*\d/i,
    /security\([^)]*lookahead\s*=\s*barmerge\.lookahead_on/i,
  ]
  lookaheadPatterns.forEach((pattern, idx) => {
    if (pattern.test(code)) violations.push(`Potential lookahead leakage detected (pattern ${idx + 1})`)
  })

  if (/security\s*\([^)]*lookahead/i.test(code)) {
    violations.push('security() call with lookahead parameter may cause repainting')
  }

  const indicators = code.match(/ta\.\w+\s*\(/gi) || []
  const uniqueIndicators = new Set(indicators.map((i) => i.toLowerCase()))
  if (uniqueIndicators.size >= 5) {
    warnings.push(`High indicator stacking detected (${uniqueIndicators.size} distinct ta.* calls) - risk of overfitting`)
  }

  if (!/slippage|spread|commiss/i.test(code)) {
    warnings.push('No slippage, spread, or commission modeling detected - may diverge from real-world fills')
  }

  const atrOnEntryPattern = /strategy\.entry[^}]*atr\s*\(/i
  if (atrOnEntryPattern.test(code) && !code.includes('barstate.isconfirmed')) {
    warnings.push('ATR-based stops may be calculated on entry bar without bar confirmation - review manually')
  }

  // Intra-bar trap-detection precondition (reports, never fails the strategy).
  let trapStatus = 'n/a'
  const hasExit = /strategy\.(exit|close)\s*\(/i.test(code)
  if (hasExit) {
    trapStatus = 'available'
    const hasTrailingExit = /trail_(points|price|offset)\s*=/i.test(code) || /strategy\.exit[^)]*trail/i.test(code)
    const stopArg = code.match(/\bstop\s*=\s*([^,\)\n]+)/i)
    const limitArg = code.match(/\blimit\s*=\s*([^,\)\n]+)/i)
    const looksLikeVariable = (m) => {
      if (!m) return false
      const val = m[1].trim()
      return /^[A-Za-z_]\w*(\s*\[\s*\d+\s*\])?$/.test(val)
    }
    const stopReadable = looksLikeVariable(stopArg)
    const limitReadable = looksLikeVariable(limitArg)

    if (!stopArg && !limitArg) {
      trapStatus = 'unavailable'
      warnings.push('TRAP-CHECK: no stop= / limit= found on exit - intra-bar trap detection unavailable (cannot recover SL/TP intent)')
    } else if ((!stopReadable || !limitReadable) && !hasTrailingExit) {
      trapStatus = 'partial'
      warnings.push('TRAP-CHECK: SL/TP appear inlined as literals or expressions, not named variables - logger would record incomplete boundaries; expose them as var float for trap detection')
    }
    if (hasTrailingExit) {
      trapStatus = 'unreliable'
      warnings.push('TRAP-CHECK: trailing stop detected - exit-time SL differs from entry-time SL; intra-bar trap detection is UNRELIABLE for this strategy (route to manual replay, not the static-bracket resolver)')
    }
  }

  const trapMessages = {
    available: 'TRAP-CHECK: intra-bar trap detection AVAILABLE - stop= and limit= are named variables; static-bracket resolver can replay 1m data against the recorded SL/TP.',
    partial: 'TRAP-CHECK: intra-bar trap detection PARTIAL - SL/TP inlined as literals/expressions; expose them as `var float` to recover full boundaries.',
    unavailable: 'TRAP-CHECK: intra-bar trap detection UNAVAILABLE - no stop=/limit= on exit; SL/TP intent cannot be recovered.',
    unreliable: 'TRAP-CHECK: intra-bar trap detection UNRELIABLE - trailing stop; exit-time SL differs from entry-time SL. Route to manual replay, not the static-bracket resolver.',
    'n/a': 'TRAP-CHECK: not applicable - no strategy.exit() / strategy.close() found.',
  }

  return {
    passed: violations.length === 0,
    violations,
    warnings,
    trapCheck: { status: trapStatus, message: trapMessages[trapStatus] },
  }
}

function buildSwarmPrompt(task, agent) {
  const setup = task.setup || task.symbol || 'General'
  const context = task.context || 'None'

  if (agent.lane === 'architect') {
    return `[ARCHITECT LANE] Analyze this trading setup for structural architecture and session-based logic:

Setup: ${setup}
Context: ${context}

Focus on:
- Session filters (New York, London, Asian session openings)
- Execution intervals and timeframe logic
- Standard structural logic blocks (entry conditions, exit conditions)
- Order routing flows (market, limit, stop orders)

Respond with concrete architectural recommendations for Pine Script v5.`
  }

  if (agent.lane === 'quant') {
    return `[QUANT CORE LANE] Analyze this trading setup for advanced quantitative mathematics:

Setup: ${setup}
Context: ${context}

Focus on:
- Complex indicator mathematics (Hull MA, LSMA, ZLEMA hybrid smoothing)
- Multi-timeframe (MTF) array aggregation techniques
- Fibonacci "Golden Zone" pullback coordinate calculations
- Advanced smoothing and confirmation algorithms

Respond with precise mathematical formulations ready for Pine Script implementation.`
  }

  return `Analyze this trading setup for Pine Script optimization:

Setup: ${setup}
Context: ${context}

Provide analysis and recommendations for Pine Script v5 strategy design.`
}

/**
 * Build the orchestrator. The gateway injects its own provider machinery so the
 * swarm inherits rate limiting, circuit breakers and retries for free.
 *
 * @param {object} deps
 * @param {(cfg:object, body:object)=>Promise<object>} deps.callProvider
 * @param {(provider:string)=>object} deps.getProviderConfig  throws if slot lacks an API key
 * @param {(provider:string, requestedModel:any, cfg:object)=>string} deps.resolveModelForProvider
 * @param {(...args:any[])=>void} [deps.log]
 */
function createSwarmOrchestrator({ callProvider, getProviderConfig, resolveModelForProvider, log = () => {} }) {
  // One agent call, routed through the gateway's own provider path. Returns the
  // assistant text, or an "[Error ...]" sentinel string (never throws) so a
  // single agent failure degrades the swarm instead of aborting it.
  async function callAgent(agent, userPrompt, systemPrompt = null) {
    let cfg
    try {
      cfg = getProviderConfig(agent.provider)
    } catch (e) {
      return `[Error: provider ${agent.provider} unavailable — ${e.message}]`
    }
    const messages = []
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
    messages.push({ role: 'user', content: userPrompt })

    const model = resolveModelForProvider(agent.provider, undefined, cfg)
    const body = { model, messages, max_tokens: 4000, temperature: agent.temperature ?? 0.5 }

    try {
      log(`[SWARM] → ${agent.name} (${agent.provider}/${model})`)
      const data = await callProvider(cfg, body)
      const text = data?.choices?.[0]?.message?.content ?? ''
      return typeof text === 'string' ? text : JSON.stringify(text)
    } catch (e) {
      return `[Error: ${agent.name} — ${e.message}]`
    }
  }

  async function executeSwarm(task, agentIds) {
    // Fan out concurrently. Different providers run in parallel; the gateway's
    // per-provider rate limiter serializes calls that share a slot.
    const settled = await Promise.all(
      agentIds.map(async (id) => {
        const agent = SWARM_AGENTS[id]
        const result = await callAgent(agent, buildSwarmPrompt(task, agent))
        return { agent: id, name: agent.name, lane: agent.lane, result, ok: !isErr(result) }
      })
    )
    return settled
  }

  async function executeSynthesis(swarmResults) {
    const summary = swarmResults
      .map((r) => `=== ${r.name.toUpperCase()} ANALYSIS ===\n${(r.result || '[No response]').substring(0, 800)}`)
      .join('\n\n')

    const prompt = `You are a quantitative trading analyst. Synthesize the following multi-agent analysis reports into a single coherent trading thesis with a clear directional bias, confidence level, and Pine Script strategy recommendation.

${summary}

Provide:
1. THESIS: One detailed synthesis of the combined analysis
2. DIRECTIONAL BIAS: Bullish / Bearish / Neutral with reasoning
3. KEY CONFLUENCES: Top 3 signals agents agreed on
4. PINE SCRIPT RECOMMENDATION: Indicator/strategy type to code
5. CONFIDENCE: 0.0–1.0 score based on agent agreement`

    for (const id of SYNTH_ORDER) {
      const text = await callAgent(SWARM_AGENTS[id], prompt)
      if (!isErr(text)) return { synthesis: text, by: SWARM_AGENTS[id].name, confidence: 0.82 }
    }
    return { synthesis: '[Error: synthesis agents exhausted]', by: null, confidence: 0 }
  }

  async function executeAudit(synthesis, task) {
    const userPrompt = `Generate a complete, clean, production-ready Pine Script v5 strategy.

Thesis:
${synthesis.synthesis}

Requirements:
- Use //@version=5
- Proper strategy.entry() (guarded by barstate.isconfirmed) and strategy.exit()
- Risk management (stop loss, take profit, position sizing)
- Include commission_value and slippage
- Clear comments explaining the logic
- Output the strategy in a single \`\`\`pinescript code block, ready to paste into TradingView`

    let auditText = ''
    let successAgent = null

    for (const id of AUDIT_ORDER) {
      const agent = SWARM_AGENTS[id]
      const result = await callAgent(agent, userPrompt)
      const valid =
        !isErr(result) &&
        result.length >= 50 &&
        /strategy|entry|exit|pine|var |\/\//i.test(result)
      if (valid) {
        auditText = result
        successAgent = agent.name
        break
      }
    }

    if (!auditText) {
      return {
        pine: '',
        auditNotes: '[Error: All code generation agents exhausted]',
        successAgent: null,
        ruleCheck: null,
        confidence: 0,
      }
    }

    const pine = extractPine(auditText)
    const ruleCheck = validatePineScriptRules(pine)
    return { pine, auditNotes: auditText, successAgent, ruleCheck, confidence: synthesis.confidence ?? 0.82 }
  }

  // Which analysis agents actually have a configured provider slot?
  function resolveAgents(requested) {
    const wanted = (Array.isArray(requested) && requested.length ? requested : DEFAULT_ANALYSIS_AGENTS)
      .map((s) => String(s).trim().toLowerCase())
      .filter((id) => SWARM_AGENTS[id])
    const available = wanted.filter((id) => {
      try { getProviderConfig(SWARM_AGENTS[id].provider); return true } catch { return false }
    })
    return available.length ? available : wanted // keep at least the request so errors surface
  }

  /**
   * Run the full swarm for one task.
   * @param {object} task    { type?, setup?, context?, symbol? }
   * @param {object} [opts]  { agents?: string[] }
   */
  async function runSwarm(task = {}, opts = {}) {
    const taskId = `swarm_${Date.now().toString(36)}`
    const routing = resolveAgents(opts.agents)

    const swarmResults = await executeSwarm(task, routing)
    const synthesis = await executeSynthesis(swarmResults)
    const audit = await executeAudit(synthesis, task)

    return {
      success: !!audit.pine,
      taskId,
      routing,
      swarmResults,
      synthesis,
      audit,
    }
  }

  return { runSwarm, validatePineScriptRules, SWARM_AGENTS }
}

module.exports = { createSwarmOrchestrator, validatePineScriptRules, SWARM_AGENTS }
