import { z } from 'zod'

export const qtyTypeSchema = z.enum(['fixed', 'cash', 'percent_of_equity'])
export const commissionTypeSchema = z.enum(['percent', 'cash_per_contract', 'cash_per_order'])
export const recalcModeSchema = z.enum(['close_only', 'on_order_fill', 'every_tick'])
export const orderFillModeSchema = z.enum(['on_close', 'next_open', 'bar_magnifier', 'standard_ohlc'])

export const backtestRiskSchema = z.object({
  maxDrawdownPct: z.number().positive().max(100).optional(),
  maxDrawdownCurrency: z.number().positive().optional(),
  maxDailyLossPct: z.number().positive().max(100).optional(),
  maxDailyLossCurrency: z.number().positive().optional(),
  maxWeeklyLossPct: z.number().positive().max(100).optional(),
  maxTradeLossPct: z.number().positive().max(100).optional(),
  maxTradeLossCurrency: z.number().positive().optional(),
  riskPerTradePct: z.number().positive().max(100).optional(),
  riskPerTradeCurrency: z.number().positive().optional(),
  maxOpenRiskPct: z.number().positive().max(100).optional(),
  maxPortfolioExposurePct: z.number().positive().max(100).optional(),
  maxPyramidsAllowed: z.number().int().nonnegative().optional(),
  maxConsecutiveLosses: z.number().int().nonnegative().optional(),
  maxConsecutiveWins: z.number().int().nonnegative().optional(),
  maxBarsInTrade: z.number().int().positive().optional(),
  maxHoldingMinutes: z.number().int().positive().optional(),
  profitFactorMin: z.number().positive().optional(),
  recoveryFactorMin: z.number().positive().optional(),
  expectancyMin: z.number().optional(),
  winRateMin: z.number().positive().max(100).optional(),
  sharpeMin: z.number().optional(),
  sortinoMin: z.number().optional(),
  kellyFraction: z.number().min(0).max(1).optional(),
  fractionOfKelly: z.number().min(0).max(1).optional(),
  varPct: z.number().positive().max(1).optional(),
  varLookback: z.number().int().positive().optional(),
  cvarPct: z.number().positive().max(1).optional(),
})

export const strategyPropertySchema = z.object({
  initialCapital: z.number().positive(),
  baseCurrency: z.string().min(1),
  qtyType: qtyTypeSchema,
  qtyValue: z.number().positive(),
  pyramiding: z.number().int().nonnegative(),
  commissionType: commissionTypeSchema,
  commissionValue: z.number().nonnegative(),
  slippageTicks: z.number().int().nonnegative(),
  marginLong: z.number().positive().optional(),
  marginShort: z.number().positive().optional(),
  backtestFillLimitsAssumption: z.number().nonnegative().optional(),
  recalcMode: recalcModeSchema,
  fillMode: orderFillModeSchema,
  useBarMagnifier: z.boolean(),
  processOrdersOnClose: z.boolean(),
  fillOrdersOnStandardOHLC: z.boolean(),
  backtestRisk: backtestRiskSchema.optional(),
})

export type StrategyPropertySpec = z.infer<typeof strategyPropertySchema>
export type BacktestRiskSpec = z.infer<typeof backtestRiskSchema>
