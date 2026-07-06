// src/shared/validation/strategySchema.ts
//
// The canonical strategy spec is the single source of truth: Pine and Python
// are both generated FROM this object, so the two execution paths can never
// silently drift. Every field the store reads (meta.strategyId, meta.updatedAt,
// asset.symbol, asset.timeframe, session.sessionName, properties) lives here.
//
// Re-exports the property schema so the store can import both from one module.

import { z } from 'zod'
import {
  strategyPropertySchema,
} from './strategyPropertySchema'

export {
  strategyPropertySchema,
  type StrategyPropertySpec,
} from './strategyPropertySchema'

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

export const sideSchema = z.enum(['long', 'short', 'both'])

export const orderTypeSchema = z.enum(['market', 'limit', 'stop', 'stop_limit'])

export const stopModeSchema = z.enum([
  'fixed_ticks',
  'fixed_pct',
  'atr',
  'structure',
  'none',
])

export const targetModeSchema = z.enum([
  'fixed_ticks',
  'fixed_pct',
  'atr',
  'rr_multiple',
  'none',
])

// One trade-management leg (stop or target).
export const exitLegSchema = z.object({
  mode: z.union([stopModeSchema, targetModeSchema]),
  value: z.number().nonnegative().optional(),
  atrLength: z.number().int().positive().optional(),
  atrMultiplier: z.number().positive().optional(),
  rrMultiple: z.number().positive().optional(),
})

// A single rule in the entry/exit condition list. Supports both old (expression-based)
// and new (type/parameters-based) formats for backward compatibility.
export const conditionSchema = z.union([
  // New format: type + parameters (from LLM, normalized at gateway)
  z.object({
    type: z.string().min(1),
    parameters: z.record(z.unknown()).default({}),
    description: z.string().min(1),
  }),
  // Old format: id + expression (legacy UI editing)
  z.object({
    id: z.string().min(1),
    description: z.string().min(1),
    expression: z.string().min(1),
    enabled: z.boolean().default(true),
  }),
])

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export const metaSchema = z.object({
  strategyId: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1).default('0.1.0'),
  author: z.string().optional(),
  description: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  tags: z.array(z.string()).default([]),
})

export const assetSchema = z.object({
  symbol: z.string().min(1), // e.g. "MGC1!" or "MNQ1!"
  timeframe: z.string().min(1), // e.g. "5m", "13m"
  tickSize: z.number().positive().optional(),
  pointValue: z.number().positive().optional(),
  contract: z.enum(['MGC', 'MNQ', 'NQ', 'custom']).optional(),
})

export const sessionSchema = z.object({
  sessionName: z.string().min(1), // e.g. "NY Open"
  timezone: z.string().min(1).default('America/New_York'),
  start: z.string().optional(), // "09:30"
  end: z.string().optional(), // "16:00"
  tradeRTHOnly: z.boolean().default(true),
})

export const entrySchema = z.object({
  side: sideSchema,
  orderType: orderTypeSchema.default('market'),
  conditions: z.array(conditionSchema).default([]),
  confirmOnBarClose: z.boolean().default(true), // live-safety gate
  allowPyramiding: z.boolean().default(false),
})

export const exitSchema = z.object({
  stop: exitLegSchema,
  target: exitLegSchema,
  useTrailing: z.boolean().default(false),
  trailMode: stopModeSchema.default('none'),
  trailValue: z.number().nonnegative().optional(),
  timeStopBars: z.number().int().positive().optional(),
})

// ---------------------------------------------------------------------------
// Canonical spec
// ---------------------------------------------------------------------------

export const canonicalStrategySchema = z.object({
  meta: metaSchema,
  asset: assetSchema,
  session: sessionSchema.optional(),
  entry: entrySchema,
  exit: exitSchema,
  properties: strategyPropertySchema,
})

