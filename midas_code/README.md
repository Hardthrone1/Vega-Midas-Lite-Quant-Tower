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
    theme/ThemeProvider.tsx    FluentProvider root (webLight/webDark) + theme toggle
    layout/PortalShell.tsx     Azure Portal-style shell: header · nav rail · blades · context pane
    layout/PortalHeader.tsx    brand command bar: search, context, deploy status, utilities
    layout/PortalNav.tsx       collapsible left rail (Fluent vertical TabList)
    layout/BladeHost.tsx       breadcrumb + horizontal blade stack (maximize/close)
    layout/blades.tsx          blade registry + useBlades() context (openBlade/closeBlade)
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

## Design — Fluent UI shell (Azure Portal architecture)

The UI layer is built on **Fluent UI React v9** (`@fluentui/react-components`)
and replicates the Azure Portal / AI Foundry shell:

- **Shell + Blade layout** — a brand command bar on top (`PortalHeader`), a
  collapsible left nav rail (`PortalNav`), and a horizontal **blade stack**
  (`BladeHost`): each workflow step opens as a blade; child blades open to the
  right (Intake → drafts a spec → the Spec blade slides in beside it), with
  breadcrumb navigation, maximize/restore, and close — exactly like Azure
  resource blades. Any panel can push a blade via the `useBlades()` context.
- **Theming** — `ThemeProvider` wraps the app in a `FluentProvider` with the
  Microsoft web themes (dark by default, header toggle for light). The legacy
  control-tower CSS variables are remapped onto Fluent design tokens in
  `src/styles/portal.css`, so all panel styles follow the active theme and
  Segoe UI typography automatically.
- **Zod ⇄ Fluent forms** — the intake form uses **React Hook Form** with
  `zodResolver`: the Zod schema is the single validation contract, bound onto
  Fluent `Field`/`Dropdown`/`RadioGroup` controls; validation messages render
  through Fluent's `Field` validation slots. Backend validation is untouched.
- **Shared primitives** (`src/shared/ui`) keep their old API but render Fluent
  `Button`/`Badge`/`Label` underneath, so every panel picked up the Microsoft
  look without per-panel rewrites.

Keyboard focus visible; reduced-motion respected; responsive: blades stack
vertically under 860px and the context pane hides under 1100px.

## Micro-frontend scaling (optional)

`vite.config.ts` carries an opt-in **module federation** setup
(`@originjs/vite-plugin-federation`), mirroring how the Azure Portal loads
extensions at runtime. Off by default — the normal build is unchanged. Enable:

```bash
VITE_FEDERATION=1 npm run build       # emits dist/assets/remoteEntry.js
```

The shell exposes `./ReplayPanel`, `./SwarmPanel`, and `./BacktestPanel` as
federated modules, and can consume remote plugins itself:

```bash
VITE_FEDERATION=1 \
VITE_FEDERATION_REMOTES="playground@https://host/assets/remoteEntry.js" \
npm run build
```

`react`, `react-dom`, `zustand`, `zod`, and `@fluentui/react-components` are
shared singletons so remotes reuse the host's copies.
