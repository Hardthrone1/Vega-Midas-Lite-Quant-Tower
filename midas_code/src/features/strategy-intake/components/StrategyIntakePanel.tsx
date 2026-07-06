import React from 'react';
import { z } from 'zod';
import { Panel, Field, Button, Badge } from '../../../shared/ui';
import { useStrategyStore } from '../../../store/useStrategyStore';
import { createDefaultSpec } from '../../../shared/validation/strategySchema';
import {
  deployLabel,
  deployStatusKind,
  deployProgress,
  DEPLOY_PIPELINE,
} from '../../../shared/deployStatus';

const SYMBOLS = ['MGC1!', 'MNQ1!', 'NQ1!'];
const TIMEFRAMES = ['1m', '5m', '13m', '15m', '1h'];
const SESSIONS = ['NY Open', 'London Open', 'RTH', 'Globex', 'Lunch'];
const RISK = ['conservative', 'balanced', 'aggressive'];
const MODES: Array<'research' | 'paper' | 'live-ready'> = ['research', 'paper', 'live-ready'];

const API_BASE = import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8001';

const IntakeResponseSchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  session: z.object({ sessionName: z.string() }).optional(),
  riskProfile: z.string().optional(),
  executionMode: z.string().optional(),
  entry: z.object({
    side: z.string().optional(),
    orderType: z.string().optional(),
    confirmOnBarClose: z.boolean().optional(),
    allowPyramiding: z.boolean().optional(),
    conditions: z.array(z.object({
      type: z.string(),
      parameters: z.record(z.unknown()),
      description: z.string().optional(),
    })).optional(),
  }).optional(),
});