export type CanonicalStrategySpec = z.infer<typeof canonicalStrategySchema>
export type EntrySpec = z.infer<typeof entrySchema>
export type ExitSpec = z.infer<typeof exitSchema>
export type ConditionSpec = z.infer<typeof conditionSchema>

// ---------------------------------------------------------------------------
// Factory — a valid default spec so the UI always has something to edit.
// ---------------------------------------------------------------------------

export function contractFromSymbol(symbol: string): string {
  const map: Record<string, string> = {
    'MGC1!': 'MGC',
    'MNQ1!': 'MNQ',
    'NQ1!': 'NQ',
  }
  return map[symbol] ?? symbol.replace(/1!$/, '')
}

function assetContractFromSymbol(symbol: string): 'MGC' | 'MNQ' | 'NQ' | 'custom' {
  const contract = contractFromSymbol(symbol)
  if (contract === 'MGC' || contract === 'MNQ' || contract === 'NQ') return contract
  return 'custom'
}

export function createDefaultSpec(
  overrides?: Partial<{ strategyId: string; symbol: string; timeframe: string }>
): CanonicalStrategySpec {
  const now = new Date().toISOString()
  const id = overrides?.strategyId ?? `strat_${Date.now()}`
  const symbol = overrides?.symbol ?? 'MGC1!'
  return {
    meta: {
      strategyId: id,
      name: 'Untitled Strategy',
      version: '0.1.0',
      createdAt: now,
      updatedAt: now,
      tags: [],
    },
    asset: {
      symbol,
      timeframe: overrides?.timeframe ?? '5m',
      contract: assetContractFromSymbol(symbol),
    },
    session: {
      sessionName: 'NY Open',
      timezone: 'America/New_York',
      tradeRTHOnly: true,
    },
    entry: {
      side: 'both',
      orderType: 'market',
      conditions: [],
      confirmOnBarClose: true,
      allowPyramiding: false,
    },
    exit: {
      stop: { mode: 'atr', atrLength: 14, atrMultiplier: 1.5 },
      target: { mode: 'rr_multiple', rrMultiple: 2 },
      useTrailing: false,
      trailMode: 'none',
    },
    properties: {
      initialCapital: 10000,
      baseCurrency: 'USD',
      qtyType: 'fixed',
      qtyValue: 1,
      pyramiding: 0,
      commissionType: 'cash_per_contract',
      commissionValue: 0.62,
      slippageTicks: 1,
      recalcMode: 'close_only',
      fillMode: 'on_close',
      useBarMagnifier: false,
      processOrdersOnClose: true,
      fillOrdersOnStandardOHLC: true,
    },
  }
}

// ---------------------------------------------------------------------------
// Gateway tool: submit_strategy_spec (intake → canonical bridge)
// ---------------------------------------------------------------------------

export const intakeConditionTypeSchema = z.enum([
  'ema_crossover',
  'session_filter',
  'volume_spike',
  'rsi_oversold',
  'rsi_overbought',
  'atr_expansion',
  'htf_trend',
  'breakout',
  'custom',
])

export const intakeConditionSchema = z.object({
  type: intakeConditionTypeSchema,
  parameters: z.record(z.unknown()),
  description: z.string().optional(),
})

export const SubmitStrategySpecSchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  session: z.object({
    sessionName: z.string(),
    timezone: z.string().optional(),
    tradeRTHOnly: z.boolean().optional(),
  }),
  riskProfile: z.enum(['conservative', 'balanced', 'aggressive']).optional(),
  executionMode: z.enum(['research', 'paper', 'live-ready']).optional(),
  entry: z
    .object({
      side: sideSchema.optional(),
      orderType: orderTypeSchema.optional(),
      confirmOnBarClose: z.boolean().optional(),
      allowPyramiding: z.boolean().optional(),
      conditions: z.array(intakeConditionSchema).min(2).max(5),
    })
    .optional(),
})

