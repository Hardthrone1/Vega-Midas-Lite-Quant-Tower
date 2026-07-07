import React from 'react';
import { z } from 'zod';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Dropdown,
  Field,
  Option,
  ProgressBar,
  Radio,
  RadioGroup,
  Spinner,
} from '@fluentui/react-components';
import { Panel, Badge } from '../../../shared/ui';
import { useStrategyStore } from '../../../store/useStrategyStore';
import { createDefaultSpec } from '../../../shared/validation/strategySchema';
import { useBlades } from '../../../app/layout/blades';
import {
  deployLabel,
  deployStatusKind,
  deployProgress,
  DEPLOY_PIPELINE,
} from '../../../shared/deployStatus';

const SYMBOLS = ['MGC1!', 'MNQ1!', 'NQ1!'] as const;
const TIMEFRAMES = ['1m', '5m', '13m', '15m', '1h'] as const;
const SESSIONS = ['NY Open', 'London Open', 'RTH', 'Globex', 'Lunch'] as const;
const RISK_PROFILES = ['conservative', 'balanced', 'aggressive'] as const;
const EXECUTION_MODES = ['research', 'paper', 'live-ready'] as const;

// The Zod schema is the validation contract for the intake form; React Hook
// Form binds it onto the Fluent fields below via zodResolver.
const intakeFormSchema = z.object({
  symbol: z.enum(SYMBOLS, { errorMap: () => ({ message: 'Select a supported contract' }) }),
  timeframe: z.enum(TIMEFRAMES, { errorMap: () => ({ message: 'Select a timeframe' }) }),
  session: z.enum(SESSIONS, { errorMap: () => ({ message: 'Select a trading session' }) }),
  riskProfile: z.enum(RISK_PROFILES, { errorMap: () => ({ message: 'Select a risk profile' }) }),
  executionMode: z.enum(EXECUTION_MODES, { errorMap: () => ({ message: 'Select an execution mode' }) }),
});

type IntakeFormValues = z.infer<typeof intakeFormSchema>;

