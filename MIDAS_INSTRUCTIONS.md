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
| **Vite/React Control Tower** | ✅ Built | Runs on demo data; not yet wired to live backend |
| **Lightweight Charts** | ✅ Integrated | 4.2.0; price/volume rendering |

### ⚙️ Designed But Not Yet Built

- Hermes agent runtime (agent_loop + Curator + GEPA)
- Claude Code Print Mode skill
- Headroom proxy (compression layer)
- MIDAS Bundle (skill packaging)
- Pine/Python code generation (store fields exist, logic not implemented)

### 📊 Graph & Architecture

- **Codebase map**: 1965 nodes, 146 communities
- **Graph visualization**: `graphify-out/graph.html` (open in browser)
- **Graph as MCP**: `graphify_mcp_server.py` (queryable from Claude Code)
- **Obsidian vault**: `graphify-out/obsidian/` (2112 notes, bidirectional links)

---

## LAST THING DONE

✅ **Connected Hermes Agent to NVIDIA NIM** — Gateway routing to free endpoints, fallback chains configured

---

## WHAT'S NEXT (in order)

### 1️⃣ **Create Claude Code Print Mode Skill**
- Print mode = sandboxed stdout capture (no tool calls)
- Use for inline code generation without spawning subagents
- Integrate with Hermes skill registry

### 2️⃣ **Insert Headroom Proxy**
- Compress verbose agent outputs (target: 87% reduction)
- Sit between agent output and logging layer
- Metrics: raw tokens → compressed tokens

### 3️⃣ **Create MIDAS Bundle**
- Package 6 skills: Structure, Quant, Claude Code, Synthesis, Router, Log
- Wire to `/midas-trading-loop` command
- Output: Obsidian + MEMORY.md logging

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

## HOW TO INVOKE HERMES

```bash
hermes "/midas-trading-loop test with MGC 5m bar data"
```

Expected output:
- Pine Script generated
- Python backtest payload built
- Parity check run
- Results logged to Obsidian vault
- Token usage reported

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
- 🔧 index_ws.html broken (needs refactor)
- 🔲 Print mode skill not yet created
- 🔲 Headroom proxy not yet inserted
- 🔲 MIDAS Bundle not yet packaged

**Next session**: Start with Claude Code Print Mode skill.

