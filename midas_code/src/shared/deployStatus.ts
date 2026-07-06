// src/shared/deployStatus.ts
//
// Single mapping from the store's deploy-state machine to UI status + label.
// Centralised so the top bar, deploy gate, and any future surface agree.

import type { Status } from './ui'

export type DeployStatus =
  | 'draft'
  | 'spec_ready'
  | 'pine_generated'
  | 'lint_passed'
  | 'parity_checked'
  | 'backtested'
  | 'risk_scored'
  | 'deploy_blocked'
  | 'deploy_ready'

// Ordered pipeline (excludes the terminal blocked/ready states).
export const DEPLOY_PIPELINE: DeployStatus[] = [
  'draft',
  'spec_ready',
  'pine_generated',
  'lint_passed',
  'parity_checked',
  'backtested',
  'risk_scored',
  'deploy_ready',
]

const LABELS: Record<DeployStatus, string> = {
  draft: 'Draft',
  spec_ready: 'Spec ready',
  pine_generated: 'Pine generated',
  lint_passed: 'Lint passed',
  parity_checked: 'Parity checked',
  backtested: 'Backtested',
  risk_scored: 'Risk scored',
  deploy_blocked: 'Deploy blocked',
  deploy_ready: 'Deploy ready',
}

const STATUS: Record<DeployStatus, Status> = {
  draft: 'idle',
  spec_ready: 'info',
  pine_generated: 'info',
  lint_passed: 'info',
  parity_checked: 'info',
  backtested: 'info',
  risk_scored: 'info',
  deploy_blocked: 'err',
  deploy_ready: 'ok',
}

export const deployLabel = (s: DeployStatus): string => LABELS[s]
export const deployStatusKind = (s: DeployStatus): Status => STATUS[s]

/** 0..1 progress along the pipeline; blocked maps to its last good step. */
export function deployProgress(s: DeployStatus): number {
  if (s === 'deploy_blocked') return 0
  const i = DEPLOY_PIPELINE.indexOf(s)
  return i < 0 ? 0 : i / (DEPLOY_PIPELINE.length - 1)
}
