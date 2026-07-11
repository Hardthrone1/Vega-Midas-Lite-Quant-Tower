// src/shared/adapters/runtimeArtifactAdapter.ts
//
// Loads the runtime artifacts produced by gen_runtime_artifacts.py at the repo
// root (synced into public/data by scripts/sync-parity-data.mjs) and types them
// for the Codegen and Hermes panels. Pure adaptation after fetch — the panels
// display exactly what the real hermes/ and codegen/ modules emitted.

// ── Codegen ────────────────────────────────────────────────────────────
export type LintArtifact = {
  passed: boolean
  violations: string[]
  warnings: string[]
  trapCheck: { status: string; message: string }
}

export type CodegenVariant = {
  preset: string
  spec: Record<string, unknown>
  spec_hash: string
  pine_code: string
  pine_chars: number
  payload: Record<string, unknown>
  sim_config: Record<string, unknown>
  lint: LintArtifact
}

export type CodegenArtifact = {
  generatedBy: string
  note: string
  variants: CodegenVariant[]
}

// ── Hermes ─────────────────────────────────────────────────────────────
export type HermesSkill = {
  skill_id: string
  name: string
  phase: number
  runtime_skill: boolean
  tags: string[]
}

export type CuratorPolicy = {
  failure_types: string[]
  decisions: string[]
  transient_patterns: string[]
  parameter_patterns: string[]
  backoff: { base_seconds: number; schedule: number[]; note: string }
}

export type GepaIndividual = {
  params: Record<string, number>
  fitness: number
  generation: number
  run_count: number
}

export type GepaState = {
  generation: number
  best_fitness: number
  total_runs: number
  size: number
  default_params: Record<string, number>
  bounds: Record<string, { min: number; max: number; type: string }>
  individuals: GepaIndividual[]
  fitness_weights: Record<string, number>
  note: string
}

export type HermesArtifact = {
  generatedBy: string
  spine: string
  skills: HermesSkill[]
  curator: CuratorPolicy
  gepa: GepaState
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export const loadCodegenArtifact = () =>
  fetchJson<CodegenArtifact>('/data/codegen_output.json')

export const loadHermesArtifact = () =>
  fetchJson<HermesArtifact>('/data/hermes_state.json')