export type SubmitStrategySpec = z.infer<typeof SubmitStrategySpecSchema>
export type IntakeCondition = z.infer<typeof intakeConditionSchema>

const CONDITION_TYPES = new Set(intakeConditionTypeSchema.options)

const DEFAULT_CONDITION_PARAMETERS: Record<
  z.infer<typeof intakeConditionTypeSchema>,
  Record<string, unknown>
> = {
  ema_crossover: { fastLength: 9, slowLength: 21 },
  session_filter: { sessionName: 'NY Open' },
  volume_spike: { threshold: 2, lookback: 20 },
  rsi_oversold: { length: 14, threshold: 30 },
  rsi_overbought: { length: 14, threshold: 70 },
  atr_expansion: { atrLength: 14, multiplier: 1.5 },
  htf_trend: { timeframe: '1h', emaLength: 50 },
  breakout: { lookback: 20 },
  custom: {},
}

function isConditionType(value: string): value is z.infer<typeof intakeConditionTypeSchema> {
  return CONDITION_TYPES.has(value as z.infer<typeof intakeConditionTypeSchema>)
}

function parseParametersFromExpression(expression: string): Record<string, unknown> {
  const paramMatch = expression.match(/\(([^)]+)\)/)
  if (!paramMatch) return {}

  const params: Record<string, unknown> = {}
  for (const pair of paramMatch[1].split(',')) {
    const [rawKey, ...rest] = pair.split('=')
    if (!rawKey || rest.length === 0) continue
    const key = rawKey.trim()
    const rawValue = rest.join('=').trim().replace(/^["']|["']$/g, '')
    const numeric = Number(rawValue)
    params[key] = Number.isFinite(numeric) && rawValue !== '' ? numeric : rawValue
  }
  return params
}

function normalizeConditionParameters(
  type: z.infer<typeof intakeConditionTypeSchema>,
  parameters: Record<string, unknown>
): Record<string, unknown> {
  const p = { ...parameters }
  if (type === 'volume_spike' && p.multiplier != null && p.threshold == null) {
    p.threshold = p.multiplier
  }
  return p
}

function normalizeTypeSlug(raw: unknown): string {
  return String(raw ?? 'custom')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function coerceConditionType(raw: unknown): z.infer<typeof intakeConditionTypeSchema> {
  const slug = normalizeTypeSlug(raw)
  if (isConditionType(slug)) return slug

  const firstToken = slug.match(/^([a-z_]+)/)?.[1]
  if (firstToken && isConditionType(firstToken)) return firstToken

  return 'custom'
}

function conditionDescription(
  raw: unknown,
  fallback: string
): string {
  const text = typeof raw === 'string' ? raw.trim() : ''
  return text.length > 0 ? text : fallback.replace(/_/g, ' ')
}

function buildIntakeCondition(c: Record<string, unknown>, _index: number): IntakeCondition {
  // Already correct structure
  if (
    c.type &&
    c.parameters &&
    typeof c.parameters === 'object' &&
    !Array.isArray(c.parameters)
  ) {
    const type = coerceConditionType(c.type)
    const rawParams = c.parameters as Record<string, unknown>
    const parameters = normalizeConditionParameters(
      type,
      Object.keys(rawParams).length > 0 ? { ...rawParams } : { ...DEFAULT_CONDITION_PARAMETERS[type] }
    )
    return {
      type,
      parameters,
      description: conditionDescription(c.description, type),
    }
  }

  // === Repair the model's common output format ===
  let rawType = 'custom'

  if (typeof c.expression === 'string') {
    const match = c.expression.match(/^([a-zA-Z_]+)/)
    if (match) rawType = match[1].toLowerCase()
  } else if (typeof c.description === 'string') {
    rawType = c.description.toLowerCase().replace(/\s+/g, '_')
  } else if (c.type) {
    rawType = String(c.type)
  }

  const type = coerceConditionType(rawType)

  let parameters: Record<string, unknown> = {}
  if (c.parameters && typeof c.parameters === 'object' && !Array.isArray(c.parameters)) {
    parameters = { ...(c.parameters as Record<string, unknown>) }
  } else if (typeof c.expression === 'string') {
    parameters = parseParametersFromExpression(c.expression)
  } else if (c.expression && typeof c.expression === 'object' && !Array.isArray(c.expression)) {
    parameters = { ...(c.expression as Record<string, unknown>) }
  }

  if (Object.keys(parameters).length === 0) {
    parameters = { ...DEFAULT_CONDITION_PARAMETERS[type] }
  }

  parameters = normalizeConditionParameters(type, parameters)

  const description = (typeof c.description === 'string' ? c.description : type || '').trim()

  return {
    type,
    parameters,
    description: description.length > 0 ? description : type,
  }
}

/** Repair model-hallucinated condition arrays before Zod validation. */
export function normalizeConditions(rawConditions: unknown[]): IntakeCondition[] {
  if (!Array.isArray(rawConditions)) return []

  return rawConditions.map((cond, index) => normalizeCondition(cond, index))
}

/** Repair a single model-hallucinated condition before Zod validation. */
export function normalizeCondition(raw: unknown, index: number): IntakeCondition {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      type: 'custom',
      parameters: { ...DEFAULT_CONDITION_PARAMETERS.custom },
      description: `Condition ${index + 1}`,
    }
  }

  return buildIntakeCondition(raw as Record<string, unknown>, index)
}

