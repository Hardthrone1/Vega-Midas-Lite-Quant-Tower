// Copies the parity-run artifacts from the repo root into public/data so the
// dashboard serves the real backtest + divergence report instead of demo data.
// Tolerant: missing sources are skipped (the panels fall back to their empty
// states), so dev/build never breaks on a fresh checkout without artifacts.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')
const outDir = join(here, '..', 'public', 'data')

const artifacts = [
  'backtest_payload.json',
  'divergence_report.json',
  'codegen_output.json',
  'hermes_state.json',
]

mkdirSync(outDir, { recursive: true })
for (const name of artifacts) {
  const src = join(repoRoot, name)
  if (existsSync(src)) {
    copyFileSync(src, join(outDir, name))
    console.log(`[sync-parity-data] ${name} -> public/data/`)
  } else {
    console.log(`[sync-parity-data] ${name} not found, skipped`)
  }
}
