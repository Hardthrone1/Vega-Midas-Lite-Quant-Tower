// src/app/layout/blades.tsx
// Stage registry: the ordered pipeline, mapping each workflow step to a lazily
// loaded feature panel. This is the single source of truth for stage id, order,
// step number and label — the nav spine, stage headlines and the status
// derivation all read from it so they cannot drift.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { FluentIcon } from '@fluentui/react-icons'
import {
  Bot20Regular,
  BrainCircuit20Regular,
  Code20Regular,
  DataTrending20Regular,
  DocumentBulletList20Regular,
  History20Regular,
  MailInbox20Regular,
  Stethoscope20Regular,
  Vault20Regular,
} from '@fluentui/react-icons'
import type { Tab } from '../../store/useStrategyStore'

export type BladeDefinition = {
  id: Tab
  step: string
  label: string
  description: string
  icon: FluentIcon
  Component: LazyExoticComponent<ComponentType>
}

export const BLADES: BladeDefinition[] = [
  {
    id: 'intake',
    step: '01',
    label: 'Intake',
    description: 'Draft the canonical strategy spec',
    icon: MailInbox20Regular,
    Component: lazy(() =>
      import('../../features/strategy-intake/components/StrategyIntakePanel').then((m) => ({
        default: m.StrategyIntakePanel,
      }))
    ),
  },
  {
    id: 'spec',
    step: '02',
    label: 'Spec',
    description: 'Canonical spec — the single source of truth',
    icon: DocumentBulletList20Regular,
    Component: lazy(() =>
      import('../../features/canonical-spec/components/CanonicalSpecPanel').then((m) => ({
        default: m.CanonicalSpecPanel,
      }))
    ),
  },
  {
    id: 'codegen',
    step: '03',
    label: 'Codegen',
    description: 'One spec → Pine v5 + Python payload (cannot drift)',
    icon: Code20Regular,
    Component: lazy(() =>
      import('../../features/codegen/components/CodegenPanel').then((m) => ({
        default: m.CodegenPanel,
      }))
    ),
  },
  {
    id: 'replay',
    step: '04',
    label: 'Replay',
    description: 'Bar-by-bar replay with diagnostics overlay',
    icon: History20Regular,
    Component: lazy(() =>
      import('../../features/replay/components/ReplayPanel').then((m) => ({
        default: m.ReplayPanel,
      }))
    ),
  },
  {
    id: 'swarm',
    step: '05',
    label: 'Swarm',
    description: 'Agent swarm orchestration',
    icon: Bot20Regular,
    Component: lazy(() =>
      import('../../features/swarm/components/SwarmPanel').then((m) => ({
        default: m.SwarmPanel,
      }))
    ),
  },
  {
    id: 'diagnostics',
    step: '06',
    label: 'Diagnostics',
    description: 'Deploy gate, signal integrity, parity, risk',
    icon: Stethoscope20Regular,
    Component: lazy(() =>
      import('../../features/diagnostics/components/DiagnosticsPanel').then((m) => ({
        default: m.DiagnosticsPanel,
      }))
    ),
  },
  {
    id: 'backtest',
    step: '07',
    label: 'Backtest',
    description: 'Equity curve + edge metrics',
    icon: DataTrending20Regular,
    Component: lazy(() =>
      import('../../features/backtest/components/BacktestPanel').then((m) => ({
        default: m.BacktestPanel,
      }))
    ),
  },
  {
    id: 'vault',
    step: '08',
    label: 'Vault',
    description: 'Versioned strategy registry',
    icon: Vault20Regular,
    Component: lazy(() =>
      import('../../features/vault/components/VaultPanel').then((m) => ({
        default: m.VaultPanel,
      }))
    ),
  },
  {
    id: 'hermes',
    step: '09',
    label: 'Hermes',
    description: 'Runtime: skills, Curator policy, GEPA population',
    icon: BrainCircuit20Regular,
    Component: lazy(() =>
      import('../../features/hermes/components/HermesPanel').then((m) => ({
        default: m.HermesPanel,
      }))
    ),
  },
]

export function bladeById(id: Tab): BladeDefinition | undefined {
  return BLADES.find((b) => b.id === id)
}
