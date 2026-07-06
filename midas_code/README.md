# Vega — Strategy Control Tower

A spec-first dashboard for taking a futures strategy from idea → canonical spec →
Pine + Python (generated from the *same* spec) → diagnostics → backtest → vault,
with a deploy gate that blocks anything where the two execution paths disagree.
Built for MGC / MNQ work.

This is the polished, **running** scaffold assembled from the original design
transcript. It compiles, typechecks, and builds clean.

## Run it

```bash
npm install
npm run dev        # start Vite dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
```

Then open the local URL Vite prints. Walk the flow:
**Draft canonical spec** (left rail) → **Diagnostics → Run checks** →
**Backtest → Run backtest** → **Vault → Save version**. The agent timeline on the
right streams activity as you go.

> Note: the "Run checks" / "Run backtest" actions currently produce representative
> demo results so the UI is exercisable end-to-end. They are the seams where the
> real agent pipeline (OpenRouter) and Python backtester plug in — see "Wiring up
> the real pipeline" below.

## Architecture

```
src/
  app/
    App.tsx
    layout/AppShell.tsx        three-column shell: intake · workspace · timeline
    layout/TopStatusBar.tsx    persistent context strip + deploy status
  features/
    strategy-intake/           symbol/timeframe/session/risk/mode → drafts spec
    canonical-spec/            spec summary + JSON view + validation issues
    diagnostics/               deploy gate, signal integrity, parity, risk score
    backtest/                  equity curve + edge metrics
    vault/                     versioned strategy registry
    agent-timeline/            live agent message feed
    replay/                    chart + scheduler + diagnostics overlay (event bus)
  shared/
    validation/strategySchema.ts          canonical spec (source of truth)
    validation/strategyPropertySchema.ts  TradingView strategy() properties (Zod)
    adapters/pythonBacktestAdapter.ts     spec → Python backtest payload (pure)
    deployStatus.ts                       deploy-state machine → UI status/labels
    ui/                                    shared primitives + CSS
    types/StrategyVersionRecord.ts        serializable, hashed version record
  store/useStrategyStore.ts               Zustand: the single state container
  styles/                                 theme tokens + app layout CSS
```

### The spine: one canonical spec

`canonicalStrategySchema` is the single source of truth. Pine and Python are both
generated from it, so they cannot silently drift — which is the whole point of the
project (the live-vs-backtest gap came from implicit differences between the two).
The store validates every spec/property change with Zod and advances a deploy-state
machine: `draft → spec_ready → pine_generated → lint_passed → parity_checked →
backtested → risk_scored → deploy_ready`, with `deploy_blocked` as the failure sink.

### The replay layer

`replay/lib/replayEvents.ts` is a tiny typed event bus. The scheduler publishes
boundary events (play/pause/seek/bar-open/bar-close/entry/exit/…); the chart and
diagnostics overlay subscribe. This keeps high-frequency replay off React state.
These files are complete and wired but **not yet mounted on a tab** — add a
"Replay" tab to `AppShell` and render `<ReplayChart />` + `<ReplayDiagnosticsOverlay />`
when you want them on screen. (They pull `lightweight-charts`, already a dependency.)

## Wiring up the real pipeline

The demo seams to replace with live calls:

| Where | Now | Replace with |
|---|---|---|
| `DiagnosticsPanel.runChecks` | synthetic lint/parity/risk | Lint + Parity + Risk agents via OpenRouter |
| `BacktestPanel.runBacktest` | synthetic equity curve | Python backtester fed `pythonPayload` |
| `StrategyIntakePanel.startSpec` | `createDefaultSpec()` | Intake + Spec agents → canonical spec |
| Pine/Python code | `pineCode`/`pythonCode` empty | Pine + Python agents (generate from spec) |

The store already exposes `setLintResult`, `setParityResult`, `setBacktestResult`,
`setRiskResult`, `setPineCode`, `setPythonCode`, `addAgentMessage` — so the agents
just call these and the UI + deploy gate react automatically.

## Design

Control-tower aesthetic: near-black field, monospace for all data, status color
carries meaning (the deploy-state machine drives the palette), one restrained accent
(MGC gold). Tokens in `src/styles/theme.css`. Responsive down to a single column;
keyboard focus visible; reduced-motion respected.
