// src/features/swarm/components/SwarmPanel.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Panel, Button, Card } from '../../../shared/ui'
import { useStrategyStore } from '../../../store/useStrategyStore'
import { SwarmHeader } from './SwarmHeader'

const GW_URL = 'http://127.0.0.1:8001'
const GW_POLL_MS = 8000

const AGENTS = [
  { name: 'Hermes',   role: 'Router · Primary',      model: 'llama-3.3-70b',            tier: 'INTAKE' },
  { name: 'Nemotron', role: 'Quant + Logic',          model: 'nemotron-3-ultra',          tier: 'BACKTEST' },
  { name: 'Gemini',   role: 'Fast Synthesis',         model: 'gemini-2.0-flash',          tier: 'GEMINI' },
  { name: 'Claude',   role: 'Pine Script Authority',  model: 'llama-4-maverick',          tier: 'PINE' },
  { name: 'Nex',      role: 'Agentic Coding',         model: 'llama-4-maverick',          tier: 'PINE' },
]

type AgentMsg = { id: number; who: string; txt: string; level: 'sys' | 'route' | 'lint' | 'ok' | 'err' | 'work' }
type SwarmMode = 'generate' | 'repair'
type GatewayStatus = 'checking' | 'online' | 'offline'

// ── Pine linter (matches gateway validatePineScriptRules) ──────────────
function lintPine(code: string) {
  const violations: string[] = []
  const warnings: string[] = []
  if (!code) return { passed: false, violations: ['No code'], warnings }
  if (/strategy\.entry\s*\(/i.test(code) && !code.includes('barstate.isconfirmed'))
    violations.push('strategy.entry() without barstate.isconfirmed')
  if (/close\s*\[\s*-/i.test(code)) violations.push('Lookahead index detected')
  if (/security\([^)]*lookahead\s*=\s*barmerge\.lookahead_on/i.test(code))
    violations.push('security() with lookahead — repainting risk')
  if ((code.match(/ta\.\w+\s*\(/gi) || []).length >= 5)
    warnings.push('5+ distinct ta.* calls — overfitting risk')
  if (!/slippage|spread|commiss/i.test(code))
    warnings.push('No slippage/commission modeling')
  return { passed: violations.length === 0, violations, warnings }
}

function highlightPine(code: string) {
  return code
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(\/\/[^\n]*)/g, '<span class="pine-cmt">$1</span>')
    .replace(/\b(strategy|indicator|input|ta|math|plot|var|if|else|for|while|true|false|and|or|not|barstate|syminfo)\b/g,
      '<span class="pine-kw">$1</span>')
    .replace(/(".*?"|'.*?')/g, '<span class="pine-str">$1</span>')
}

function extractCode(raw: string) {
  const m = raw.match(/```(?:pinescript|pine)?\s*\n([\s\S]*?)\n```/i) || raw.match(/```([\s\S]*?)```/i)
  return m ? m[1].trim() : raw.trim()
}

export function SwarmPanel() {
  const { symbol, timeframe, backtestResult, pineCode, setPineCode, setLintResult, addAgentMessage, addPineVault } = useStrategyStore()

  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>('checking')
  const [gatewayMeta, setGatewayMeta] = useState('—')
  const [mode, setMode] = useState<SwarmMode>('generate')
  const [busy, setBusy] = useState(false)
  const [agentMsgs, setAgentMsgs] = useState<AgentMsg[]>([
    { id: 0, who: 'VEGA', txt: 'Agent message window ready.', level: 'sys' },
  ])
  const [repairInput, setRepairInput] = useState('')
  const [repairRequest, setRepairRequest] = useState('')
  const [lintDisplay, setLintDisplay] = useState<{ state: 'pass' | 'warn' | 'fail'; text: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [isFs, setIsFs] = useState(false)
  const msgIdRef = useRef(1)
  const msgsEndRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)

  const addMsg = useCallback((who: string, txt: string, level: AgentMsg['level'] = 'sys') => {
    setAgentMsgs(prev => [...prev, { id: msgIdRef.current++, who, txt, level }])
  }, [])

  // auto-scroll messages
  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentMsgs])

  // Track real fullscreen state so the expand toggle reflects it
  useEffect(() => {
    const onFsChange = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      panelRef.current?.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }, [])

  // Gateway polling
  const checkGateway = useCallback(async () => {
    try {
      const r = await fetch(`${GW_URL}/api/health`, { signal: AbortSignal.timeout(3000) })
      const d = await r.json()
      if (r.ok) {
        setGatewayStatus('online')
        setGatewayMeta(`v${d.version || '?'} · ${d.openrouter || '?'} · ${new Date(d.timestamp).toLocaleTimeString()}`)
      } else {
        setGatewayStatus('offline')
        setGatewayMeta('Gateway not reachable — run: node Vega_Gateway_Server.js')
      }
    } catch {
      setGatewayStatus('offline')
      setGatewayMeta('Gateway offline — run: node Vega_Gateway_Server.js')
    }
  }, [])

  useEffect(() => {
    checkGateway()
    const id = setInterval(checkGateway, GW_POLL_MS)
    return () => clearInterval(id)
  }, [checkGateway])

  // Gateway call
  async function callGateway(messages: { role: string; content: string }[]) {
    const resp = await fetch(`${GW_URL}/api/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta/llama-4-maverick-17b-128e-instruct',
        provider: 'nvidia_pine',
        messages,
        max_tokens: 4000,
        temperature: 0.65,
      }),
      signal: AbortSignal.timeout(60000),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data?.error?.message || `Gateway HTTP ${resp.status}`)
    return data?.choices?.[0]?.message?.content || ''
  }

  function applyLintResult(lint: ReturnType<typeof lintPine>, label: string) {
    setLintResult(lint)
    if (!lint.passed) {
      setLintDisplay({ state: 'fail', text: `✗ ${lint.violations.join(' · ')}` })
    } else if (lint.warnings.length) {
      setLintDisplay({ state: 'warn', text: `⚠ ${lint.warnings.join(' · ')}` })
    } else {
      setLintDisplay({ state: 'pass', text: `✓ Lint passed · no violations · no warnings` })
    }
    addMsg('LINTER', lint.passed
      ? `${label}: ✓ ${lint.warnings.length} warning(s)`
      : `${label}: ✗ ${lint.violations.length} violation(s) — ${lint.violations[0]}`,
      lint.passed ? 'ok' : 'lint')
  }

  // Generate Pine
  async function handleGenerate() {
    if (busy || gatewayStatus !== 'online') return
    setBusy(true)
    setLintDisplay(null)
    const context = `${symbol} ${timeframe} · ${backtestResult.equityCurve.length} bars loaded`
    addMsg('ROUTER', 'Task: generate Pine Script v5 strategy', 'route')
    addMsg('CONTEXT', context, 'sys')
    addMsg('CLAUDE', 'Generating liquidity sweep + BOS strategy…', 'work')
    try {
      const raw = await callGateway([
        {
          role: 'system',
          content: 'You are a Pine Script v5 expert. Output only a complete, production-ready Pine Script v5 strategy. Include //@version=5, strategy(), barstate.isconfirmed on all entries, commission_value, and slippage. No explanation outside the code block.',
        },
        {
          role: 'user',
          content: `Generate a Pine Script v5 liquidity sweep + BOS strategy for ${symbol}.\nContext: ${context}\nFocus: liquidity sweep detection, BOS confirmation, ATR-based stops.\nOutput in a single \`\`\`pinescript block.`,
        },
      ])
      const code = extractCode(raw)
      setPineCode(code)
      const lint = lintPine(code)
      applyLintResult(lint, 'Generated')
      addPineVault({ name: `${symbol}_${timeframe}_${new Date().toLocaleTimeString()}.pine`, code, lintPassed: lint.passed, violations: lint.violations, warnings: lint.warnings, source: 'generate' })
      addAgentMessage({ agent: 'Swarm', level: 'success', message: `Pine generated — ${code.length} chars — lint ${lint.passed ? 'OK' : 'FAIL'}` })
      addMsg('DONE', `${code.length} chars · ready to deploy to TradingView`, 'ok')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPineCode(`// Generation failed: ${msg}`)
      addMsg('ERROR', msg, 'err')
      addAgentMessage({ agent: 'Swarm', level: 'error', message: `Generation failed: ${msg}` })
    } finally {
      setBusy(false)
    }
  }

  // Repair Pine
  async function handleRepair() {
    if (busy || gatewayStatus !== 'online' || !repairInput.trim()) return
    setBusy(true)
    setLintDisplay(null)
    const preLint = lintPine(repairInput)
    const issueStr = [
      ...preLint.violations.map(v => `VIOLATION: ${v}`),
      ...preLint.warnings.map(w => `WARNING: ${w}`),
    ].join('\n') || 'No automatic violations — apply user request below.'

    addMsg('LINTER', `Pre-repair: ${preLint.violations.length} violations, ${preLint.warnings.length} warnings`, 'lint')
    if (repairRequest) addMsg('REQUEST', `"${repairRequest}"`, 'route')
    addMsg('CLAUDE', 'Repairing code…', 'work')

    try {
      const raw = await callGateway([
        {
          role: 'system',
          content: 'You are a Pine Script v5 expert. Fix ALL listed issues and apply the user request. Return ONLY the complete repaired Pine Script in a single ```pinescript block. Do not truncate.',
        },
        {
          role: 'user',
          content: `PINE SCRIPT TO REPAIR:\n\`\`\`pinescript\n${repairInput}\n\`\`\`\n\nISSUES:\n${issueStr}\n\n${repairRequest ? `USER REQUEST:\n${repairRequest}\n\n` : ''}RULES:\n- //@version=5\n- barstate.isconfirmed on all entries\n- No lookahead in security()\n- Include commission_value and slippage\n- Preserve all original logic`,
        },
      ])
      const code = extractCode(raw)
      setPineCode(code)
      const postLint = lintPine(code)
      applyLintResult(postLint, 'Repaired')
      addPineVault({ name: `${symbol}_${timeframe}_repair_${new Date().toLocaleTimeString()}.pine`, code, lintPassed: postLint.passed, violations: postLint.violations, warnings: postLint.warnings, source: 'repair' })
      const fixed = preLint.violations.filter(v => !postLint.violations.includes(v))
      if (fixed.length) addMsg('FIXED', `Resolved: ${fixed.join(' · ')}`, 'ok')
      if (postLint.violations.length) addMsg('REMAIN', `Still open: ${postLint.violations.join(' · ')}`, 'lint')
      addMsg('DONE', `${code.length} chars · repair complete`, 'ok')
      addAgentMessage({ agent: 'Swarm', level: postLint.passed ? 'success' : 'warn', message: `Pine repaired — ${postLint.violations.length} violations remaining` })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addMsg('ERROR', msg, 'err')
      addAgentMessage({ agent: 'Swarm', level: 'error', message: `Repair failed: ${msg}` })
    } finally {
      setBusy(false)
    }
  }

  function copyPine() {
    if (!pineCode) return
    navigator.clipboard.writeText(pineCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <Panel
      className="swarm-panel"
      ref={(el: HTMLElement | null) => { panelRef.current = el }}>
      <SwarmHeader
        breadcrumb="Swarm › Step 04"
        title="Code generation · repair"
        gatewayStatus={gatewayStatus}
        onExpand={toggleFullscreen}
        isFullscreen={isFs}
      />
      <div className="swarm-workspace">

        {/* LEFT: Gateway + Agents + Message window */}
        <div className="swarm-left">
          <Card className="swarm-card">
            <span className="eyebrow">Gateway · Port 8001</span>
            <div className="swarm-gw-meta">{gatewayMeta}</div>
            <div className="swarm-agent-grid">
              {AGENTS.map(a => (
                <div key={a.name} className="swarm-agent-card">
                  <div className="swarm-agent-name">{a.name}</div>
                  <div className="swarm-agent-role">{a.role}</div>
                  <div className="swarm-agent-model">{a.model}</div>
                  <span className="swarm-agent-tier">{a.tier}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="swarm-card swarm-msgs-card">
            <div className="swarm-msgs-head">
              <span className="eyebrow">Agent Messages</span>
              <button className="swarm-clear-btn" onClick={() => setAgentMsgs([
                { id: msgIdRef.current++, who: 'VEGA', txt: 'Cleared.', level: 'sys' }
              ])}>CLEAR</button>
            </div>
            <div className="swarm-msgs">
              {agentMsgs.map(m => (
                <div key={m.id} className={`swarm-msg swarm-msg--${m.level}`}>
                  <span className="swarm-msg-who">{m.who}</span>
                  <span className="swarm-msg-txt">{m.txt}</span>
                </div>
              ))}
              <div ref={msgsEndRef} />
            </div>
          </Card>
        </div>

        {/* RIGHT: Mode toggle + Input + Output */}
        <div className="swarm-right">
          <Card className="swarm-card">
            {/* Mode toggle */}
            <div className="seg" style={{ marginBottom: 16 }}>
              <button className={`seg-btn ${mode === 'generate' ? 'seg-on' : ''}`} onClick={() => setMode('generate')}>⬡ Generate</button>
              <button className={`seg-btn ${mode === 'repair' ? 'seg-on' : ''}`} onClick={() => setMode('repair')}>⚙ Repair</button>
            </div>

            {mode === 'generate' && (
              <div className="swarm-mode-pane">
                <p className="sub">Sends current replay context + instrument to the Swarm. Output is linted by the anti-cheat validator.</p>
                <Button variant="primary"
                  disabled={busy || gatewayStatus !== 'online'}
                  onClick={handleGenerate}>
                  {busy ? '⏳ Generating…' : '⬡ Generate Pine Script'}
                </Button>
              </div>
            )}

            {mode === 'repair' && (
              <div className="swarm-mode-pane">
                <p className="sub">Paste Pine Script. Describe what to fix — or leave blank to auto-diagnose.</p>
                <textarea
                  className="swarm-textarea"
                  placeholder={"Paste Pine Script here…\n\n//@version=5\nstrategy(...)"}
                  value={repairInput}
                  onChange={e => setRepairInput(e.target.value)}
                />
                <input
                  className="swarm-input"
                  placeholder="What to fix? e.g. fix SL/TP, remove repainting, add barstate.isconfirmed…"
                  value={repairRequest}
                  onChange={e => setRepairRequest(e.target.value)}
                />
                <Button variant="primary"
                  disabled={busy || gatewayStatus !== 'online' || !repairInput.trim()}
                  onClick={handleRepair}>
                  {busy ? '⏳ Repairing…' : '⚙ Repair Pine Script'}
                </Button>
              </div>
            )}
          </Card>

          {/* Pine output */}
          <Card className="swarm-card swarm-output-card">
            <div className="swarm-output-head">
              <span className="eyebrow">Pine Script Output</span>
              {pineCode && (
                <button className="swarm-copy-btn" onClick={copyPine}>
                  {copied ? 'COPIED ✓' : 'COPY'}
                </button>
              )}
            </div>
            {lintDisplay && (
              <div className={`swarm-lint swarm-lint--${lintDisplay.state}`}>{lintDisplay.text}</div>
            )}
            <div
              className="swarm-pine-out"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: pineCode ? highlightPine(pineCode) : '<span class="swarm-pine-placeholder">Awaiting generation or repair…</span>' }}
            />
          </Card>
        </div>
      </div>
    </Panel>
  )
}