// Must be defined before startSpec
function normalizeConditions(raw: unknown[]): Array<{ type: string; parameters: Record<string, unknown>; description: string }> {
  if (!Array.isArray(raw)) return [];

  return raw.map((cond: any) => {
    // Already correct
    if (cond.type && cond.parameters && typeof cond.parameters === 'object') {
      return {
        type: cond.type,
        parameters: cond.parameters,
        description: cond.description || cond.type,
      };
    }

    // Extract type from expression e.g. "atr_expansion(length=14)" → "atr_expansion"
    let type = 'custom';
    if (typeof cond.expression === 'string') {
      const m = cond.expression.match(/^([a-zA-Z_]+)/);
      if (m) type = m[1].toLowerCase();
    } else if (typeof cond.description === 'string') {
      type = cond.description.toLowerCase().replace(/\s+/g, '_');
    } else if (typeof cond.type === 'string') {
      type = cond.type;
    }

    // Extract parameters from expression
    const parameters: Record<string, unknown> = {};
    if (typeof cond.expression === 'string') {
      const pm = cond.expression.match(/\(([^)]*)\)/);
      if (pm && pm[1].trim()) {
        pm[1].split(',').forEach((pair: string) => {
          const [k, v] = pair.split('=').map((s) => s.trim().replace(/"/g, ''));
          if (k && v !== undefined) {
            const n = Number(v);
            parameters[k] = isNaN(n) ? v : n;
          }
        });
      }
    }

    const description = (cond.description || type).trim();
    return { type, parameters, description };
  });
}

export function StrategyIntakePanel() {
  const {
    symbol,
    timeframe,
    session,
    riskProfile,
    executionMode,
    setSymbol,
    setTimeframe,
    setSession,
    setRiskProfile,
    setExecutionMode,
    canonicalSpec,
    setCanonicalSpec,
    addAgentMessage,
    deployStatus,
    deployBlockers,
    lintResult,
    parityResult,
    backtestResult,
  } = useStrategyStore();

  const [loading, setLoading] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  const startSpec = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    const intakeData = { symbol, timeframe, session, riskProfile, executionMode };

    // Set timeout: abort if request takes >45 seconds
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    const systemPrompt = 'You are an expert quantitative futures trading strategist. Call the submit_strategy_spec tool. For entry conditions use ONLY this format: { "type": "<type>", "parameters": { ...numbers }, "description": "..." }. Valid types: ema_crossover, session_filter, volume_spike, rsi_oversold, rsi_overbought, atr_expansion, htf_trend, breakout, custom. DO NOT use fields named id, expression, or enabled. For MGC1!: prefer atr_expansion, htf_trend, breakout. For MNQ1!/NQ1!: prefer ema_crossover, volume_spike, rsi_oversold. Always output 2–4 conditions with concrete numeric parameters.';

    try {
      const requestBody = {
        model: 'meta/llama-3.3-70b-instruct',
        provider: 'openrouter',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `Generate a strategy spec: ${JSON.stringify(intakeData)}`,
          },
        ],
        max_tokens: 2000,
        temperature: 0.3,
        tools: [
          {
            type: 'function',
            function: {
              name: 'submit_strategy_spec',
              description: 'Submit a structured CanonicalStrategySpec.',
              parameters: {
                type: 'object',
                required: ['symbol', 'timeframe', 'session'],
                properties: {
                  symbol: { type: 'string' },
                  timeframe: { type: 'string' },
                  session: {
                    type: 'object',
                    required: ['sessionName'],
                    properties: {
                      sessionName: { type: 'string' },
                      timezone: { type: 'string' },
                      tradeRTHOnly: { type: 'boolean' },
                    },
                  },
                  riskProfile: { type: 'string', enum: ['conservative', 'balanced', 'aggressive'] },
                  executionMode: { type: 'string', enum: ['research', 'paper', 'live-ready'] },
                  entry: {
                    type: 'object',
                    required: ['conditions'],
                    properties: {
                      side: { type: 'string', enum: ['long', 'short', 'both'] },
                      orderType: { type: 'string', enum: ['market', 'limit', 'stop'] },
                      confirmOnBarClose: { type: 'boolean' },
                      allowPyramiding: { type: 'boolean' },
                      conditions: {
                        type: 'array',
                        minItems: 2,
                        maxItems: 4,
                        items: {
                          type: 'object',
                          required: ['type', 'parameters'],
                          properties: {
                            type: {
                              type: 'string',
                              enum: ['ema_crossover', 'session_filter', 'volume_spike', 'rsi_oversold', 'rsi_overbought', 'atr_expansion', 'htf_trend', 'breakout', 'custom'],
                            },
                            parameters: { type: 'object' },
                            description: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'submit_strategy_spec' } },
      };

      const response = await fetch(`${API_BASE}/api/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || 'Gateway error');
      }

      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error('No tool call returned by model');

      let rawSpec: unknown;
      try {
        rawSpec = JSON.parse(toolCall.function.arguments);
      } catch {
        throw new Error('Model returned malformed JSON — try again');
      }

      // Normalize conditions before validation
      const specObj = rawSpec as any;
      if (Array.isArray(specObj?.entry?.conditions)) {
        specObj.entry.conditions = normalizeConditions(specObj.entry.conditions);
      }

      const validatedSpec = IntakeResponseSchema.parse(specObj);

      const finalSpec = {
        ...createDefaultSpec({ symbol: validatedSpec.symbol, timeframe: validatedSpec.timeframe }),
        ...validatedSpec,
        session: validatedSpec.session || { sessionName: session },
      };

      setCanonicalSpec(finalSpec);
      addAgentMessage({ agent: 'Intake', level: 'success', message: 'Spec generated via Gateway' });

    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        addAgentMessage({ agent: 'Intake', level: 'error', message: 'Request timeout — OpenRouter fallback may be experiencing issues. Check API keys in .env' });
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to generate spec';
      console.error('[INTAKE ERROR]', error);
      addAgentMessage({ agent: 'Intake', level: 'error', message });
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const progress = deployProgress(deployStatus);
  const statusKind = deployStatusKind(deployStatus);
  const stepIndex = DEPLOY_PIPELINE.indexOf(deployStatus);

  const statusLine = (() => {
    if (deployStatus === 'deploy_blocked' && deployBlockers.length)
      return `Blocked: ${deployBlockers[0]}`;
    if (deployStatus === 'deploy_ready') return 'Ready to deploy';
    if (deployStatus === 'risk_scored') return 'Risk scored — all gates passed';
    if (deployStatus === 'backtested')
      return `Backtest done · ${backtestResult?.trades?.length || 0} trades`;
    if (deployStatus === 'parity_checked')
      return `Parity ${parityResult?.passed ? 'passed' : 'failed'} · ${parityResult?.mismatchCount || 0} mismatches`;
    if (deployStatus === 'lint_passed')
      return `Lint passed · ${lintResult?.warnings?.length || 0} warning(s)`;
    if (deployStatus === 'pine_generated') return 'Pine generated — awaiting lint';
    if (deployStatus === 'spec_ready')
      return `Spec ready · ${symbol} ${timeframe} · ${session}`;
    return 'Awaiting spec draft';
  })();

  return (
    <Panel
      eyebrow="Step 01"
      title="Strategy intake"
      actions={canonicalSpec ? <Badge status="ok">spec live</Badge> : <Badge>no spec</Badge>}
    >
      <div className="col">
        <div className="system-state-strip">
          <div className="sss-head">
            <span className="eyebrow">System state</span>
            <span className={`sss-badge sss-badge--${statusKind}`}>{deployLabel(deployStatus)}</span>
          </div>
          <div className="sss-bar-track">
            <div
              className={`sss-bar-fill sss-bar-fill--${statusKind}`}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="sss-steps">
            {DEPLOY_PIPELINE.map((s, i) => (
              <div
                key={s}
                className={`sss-step ${i <= stepIndex ? 'sss-step--on' : ''} ${s === deployStatus ? 'sss-step--active' : ''}`}
                title={deployLabel(s)}
              />
            ))}
          </div>
          <div className="sss-line">{statusLine}</div>
          {deployStatus === 'deploy_blocked' && deployBlockers.length > 0 && (
            <div className="sss-blockers">
              {deployBlockers.slice(0, 2).map((b, i) => (
                <div key={i} className="sss-blocker">→ {b}</div>
              ))}
            </div>
          )}
        </div>

        <Field label="Instrument" hint="Contract drives tick economics & guardrails" htmlFor="symbol-select">
          <select id="symbol-select" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        <div className="grid-2">
          <Field label="Timeframe" htmlFor="timeframe-select">
            <select id="timeframe-select" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              {TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Session" htmlFor="session-select">
            <select id="session-select" value={session} onChange={(e) => setSession(e.target.value)}>
              {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Risk profile" htmlFor="risk-profile-select">
          <select id="risk-profile-select" value={riskProfile} onChange={(e) => setRiskProfile(e.target.value)}>
            {RISK.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>

        <Field label="Execution mode" hint="Gates how strict the deploy checks are">
          <div className="seg" role="group" aria-label="Execution mode">
            {MODES.map((m) => (
              <button
                key={m}
                className={`seg-btn ${executionMode === m ? 'seg-on' : ''}`}
                onClick={() => setExecutionMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>

        <Button variant="primary" onClick={startSpec} disabled={loading}>
          {loading ? 'Drafting…' : canonicalSpec ? 'Reset spec from intake' : 'Draft canonical spec'}
        </Button>
      </div>
    </Panel>
  );
}