// Store values can predate the enum lists (e.g. persisted 'MGC' vs 'MGC1!');
// coerce them to a valid option so the form starts in a submittable state.
function pickEnum<T extends string>(value: string, options: readonly T[]): T {
  return (options as readonly string[]).includes(value) ? (value as T) : options[0];
}

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

  const { openBlade } = useBlades();
  const [loading, setLoading] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<IntakeFormValues>({
    resolver: zodResolver(intakeFormSchema),
    mode: 'onChange',
    defaultValues: {
      symbol: pickEnum(symbol, SYMBOLS),
      timeframe: pickEnum(timeframe, TIMEFRAMES),
      session: pickEnum(session, SESSIONS),
      riskProfile: pickEnum(riskProfile, RISK_PROFILES),
      executionMode: pickEnum(executionMode, EXECUTION_MODES),
    },
  });

  const startSpec = async (intakeData: IntakeFormValues) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Zod already validated the form — sync the values into the store so the
    // rest of the pipeline (and the header context strip) sees them.
    setSymbol(intakeData.symbol);
    setTimeframe(intakeData.timeframe);
    setSession(intakeData.session);
    setRiskProfile(intakeData.riskProfile);
    setExecutionMode(intakeData.executionMode);

    setLoading(true);

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
        session: validatedSpec.session || { sessionName: intakeData.session },
      };

      setCanonicalSpec(finalSpec);
      addAgentMessage({ agent: 'Intake', level: 'success', message: 'Spec generated via Gateway' });
      // Azure Portal behavior: the result opens as a child blade to the right.
      openBlade('spec');

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

  const progressColor =
    statusKind === 'err' ? 'error' : statusKind === 'warn' ? 'warning' : statusKind === 'ok' ? 'success' : 'brand';

  return (
    <Panel>
      <header className="panel-header">
        <div className="panel-header-left">
          <span className="panel-step">Step 01</span>
          <h1 className="panel-title">Strategy intake</h1>
        </div>
        <div className="panel-header-right">
          {canonicalSpec ? <Badge status="ok">spec live</Badge> : <Badge>no spec</Badge>}
        </div>
      </header>
      <form className="col" onSubmit={handleSubmit(startSpec)} noValidate>
        <div className="system-state-strip">
          <div className="sss-head">
            <span className="eyebrow">System state</span>
            <Badge status={statusKind}>{deployLabel(deployStatus)}</Badge>
          </div>
          <ProgressBar value={progress} max={1} thickness="medium" color={progressColor} />
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

        <Controller
          name="symbol"
          control={control}
          render={({ field }) => (
            <Field
              label="Instrument"
              hint="Contract drives tick economics & guardrails"
              validationMessage={errors.symbol?.message}
            >
              <Dropdown
                placeholder="Select a contract"
                value={field.value ?? ''}
                selectedOptions={field.value ? [field.value] : []}
                onOptionSelect={(_, data) => field.onChange(data.optionValue)}
                onBlur={field.onBlur}
              >
                {SYMBOLS.map((s) => (
                  <Option key={s} value={s}>{s}</Option>
                ))}
              </Dropdown>
            </Field>
          )}
        />

        <div className="grid-2">
          <Controller
            name="timeframe"
            control={control}
            render={({ field }) => (
              <Field label="Timeframe" validationMessage={errors.timeframe?.message}>
                <Dropdown
                  placeholder="Select a timeframe"
                  value={field.value ?? ''}
                  selectedOptions={field.value ? [field.value] : []}
                  onOptionSelect={(_, data) => field.onChange(data.optionValue)}
                  onBlur={field.onBlur}
                >
                  {TIMEFRAMES.map((t) => (
                    <Option key={t} value={t}>{t}</Option>
                  ))}
                </Dropdown>
              </Field>
            )}
          />
          <Controller
            name="session"
            control={control}
            render={({ field }) => (
              <Field label="Session" validationMessage={errors.session?.message}>
                <Dropdown
                  placeholder="Select a session"
                  value={field.value ?? ''}
                  selectedOptions={field.value ? [field.value] : []}
                  onOptionSelect={(_, data) => field.onChange(data.optionValue)}
                  onBlur={field.onBlur}
                >
                  {SESSIONS.map((s) => (
                    <Option key={s} value={s}>{s}</Option>
                  ))}
                </Dropdown>
              </Field>
            )}
          />
        </div>

        <Controller
          name="riskProfile"
          control={control}
          render={({ field }) => (
            <Field label="Risk profile" validationMessage={errors.riskProfile?.message}>
              <Dropdown
                placeholder="Select a risk profile"
                value={field.value ?? ''}
                selectedOptions={field.value ? [field.value] : []}
                onOptionSelect={(_, data) => field.onChange(data.optionValue)}
                onBlur={field.onBlur}
              >
                {RISK_PROFILES.map((r) => (
                  <Option key={r} value={r}>{r}</Option>
                ))}
              </Dropdown>
            </Field>
          )}
        />

        <Controller
          name="executionMode"
          control={control}
          render={({ field }) => (
            <Field
              label="Execution mode"
              hint="Gates how strict the deploy checks are"
              validationMessage={errors.executionMode?.message}
            >
              <RadioGroup
                layout="horizontal"
                value={field.value}
                onChange={(_, data) => field.onChange(data.value)}
              >
                {EXECUTION_MODES.map((m) => (
                  <Radio key={m} value={m} label={m} />
                ))}
              </RadioGroup>
            </Field>
          )}
        />

        <Button
          appearance="primary"
          type="submit"
          disabled={loading}
          icon={loading ? <Spinner size="tiny" /> : undefined}
        >
          {loading ? 'Drafting…' : canonicalSpec ? 'Reset spec from intake' : 'Draft canonical spec'}
        </Button>
      </form>
    </Panel>
  );
}
