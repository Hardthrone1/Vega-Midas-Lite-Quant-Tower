# archive/ — not part of the active build

Everything in this folder is **kept for reference only**. It is **not** wired
into the running VEGA suite — not the React frontend (`midas_code/`), not
`Vega_Gateway_Server.js`, not the launcher.

**Do not** import, require, or add these files to `launch_vega_suite.ps1` or any
build without deliberately reviving them first. If a file here becomes real
again, move it out of `archive/` in the same change so its status is never
ambiguous.

## Contents

| File | What it is | Why it's here |
| ---- | ---------- | ------------- |
| `Vega_Orchestrator.legacy.js` | Standalone multi-agent swarm orchestrator class (agent routing, swarm→synthesis→audit pipeline, Pine Script validation, Obsidian vault bridge, cost tracking). | Belongs to the older vanilla-JS HUD (`window.Vega`). Nothing in the current stack uses it, and it has no Node entry point, so running it as a service is a no-op. Preserved because the swarm/routing logic may be reused later. |
