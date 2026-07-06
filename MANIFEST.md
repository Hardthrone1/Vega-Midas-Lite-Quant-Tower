# Vega — Build Manifest

Status: **complete, running scaffold.** Typechecks clean (`tsc --noEmit`), builds
clean (`vite build`, 71 modules), verified rendering across the full workflow.

## What changed from the extracted code

The earlier extraction left the system non-runnable: the store imported three files
that were never written, and the whole UI layer was named but uncoded. This build
fills every gap.

### Glue written (was imported but missing)
- `src/features/replay/lib/replayEvents.ts` — typed event bus (emit/on + unsubscribe)
- `src/shared/validation/strategySchema.ts` — `canonicalStrategySchema`,
  `CanonicalStrategySpec`, `createDefaultSpec()` (matches every field the store reads)
- `src/shared/adapters/pythonBacktestAdapter.ts` — pure `buildPythonBacktestPayload`

### Fixes to extracted files
- `strategyPropertySchema.ts` — added `StrategyPropertySpec` / `BacktestRiskSpec` type exports
- `StrategyVersionRecord.ts` — added the missing `CanonicalStrategySpec` import

### UI layer built (was spec-only before)
- App shell + top status bar (persistent context strip + deploy status)
- Panels: Strategy Intake, Canonical Spec, Diagnostics (+ deploy gate),
  Backtest, Vault, Agent Timeline
- Shared UI primitives (`shared/ui`) + design-token CSS (`styles/theme.css`, `styles/app.css`)
- `shared/deployStatus.ts` — deploy-state machine → UI status/labels/progress
- Entry: `App.tsx`, `main.tsx`, `index.html`, `vite.config.ts`, `package.json`, `tsconfig.json`

## Files from the original transcript (verbatim, untouched logic)
- `src/store/useStrategyStore.ts` — final Zustand store
- `src/features/replay/hooks/useReplayScheduler.ts`
- `src/features/replay/components/ReplayChart.tsx`
- `src/features/replay/components/ReplayDiagnosticsOverlay.tsx`
- `src/shared/validation/strategyPropertySchema.ts` (+ type exports appended)
- `src/shared/types/StrategyVersionRecord.ts` (+ import line)

## Known seams (intentional, documented in README)
- `runChecks` / `runBacktest` / `startSpec` produce demo results — these are the
  plug-in points for the OpenRouter agent pipeline and the Python backtester.
- Replay files compile and are wired to the event bus but are not yet mounted on a
  tab in `AppShell`.
- Pine/Python code generation not yet implemented (store fields exist, ready to fill).
