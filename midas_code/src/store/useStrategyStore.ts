// src/store/useStrategyStore.ts
import { create } from 'zustand'
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware'
import {
  canonicalStrategySchema,
  strategyPropertySchema,
  type CanonicalStrategySpec,
  type StrategyPropertySpec,
} from '../shared/validation/strategySchema'
import { buildPythonBacktestPayload } from '../shared/adapters/pythonBacktestAdapter'
import { hasReduxDevtoolsExtension } from '../dev/setupDevtools'

export type Tab = 'intake' | 'spec' | 'codegen' | 'replay' | 'swarm' | 'diagnostics' | 'backtest' | 'vault' | 'hermes'

const VALID_TABS: Tab[] = ['intake', 'spec', 'codegen', 'replay', 'swarm', 'diagnostics', 'backtest', 'vault', 'hermes']

type DeployStatus =
  | 'draft'
  | 'spec_ready'
  | 'pine_generated'
  | 'lint_passed'
  | 'parity_checked'
  | 'backtested'
  | 'risk_scored'
  | 'deploy_blocked'
  | 'deploy_ready'

type AgentLevel = 'info' | 'warn' | 'error' | 'success'

type AgentMessage = {
  id: string
  agent: string
  level: AgentLevel
  message: string
  timestamp: string
}

type LintResult = {
  passed: boolean
  violations: string[]
  warnings: string[]
}

type ParityResult = {
  passed: boolean
  mismatchCount: number
  mismatches: Array<Record<string, unknown>>
}

type BacktestResult = {
  trades: Array<Record<string, unknown>>
  metrics: Record<string, number | string | null>
  equityCurve: Array<Record<string, unknown>>
}

type RiskResult = {
  score: number
  var: number | null
  kelly: number | null
  sharpe: number | null
  drawdown: number | null
}

type ValidationIssue = {
  path: string
  message: string
}

type ValidationState = {
  valid: boolean
  issues: ValidationIssue[]
}

export type ChartSource = 'bars' | 'parity'

export type ChartOverlayState = {
  source: ChartSource
  /** Aggregation interval in minutes; only meaningful for the bars source. */
  timeframe: number
}

type StrategyStore = {
  strategyId: string
  activeTab: Tab
  symbol: string
  timeframe: string
  session: string
  riskProfile: string
  executionMode: 'research' | 'paper' | 'live-ready'

  canonicalSpec: CanonicalStrategySpec | null
  strategyPropertyDraft: StrategyPropertySpec | null
  pineCode: string
  pythonCode: string

  specValidation: ValidationState
  propertyValidation: ValidationState

  lintResult: LintResult
  parityResult: ParityResult
  backtestResult: BacktestResult
  riskResult: RiskResult

  deployStatus: DeployStatus
  deployBlockers: string[]
  agentMessages: AgentMessage[]
  versionHistory: Array<{
    id: string
    name: string
    createdAt: string
    notes: string
  }>
  pineVault: Array<{
    id: string
    name: string
    code: string
    lintPassed: boolean
    violations: string[]
    warnings: string[]
    createdAt: string
    source: 'generate' | 'repair'
  }>

  pythonPayload: ReturnType<typeof buildPythonBacktestPayload> | null

  /** Full-screen chart. Lives in the store (not context) so a federated panel
   *  can open the shell-owned overlay. null = closed. */
  chartOverlay: ChartOverlayState | null

  setStrategyId: (id: string) => void
  setActiveTab: (tab: Tab) => void
  setSymbol: (symbol: string) => void
  setTimeframe: (timeframe: string) => void
  setSession: (session: string) => void
  setRiskProfile: (riskProfile: string) => void
  setExecutionMode: (mode: StrategyStore['executionMode']) => void

  validateStrategyPropertySpec: (input: unknown) => boolean
  validateCanonicalSpec: (input: unknown) => boolean

  setCanonicalSpec: (spec: unknown) => void
  updateCanonicalSpec: (patch: Partial<CanonicalStrategySpec>) => void
  setStrategyPropertyDraft: (draft: StrategyPropertySpec | null) => void
  updateStrategyPropertyDraft: (patch: Partial<StrategyPropertySpec>) => void

  commitSpecFromDraft: () => boolean
  regeneratePythonPayload: () => void

  setPineCode: (code: string) => void
  setPythonCode: (code: string) => void

  setLintResult: (result: LintResult) => void
  setParityResult: (result: ParityResult) => void
  setBacktestResult: (result: BacktestResult) => void
  setRiskResult: (result: RiskResult) => void

  setDeployStatus: (status: DeployStatus) => void
  setDeployBlockers: (blockers: string[]) => void

  addAgentMessage: (msg: Omit<AgentMessage, 'id' | 'timestamp'>) => void
  clearAgentMessages: () => void

  addVersion: (version: { name: string; notes: string }) => void
  addPineVault: (entry: { name: string; code: string; lintPassed: boolean; violations: string[]; warnings: string[]; source: 'generate' | 'repair' }) => void
  resetRun: () => void

  openChartOverlay: (opts?: Partial<ChartOverlayState>) => void
  closeChartOverlay: () => void
  setChartSource: (source: ChartSource) => void
  setChartTimeframe: (timeframe: number) => void
}

