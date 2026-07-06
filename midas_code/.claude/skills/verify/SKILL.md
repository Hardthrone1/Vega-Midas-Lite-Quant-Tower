---
name: verify
description: Build, launch, and drive the Vega dashboard (midas_code) to verify UI changes at the running surface.
---

# Verifying the Vega dashboard

All commands run from `midas_code/`.

## Build & launch

```bash
ELECTRON_SKIP_BINARY_DOWNLOAD=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
npm run build                      # tsc -b && vite build
npx vite preview --port 5173 --host 127.0.0.1 &   # serves dist/
```

Gotcha: plain `npm install` fails in sandboxed environments because
`react-devtools` → `electron` tries to download a binary; the env vars above
skip it.

## Mock the gateway

The intake flow POSTs to `${VITE_GATEWAY_URL:-http://localhost:8001}/api/v1/chat/completions`
(the user's local Vega Gateway). To drive the full intake → spec flow, run a
mock on 8001 that answers OPTIONS (CORS: allow origin/headers) and returns
`{ choices: [{ message: { tool_calls: [{ function: { name: 'submit_strategy_spec',
arguments: '<json spec string>' } }] } }] }` where the spec has `symbol`,
`timeframe`, `session.sessionName`, and `entry.conditions` in
`{ type, parameters, description }` format.

## Drive (Playwright, chromium at /opt/pw-browsers/chromium)

Flows worth driving:
- Load `http://127.0.0.1:5173` → portal shell renders (`.blade` selector).
- Submit the intake form → Spec blade stacks beside Intake; breadcrumb reads
  `Home > Intake > Spec`; agent timeline logs "Spec generated via Gateway".
- Blade chrome: maximize/restore, close child blade, nav rail collapse,
  theme toggle, agent-activity drawer toggle, reload (activeTab persists).

Gotchas:
- `getByRole(name:)` is substring matching — use `exact: true` for the blade
  "Close" button or you'll hit "Close agent activity pane" instead.
- Clear `localStorage` first for deterministic runs (store persists activeTab,
  symbol, theme).
- Fluent popup portals mount body-level nodes carrying the provider className —
  never give `.portal-fluent-root` a background/size outside `#root >` scope.
