# MIDAS / Hermes — Project Custom Instructions

## WHAT THIS PROJECT IS

This is the home for **MIDAS**: a machine-intelligence-driven algorithmic trading system for **MGC** (Micro Gold) and **MNQ** (Micro Nasdaq) futures, with a **Hermes** agent runtime powering the skill loop.

I am a solo developer/trader with deep manual bar-replay experience and original physics-inspired indicators. My core problem is scatter: ideas live in my head, don't hold still between sessions, and I re-research things I already decided. Your job is to help me hold decisions still and build, not to add to the pile.

---

## READ FIRST, EVERY CHAT

The knowledge files in this project are the source of truth — especially:
- **HERMES_SKILL_CATALOG.md** — v0.17 locked architecture + skill registry
- **GRAPH_REPORT.md** — codebase topology (1965 nodes, 146 communities)
- **graphify-out/obsidian/** — navigable Obsidian vault for deep dives

Before proposing architecture, check these docs. Do not re-derive or re-litigate what is already locked there.

---

## LOCKED DECISIONS (do not re-open without explicit request)

- **Orchestration spine** = custom Hermes loop (`agent_loop` + Curator + GEPA). ❌ NOT LangGraph
- **Claude Code** = runtime skill (print mode, sandboxed), not dev-only tool
- **Pine Script + Python** = both generated from one canonical spec (cannot drift)
- **max_tokens** = 8192 hard cap per turn (uncapped loops burn credits)
- **Breakout entries** = brk#1 strongest; brk#3 is dead zone (gated out)
- **66.5% retrace** = real structural filter in market-structure logic
- **Model tier system**:
  - Tier 1: NVIDIA NIM free endpoints (first choice)
  - Tier 2: Gemini, Groq, Deepseek
  - Tier 3: OpenRouter (fallback)
  - Free-tier models 429 heavily; paid/fallback chains expected

---

## HOW TO WORK WITH ME

- **Surgical, minimal changes.** Do not redesign working things. Never touch a working component without evidence it's broken.
- **Honest about real vs. aspirational.** Always distinguish what actually runs today from what is only designed. Never blur "architecture locked" into "built."
- **No gaslighting.** If you don't know or can't verify something, say so plainly rather than guessing.
- **Don't bury me in choices.** Prefer doing the useful thing and showing the result over asking me to pick at every step.
- **When something is decided, capture it** so it doesn't have to be rediscovered.

---

## ENVIRONMENT CONSTRAINTS

- **Windows machine**, username `Softthrone`. PowerShell-compatible commands only (no Unix flags/paths)
- **Dashboard project path**: `C:\Users\Softthrone\Claude\TradingView-Suite\`
- **Hermes project path**: `Desktop/my-engineering-project`
- **File output** targets dashboard path or provided as pasteable code
- You cannot reach my machine, Obsidian vault, or project files directly. You build files; I place them.

---

## CONTEXT-HYGIENE RULES (prevent token burn between sessions)

**Problem**: Earlier sessions burned tokens 3× faster than expected due to:
- MCP server reconnects re-injecting full instruction blocks (~6 times per session)
- Large JSON payloads pulled inline instead of summarized
- Three major phases (parity validation + control tower + skill build) stacked in one session

**Fixes for future sessions**:

1. **Disable unused MCP servers** at session start if not needed for the current task.
   - Leave `graphify-graph` off unless querying architecture
   - Disable `vega-gateway` / `vega-orchestrator` / `tradingview-mcp` / `parity-engine` if working on UI/skills only
   - Restart with only what the phase requires

2. **Split multi-phase work across sessions**.
   - Parity validation → commit + summarize (one session)
   - Control Tower integration → commit + summarize (one session)
   - Skill build → commit + summarize (one session)
   - Never stack 3+ independent phases in one sprint

3. **Use subagents (Explore, Plan, Agent) for bulk research**.
   - Large codebase searches → Explore agent (handles pagination, doesn't inline)
   - Multi-step architecture design → Plan agent (returns structured summary)
   - Open-ended investigations → general-purpose agent (pages results)
   - Main conversation stays lean (only direct results + decisions, no intermediate steps)

4. **Summarize JSON artifacts** instead of pasting inline.
   - "payload: 3,821 bytes, 157 trades, 1 divergent" ✅
   - "payload: {...full JSON...}" ❌
   - Attach file to SendUserFile if the user needs to see it

5. **Commit early and often**.
   - Each phase complete → git commit + note in LAST THING DONE + `git push`
   - Each session restarts with a fresh summary context (compaction is cheap; re-research is not)

---

## WHAT RUNS TODAY (the real baseline)

### ✅ Running Services

| Service | Port | Status | Purpose |
|---------|------|--------|---------|
| **Vega Gateway Server** | :8001 | ✅ Working | Multi-provider API gateway (NVIDIA NIM, Gemini, OpenRouter) |
| **MRE Server** | :8002 | ✅ Working | WebSocket bar replay engine |
| **TradingView MCP** | (stdio) | ✅ Configured | Desktop bridge via Chrome DevTools Protocol |
| **Parity Engine** | (stdio) | ✅ Ready | Python backtest validator |

### ✅ Dashboard & UI

| Component | Status | Notes |
|-----------|--------|-------|
| **index_ws.html + Vega-theme.css** | 🔧 Broken post-update | Golden backup exists; needs internal refactor |
| **Vite/React Control Tower** | ✅ Built | Backtest + Diagnostics blades wired to real parity artifacts (`public/data` sync); intake/replay/lint/risk still demo |
| **Lightweight Charts** | ✅ Integrated | 4.2.0; price/volume rendering |

### ⚙️ Designed But Not Yet Built

- (All major components now built — remaining work is integration testing + production hardening)

### ✅ Built This Session

- **Claude Code Print Mode skill** (`skills/claude-code-print/`, id `AGT-CCP-001`) —
  real `claude -p ... --output-format json` driver + `SKILL.md` in the hermes
  schema. Bounded (max-turns/timeout), strict `ok` contract, native token
  accounting, opt-in `--log-csv`. Sandbox (PLT-005) and registry (AGT-011) are
  stable-signature seams, not built. Verified against a stub CLI (success,
  failure, error-envelope, CSV, argv) — not yet run against the real CLI on the
  Windows box.

- **Headroom MCP server** (v0.31.0, `headroom-ai[mcp]`) —
  installed and auto-registered with Claude Code. Provides `headroom_compress`,
  `headroom_retrieve`, `headroom_stats` tools. Configured in `.vscode/settings.json`.
  Proxy mode (`headroom proxy`) can intercept ALL API traffic via
  `ANTHROPIC_BASE_URL=http://127.0.0.1:8787` for automatic compression (60-95% reduction
  on JSON, reversible CCR with local cache).

### 📊 Graph & Architecture

- **Codebase map**: 1965 nodes, 146 communities
- **Graph visualization**: `graphify-out/graph.html` (open in browser)
- **Graph as MCP**: `graphify_mcp_server.py` (queryable from Claude Code)
- **Obsidian vault**: `graphify-out/obsidian/` (2112 notes, bidirectional links)

---

## LAST THING DONE

✅ **Dashboard caught up to the backend** — added two new blades to the Control Tower so the codegen + Hermes runtime work is no longer invisible in the UI:
- **03 · Codegen** (`midas_code/src/features/codegen/`) — one `StrategySpec` → Pine v5 + Python payload, both carrying the same `spec_hash` (parity proof, cannot drift). Instrument toggle (MGC/MNQ), Pine|payload viewer, anti-cheat lint tiles + trap-check. Deterministic counterpart to the LLM-driven Swarm blade.
- **09 · Hermes** (`midas_code/src/features/hermes/`) — runtime introspection: skill registry (8 skills), Curator failure policy (TRANSIENT/PARAMETER/HARD + backoff), GEPA search space + seed population table.
- Both are **artifact-backed** (real data, not demo): `gen_runtime_artifacts.py` emits `codegen_output.json` + `hermes_state.json` from the actual `codegen/`+`hermes/` modules; `scripts/sync-parity-data.mjs` syncs them into `public/data`. Verified end-to-end (build + Playwright drive, zero console errors).
- Blades renumbered 01–09; `Tab` type + nav auto-render from `blades.tsx`.

**Prior:** Pine/Python codegen built — `codegen/` package + `skills/midas-codegen/` (AGT-CDG-001). One `StrategySpec` → Pine v5 code + BacktestPayload JSON + sim CONFIG. Anti-cheat lint (Python port of swarm_orchestrator.js `validatePineScriptRules`). MGC + MNQ presets. Both outputs pass lint. 8 skills now auto-discovered by Hermes registry.

---

## HERMES SKILL FORMAT (verified from real in-repo skills)

A hermes skill is a **directory** containing a `SKILL.md`:
- YAML frontmatter: `name`, `description` (include a `Trigger:` line), `version`,
  `author`, `license`, `dependencies`, `platforms`, `metadata.hermes.tags`.
- Markdown body tells the agent *when* and *how* to use it.
- If it runs code, the body instructs the agent to shell out to an adjacent
  script (pattern taken from the in-repo `caveman-compress` skill:
  "from the directory containing this SKILL.md, run `python -m ...`").
- Discovery is via hermes's `build_skills_system_prompt` (in the installed
  package, not in this repo — mechanism inferred from schema + `caveman-*`).

Corrected Claude Code print-mode invocation (the earlier plan's `--workdir` and
`--effort` flags do NOT exist):
`claude -p "<prompt>" --output-format json --max-turns 8 --allowedTools "Read,Write" --permission-mode acceptEdits`

## WHAT'S NEXT (in order)

### 1️⃣ ~~Create Claude Code Print Mode Skill~~ ✅ DONE (`skills/claude-code-print/`)

### 2️⃣ ~~Insert Headroom Proxy~~ ✅ DONE (headroom-ai[mcp] v0.31.0)
- Official Headroom (https://github.com/headroomlabs-ai/headroom): 60-95% JSON compression, output steering, reversibility
- MCP server auto-registered to Claude Code (`headroom_compress`, `headroom_retrieve`, `headroom_stats`)
- Proxy mode available: `headroom proxy` + `ANTHROPIC_BASE_URL=http://127.0.0.1:8787`
- Startup script: `./start-midas-with-headroom.sh` (all services + proxy + compression)
- Metrics: `headroom memory stats` shows raw vs. compressed tokens

### 3️⃣ ~~Create MIDAS Bundle~~ ✅ DONE (`skills/midas-*`)
- 6 skills built: Structure (AGT-STR-001), Quant (AGT-QNT-001), Claude Code (AGT-CCP-001), Synthesis (AGT-SYN-001), Router (AGT-RTR-001), Log (AGT-LOG-001)
- Orchestrator: `skills/midas-trading-loop/midas_trading_loop.py` (AGT-LOOP-001)
- Wired to `/midas-trading-loop` command via Hermes skill discovery
- Output: Obsidian vault notes + MEMORY.md cross-session decision log
- Verified end-to-end on mgc_5m_et.csv (structure/quant/synthesis/log all pass)

### 4️⃣ **What Happens After These Steps**

```
User Command: hermes "/midas-trading-loop test with MGC 5m bar data"
                        ↓
           Hermes agent parses directive
                        ↓
           Loads 6 skills in parallel:
           • Structure (break/retrace analysis)
           • Quant (backtest payload builder)
           • Claude Code (Pine Script generation)
           • Synthesis (decision aggregation)
           • Router (model tier selection)
           • Log (Obsidian + MEMORY.md)
                        ↓
           Claude Code skill invokes:
           claude -p "Write Pine Script..." --workdir ... --max-turns 8
                        ↓
           OpenShell Sandbox (filesystem/network/process isolation)
                        ↓
           Headroom proxy compresses verbose outputs (87% reduction)
                        ↓
           Curator watches for failures, auto-fixes
                        ↓
           GEPA evolves winning skills
                        ↓
           Result logged to Obsidian + MEMORY.md
```

---

## TOKEN FLOW (With Verification)

```
Market Data (raw MGC 5m bars)
    ↓
Graphify (compress 71.5×)
    ↓
Claude Code read_file (3KB codebase tree)
    ↓
Claude Sonnet (generate Pine Script)
    ↓
Headroom (compress 87%)
    ↓
Hermes Agent (route + log)

Expected: 10,144 raw tokens → 1,260 compressed → logged to ~/logs
```

---

## HEADROOM PROXY SETUP (for automatic compression)

Two modes:

**Mode 1: MCP Server (on-demand compression in Claude Code)**
```bash
# Already configured in .vscode/settings.json
# Claude Code will auto-discover headroom_compress, headroom_retrieve, headroom_stats tools
# Use /headroom-compress "<text>" in Claude Code when you need compression
```

**Mode 2: Proxy (automatic interception of ALL Claude API calls)**
```bash
# Terminal 1: Start the Headroom proxy
headroom proxy
# Listens on http://127.0.0.1:8787

# Terminal 2: Start services + Claude with proxy interception
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
node Vega_Gateway_Server.js &
python MRE_Server.py &
# Now all Claude API calls route through Headroom for automatic compression
```

**Metrics:**
- `headroom memory stats` — show compression cache + raw vs. compressed token counts
- Logs stored in `~/.headroom/cache/` (reversible; can retrieve originals on demand)

---

## HOW TO INVOKE HERMES

```bash
hermes "/midas-trading-loop test with MGC 5m bar data"
```

Expected output:
- Pine Script generated
- Python backtest payload built
- Parity check run
- Results logged to Obsidian vault
- Token usage reported (now compressed via Headroom proxy if ANTHROPIC_BASE_URL set)

---

## FILES & LOCATIONS

| File | Purpose | Status |
|------|---------|--------|
| `Vega_Gateway_Server.js` | Multi-provider gateway | ✅ Running |
| `archive/Vega_Orchestrator.legacy.js` | Agent orchestration (class lib) | 🗄️ Archived — not wired into the current suite |
| `MRE_Server.py` | Bar replay engine | ✅ Running |
| `midas_code/` | React dashboard | ✅ Built (demo mode) |
| `parity_engine/` | Python validator | ✅ Ready |
| `graphify_mcp_server.py` | Graph as MCP | ✅ New |
| `graphify-out/obsidian/` | Knowledge vault | ✅ 2112 notes |
| `.vscode/settings.json` | MCP servers + caveman-shrink | ✅ Configured |
| `.vscode/launch.json` | Debug configs (Node + debugpy) | ✅ Complete |

---

## MCP SERVERS AVAILABLE IN CLAUDE CODE

All wrapped with **caveman-shrink** (token compression):

- **tradingview-mcp** — TradingView Desktop bridge
- **vega-gateway** — Multi-provider gateway proxy
- **vega-orchestrator** — Agent orchestration
- **parity-engine** — Backtest validation
- **graphify-graph** — Query codebase architecture

---

## VERIFICATION CHECKLIST

Before claiming something works:
- [ ] Service is actually running (not just designed)
- [ ] Token count is measured, not estimated
- [ ] Error logs are clean (no silent failures)
- [ ] Obsidian vault has entries (proof of persistence)
- [ ] Backup exists before trying fixes

---

## LAST KNOWN STATE

- ✅ 4 services running + graph built + vault generated
- ✅ MCP servers configured + caveman-shrink active
- ✅ debugpy + launch configs ready
- ✅ Print mode skill built (`skills/claude-code-print/`, PR #10 merged)
- ✅ Control Tower wired to real parity artifacts (156 trades, live equity curve, deploy gate)
- ✅ Headroom MCP server installed + registered (headroom-ai[mcp] v0.31.0, 60-95% compression, reversible CCR)
- ✅ Headroom proxy ready (`./start-midas-with-headroom.sh` or `headroom proxy` + `ANTHROPIC_BASE_URL=http://127.0.0.1:8787`)
- 🔧 index_ws.html broken (needs refactor)
- ✅ MIDAS Bundle built (6 skills + orchestrator, verified end-to-end)
- ✅ Hermes runtime built (`hermes/` package: agent_loop + Curator + GEPA + skill_registry)
- ✅ Pine/Python codegen built (`codegen/` + `skills/midas-codegen/`, AGT-CDG-001)
- ✅ Dashboard blades added: **03 Codegen** + **09 Hermes** (artifact-backed, verified end-to-end)
- 🔲 `hermes-skills` branch deletion pending (blocked by git proxy; manual cleanup needed)

**Next session**: Test Headroom compression on Windows via `headroom memory stats`. Run GEPA evolution across multiple bar datasets (the Hermes blade population table will then show non-zero fitness). Paste generated Pine (from the Codegen blade "Use this build") into TradingView for visual parity validation.