const uid = () => crypto.randomUUID()

const toIssues = (error: unknown): ValidationIssue[] => {
  if (!error || typeof error !== 'object' || !('issues' in error)) return []
  return (error as { issues: Array<{ path: (string | number)[]; message: string }> }).issues.map((i) => ({
    path: i.path.join('.'),
    message: i.message,
  }))
}

const emptyValidation = (): ValidationState => ({ valid: false, issues: [] })

const initialState = {
  strategyId: '',
  activeTab: 'intake' as const,
  symbol: 'MGC',
  timeframe: '5m',
  session: 'NY Open',
  riskProfile: 'balanced',
  executionMode: 'research' as const,

  canonicalSpec: null as CanonicalStrategySpec | null,
  strategyPropertyDraft: null as StrategyPropertySpec | null,
  pineCode: '',
  pythonCode: '',

  specValidation: emptyValidation(),
  propertyValidation: emptyValidation(),

  lintResult: { passed: false, violations: [], warnings: [] } as LintResult,
  parityResult: { passed: false, mismatchCount: 0, mismatches: [] } as ParityResult,
  backtestResult: { trades: [], metrics: {}, equityCurve: [] } as BacktestResult,
  riskResult: { score: 0, var: null, kelly: null, sharpe: null, drawdown: null } as RiskResult,

  deployStatus: 'draft' as const,
  deployBlockers: [] as string[],
  agentMessages: [] as AgentMessage[],
  versionHistory: [] as Array<{
    id: string
    name: string
    createdAt: string
    notes: string
  }>,
  pineVault: [] as Array<{
    id: string
    name: string
    code: string
    lintPassed: boolean
    violations: string[]
    warnings: string[]
    createdAt: string
    source: 'generate' | 'repair'
  }>,

  pythonPayload: null as ReturnType<typeof buildPythonBacktestPayload> | null,

  chartOverlay: null as ChartOverlayState | null,
}

