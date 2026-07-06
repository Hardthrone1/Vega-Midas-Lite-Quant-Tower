import type { CanonicalStrategySpec } from '../validation/strategySchema'

export interface StrategyVersionRecord {
  id: string
  strategyId: string
  version: string
  createdAt: string
  createdBy?: string
  source: 'ui' | 'agent' | 'import'
  spec: CanonicalStrategySpec
  specHash: string
  status: 'draft' | 'validated' | 'backtested' | 'live_ready' | 'archived'
  parentVersionId?: string
  notes?: string
  metadata?: {
    symbol: string
    timeframe: string
    session?: string
    tags?: string[]
  }
}