/** Repair tool-call payload before SubmitStrategySpecSchema.parse(). */
export function normalizeSubmitSpec(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw

  const spec = { ...(raw as Record<string, unknown>) }
  const entry =
    spec.entry && typeof spec.entry === 'object' && !Array.isArray(spec.entry)
      ? { ...(spec.entry as Record<string, unknown>) }
      : null

  if (entry && Array.isArray(entry.conditions)) {
    entry.conditions = normalizeConditions(entry.conditions)
    spec.entry = entry
  }

  return spec
}

function intakeConditionToExpression(
  type: z.infer<typeof intakeConditionTypeSchema>,
  parameters: Record<string, unknown>
): string {
  const params = Object.entries(parameters)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(', ')
  return params ? `${type}(${params})` : type
}

export function mapSubmitSpecToCanonical(
  spec: SubmitStrategySpec,
  fallbackSession: string
): CanonicalStrategySpec {
  const base = createDefaultSpec({ symbol: spec.symbol, timeframe: spec.timeframe })
  const conditions =
    spec.entry?.conditions?.map((c, i) => ({
      id: `cond_${i + 1}`,
      description: c.description ?? c.type,
      expression: intakeConditionToExpression(c.type, c.parameters),
      enabled: true,
    })) ?? base.entry.conditions

  return {
    ...base,
    asset: {
      ...base.asset,
      symbol: spec.symbol,
      timeframe: spec.timeframe,
      contract: assetContractFromSymbol(spec.symbol),
    },
    session: spec.session
      ? {
          sessionName: spec.session.sessionName,
          timezone: spec.session.timezone ?? base.session?.timezone ?? 'America/New_York',
          tradeRTHOnly: spec.session.tradeRTHOnly ?? base.session?.tradeRTHOnly ?? true,
        }
      : { ...base.session!, sessionName: fallbackSession },
    entry: {
      ...base.entry,
      ...(spec.entry?.side !== undefined && { side: spec.entry.side }),
      ...(spec.entry?.orderType !== undefined && { orderType: spec.entry.orderType }),
      ...(spec.entry?.confirmOnBarClose !== undefined && {
        confirmOnBarClose: spec.entry.confirmOnBarClose,
      }),
      ...(spec.entry?.allowPyramiding !== undefined && {
        allowPyramiding: spec.entry.allowPyramiding,
      }),
      conditions,
    },
  }
}