export const useStrategyStore = create<StrategyStore>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        ...initialState,

        setStrategyId: (strategyId) => set({ strategyId }, false, 'setStrategyId'),
        setActiveTab: (tab) => {
          if (VALID_TABS.includes(tab)) {
            set({ activeTab: tab }, false, 'setActiveTab')
          }
        },
        setSymbol: (symbol) => set({ symbol }, false, 'setSymbol'),
        setTimeframe: (timeframe) => set({ timeframe }, false, 'setTimeframe'),
        setSession: (session) => set({ session }, false, 'setSession'),
        setRiskProfile: (riskProfile) => set({ riskProfile }, false, 'setRiskProfile'),
        setExecutionMode: (executionMode) => set({ executionMode }, false, 'setExecutionMode'),

        validateStrategyPropertySpec: (input) => {
          const parsed = strategyPropertySchema.safeParse(input)
          set(
            {
              propertyValidation: parsed.success
                ? { valid: true, issues: [] }
                : { valid: false, issues: toIssues(parsed.error) },
            },
            false,
            'validateStrategyPropertySpec'
          )
          return parsed.success
        },

        validateCanonicalSpec: (input) => {
          const parsed = canonicalStrategySchema.safeParse(input)
          set(
            {
              specValidation: parsed.success
                ? { valid: true, issues: [] }
                : { valid: false, issues: toIssues(parsed.error) },
            },
            false,
            'validateCanonicalSpec'
          )
          return parsed.success
        },

        setCanonicalSpec: (spec) => {
          const parsed = canonicalStrategySchema.safeParse(spec)
          if (!parsed.success) {
            set(
              {
                specValidation: { valid: false, issues: toIssues(parsed.error) },
                deployStatus: 'draft',
                deployBlockers: ['Canonical spec validation failed'],
              },
              false,
              'setCanonicalSpecFailed'
            )
            return
          }

          set(
            {
              canonicalSpec: parsed.data,
              specValidation: { valid: true, issues: [] },
              strategyId: parsed.data.meta.strategyId || get().strategyId,
              symbol: parsed.data.asset.symbol,
              timeframe: parsed.data.asset.timeframe,
              session: parsed.data.session?.sessionName ?? get().session,
              pineCode: get().pineCode,
              pythonCode: get().pythonCode,
              deployStatus: 'spec_ready',
              deployBlockers: [],
            },
            false,
            'setCanonicalSpec'
          )
        },

        updateCanonicalSpec: (patch) => {
          const current = get().canonicalSpec
          if (!current) return
          const next = { ...current, ...patch } as CanonicalStrategySpec
          get().setCanonicalSpec(next)
        },

        setStrategyPropertyDraft: (draft) => {
          if (!draft) {
            set(
              {
                strategyPropertyDraft: null,
                propertyValidation: emptyValidation(),
              },
              false,
              'setStrategyPropertyDraft'
            )
            return
          }

          const parsed = strategyPropertySchema.safeParse(draft)
          set(
            {
              strategyPropertyDraft: parsed.success ? parsed.data : draft,
              propertyValidation: parsed.success
                ? { valid: true, issues: [] }
                : { valid: false, issues: toIssues(parsed.error) },
            },
            false,
            'setStrategyPropertyDraft'
          )
        },

        updateStrategyPropertyDraft: (patch) => {
          const current = get().strategyPropertyDraft
          if (!current) return
          const next = { ...current, ...patch } as StrategyPropertySpec
          get().setStrategyPropertyDraft(next)
        },

        commitSpecFromDraft: () => {
          const draft = get().strategyPropertyDraft
          const parsed = strategyPropertySchema.safeParse(draft)
          if (!parsed.success) {
            set(
              {
                propertyValidation: { valid: false, issues: toIssues(parsed.error) },
                deployStatus: 'draft',
                deployBlockers: ['Strategy property validation failed'],
              },
              false,
              'commitSpecFromDraftFailed'
            )
            return false
          }

          const current = get().canonicalSpec
          if (!current) {
            set(
              {
                deployStatus: 'draft',
                deployBlockers: ['Canonical spec missing'],
              },
              false,
              'commitSpecFromDraftNoSpec'
            )
            return false
          }

          const next: CanonicalStrategySpec = {
            ...current,
            properties: parsed.data,
            meta: {
              ...current.meta,
              updatedAt: new Date().toISOString(),
            },
          }

          const nextParsed = canonicalStrategySchema.safeParse(next)
          if (!nextParsed.success) {
            set(
              {
                specValidation: { valid: false, issues: toIssues(nextParsed.error) },
                deployStatus: 'draft',
                deployBlockers: ['Merged canonical spec failed validation'],
              },
              false,
              'commitSpecFromDraftMergedFailed'
            )
            return false
          }

          set(
            {
              canonicalSpec: nextParsed.data,
              specValidation: { valid: true, issues: [] },
              propertyValidation: { valid: true, issues: [] },
              deployStatus: 'spec_ready',
              deployBlockers: [],
            },
            false,
            'commitSpecFromDraft'
          )
          get().regeneratePythonPayload()
          return true
        },

        regeneratePythonPayload: () => {
          const spec = get().canonicalSpec
          if (!spec) {
            set({ pythonPayload: null }, false, 'regeneratePythonPayloadEmpty')
            return
          }

          const payload = buildPythonBacktestPayload(spec)
          set({ pythonPayload: payload }, false, 'regeneratePythonPayload')
        },

        setPineCode: (pineCode) => set({ pineCode }, false, 'setPineCode'),
        setPythonCode: (pythonCode) => set({ pythonCode }, false, 'setPythonCode'),

        setLintResult: (lintResult) =>
          set(
            {
              lintResult,
              deployStatus: lintResult.passed ? 'lint_passed' : 'deploy_blocked',
              deployBlockers: lintResult.passed ? [] : lintResult.violations,
            },
            false,
            'setLintResult'
          ),

        setParityResult: (parityResult) =>
          set(
            {
              parityResult,
              deployStatus: parityResult.passed ? 'parity_checked' : 'deploy_blocked',
              deployBlockers: parityResult.passed ? [] : ['Parity mismatch detected'],
            },
            false,
            'setParityResult'
          ),

        setBacktestResult: (backtestResult) => set({ backtestResult }, false, 'setBacktestResult'),
        setRiskResult: (riskResult) =>
          set(
            {
              riskResult,
              deployStatus:
                riskResult.score >= 80 ? 'risk_scored' : 'deploy_blocked',
              deployBlockers:
                riskResult.score >= 80 ? [] : ['Risk score below threshold'],
            },
            false,
            'setRiskResult'
          ),

        setDeployStatus: (deployStatus) => set({ deployStatus }, false, 'setDeployStatus'),
        setDeployBlockers: (deployBlockers) => set({ deployBlockers }, false, 'setDeployBlockers'),

        addAgentMessage: (msg) =>
          set(
            (state) => ({
              agentMessages: [
                ...state.agentMessages,
                { id: uid(), timestamp: new Date().toISOString(), ...msg },
              ],
            }),
            false,
            'addAgentMessage'
          ),

        clearAgentMessages: () => set({ agentMessages: [] }, false, 'clearAgentMessages'),

        addVersion: ({ name, notes }) =>
          set(
            (state) => ({
              versionHistory: [
                ...state.versionHistory,
                { id: uid(), name, notes, createdAt: new Date().toISOString() },
              ],
            }),
            false,
            'addVersion'
          ),

        addPineVault: ({ name, code, lintPassed, violations, warnings, source }) =>
          set(
            (state) => ({
              pineVault: [
                ...state.pineVault,
                { id: uid(), name, code, lintPassed, violations, warnings, source, createdAt: new Date().toISOString() },
              ],
            }),
            false,
            'addPineVault'
          ),

        resetRun: () =>
          set(
            {
              ...initialState,
              strategyId: get().strategyId,
            },
            false,
            'resetRun'
          ),

        openChartOverlay: (opts) =>
          set(
            { chartOverlay: { source: 'bars', timeframe: 15, ...(get().chartOverlay ?? {}), ...opts } },
            false,
            'openChartOverlay'
          ),
        closeChartOverlay: () => set({ chartOverlay: null }, false, 'closeChartOverlay'),
        setChartSource: (source) =>
          set(
            (s) => ({ chartOverlay: s.chartOverlay ? { ...s.chartOverlay, source } : s.chartOverlay }),
            false,
            'setChartSource'
          ),
        setChartTimeframe: (timeframe) =>
          set(
            (s) => ({ chartOverlay: s.chartOverlay ? { ...s.chartOverlay, timeframe } : s.chartOverlay }),
            false,
            'setChartTimeframe'
          ),
      })),
      {
        name: 'Vega-strategy-store',
        partialize: (state) => ({
          activeTab: state.activeTab,
          strategyId: state.strategyId,
          symbol: state.symbol,
          timeframe: state.timeframe,
          session: state.session,
          riskProfile: state.riskProfile,
          executionMode: state.executionMode,
          versionHistory: state.versionHistory,
          canonicalSpec: state.canonicalSpec,
          strategyPropertyDraft: state.strategyPropertyDraft,
        }),
      }
    ),
    { name: 'VEGA Store', enabled: import.meta.env.DEV && hasReduxDevtoolsExtension() }
  )
)
