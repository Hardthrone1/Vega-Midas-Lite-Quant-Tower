# MIDAS Project Mission & System Blueprint (v1.5 - Frozen Core)

## Primary Objective
MIDAS is a dedicated Pine Script troubleshooting, repair, optimization, and validation platform. Its sole operational purpose is to:
* TradingView Replay integration
* Analyze Pine Script indicators and strategies.
* Fix compiler bugs and deep execution logic errors.
* Maximize strategy robustness.
* Validate strategy behavior against realistic, raw market data.
* Produce production-ready, non-repainting Pine Script v5 code.
* Forward testing workflows
* Live trade comparison

**MIDAS is NOT a general AI framework, agent laboratory, workflow engine, or general feature showcase. The architecture is frozen.**

---

## Core Execution Architecture

To prevent API credit depletion and bypass strict cloud rate-limiting (429 errors) on free model tiers, the orchestrator is structurally locked into a **Sequential Pipeline with Local Offloading**.

```
[UI Trigger] ➔ [Session Memory / Obsidian Inject] ➔ [Sequential Swarm Run]
│
┌───────────────────────┬─────────────────────────┬───────┴────────────────┐
▼                       ▼                         ▼                        ▼
[Qwen]                  [Nemotron]               [Gemini]                 [Claude]
Cloud Free              Cloud Free               Cloud Free               Cloud Free
(Structure & Logic)     (Complex Math)           (Synthesis Blueprint)    (Production v5)
│                       │                         │                        │
└───────────────┬───────┴─────────────────────────┴────────────────────────┘
▼
[HUD Display] ➔ [Telemetry Trace (Graphify)] ➔ [Immutable Storage (Obsidian Vault)]
```

### 1. Sequential Execution Pattern
The orchestrator must never execute multi-agent calls in parallel using `Promise.all()`. It must process agents via sequential loops with a defensive cooling period to prevent token rate spikes.

```javascript
// Strict Sequential Loop Implementation Rule
const swarmResults = [];
for (const agent of selectedAgents) {
    try {
        const result = await this.callAgent(agent, analysisPrompt);
        swarmResults.push(result);
        // Cool-down bumper to protect free cloud API tiers
        await new Promise(resolve => setTimeout(resolve, 2500)); 
    } catch (error) {
        console.error(`[SWARM] ${agent.name} failed. Routing to active fallback...`, error);
    }
}
```

### 2. Local Hybrid Routing Rules
To eliminate financial bleed, the system redirects processing to the local machine when an agent is configured with a localized model designation (e.g., matching a local namespace configuration).

**Local Endpoint:** `http://localhost:11434/v1/chat/completions` (Ollama Engine)

**Local Model Priority:** `qwen2.5-coder:7b` (Assigned to heavy coding and structural analysis tasks)

**Cloud Endpoint:** `https://openrouter.ai/api/v1/chat/completions` (Reserved strictly for free tier diverse perspectives or specialized reasoning)

---

## Disciplined Swarm Roles & Lanes
Agents must stick strictly to their specific quantitative lanes. They do not expand scope.

### 1. Qwen (The Architect)
**Responsibility:** Structural architecture, code framework compilation, and execution logic.

**Focus Area:** Directs session filters (New York, London, Asian open boundaries), execution intervals, standard structural logic blocks, and order routing flows.

### 2. Nemotron (The Quant Core)
**Responsibility:** Advanced indicator math, algorithmic smoothing, and structural geometry.

**Focus Area:** Resolves complex calculations behind hybrid moving average layers (Hull, LSMA, ZLEMA), multi-timeframe (MTF) array matrix aggregations, and exact fractal/Fibonacci "Golden Zone" pullback coordinate calculations.

### 3. Gemini (The Synthesizer)
**Responsibility:** Multi-agent output reconciliation and technical blueprint composition.

**Focus Area:** Collects conflicting structural arguments from Qwen and mathematical variables from Nemotron, resolves anomalies, and compiles a definitive compilation blueprint.

### 4. Claude (The Coder)
**Responsibility:** Pure Pine Script v5 code compilation and execution safeguarding.

**Focus Area:** Translates the synthesis blueprint into deterministic, optimized TradingView script, applying strict variable typing (int, float, series float) and defensive compiler protection.

---

## Infrastructure Binding Layer
The infrastructure exists solely as a performance, persistence, and monitoring framework to ensure reproducible strategy generation.

### 1. Obsidian Vault (Long-Term Knowledge Storage)
**Operational Role:** The Immutable Source of Truth (RAG Framework).

**Mission Link:** Stores the official Pine Script v5 reference schemas, valid non-repainting MTF code templates, and historic strategy post-mortem analysis logs. It forces the swarm to review past optimization failures before initiating a task.

### 2. Session Memory (Short-Term Context Engine)
**Operational Role:** Active state handling and automated code correction loops.

**Mission Link:** Captures real-time script generation state, TradingView compiler errors, or failure indicators from the current user session, feeding them directly back to the active swarm for self-healing attempts.

### 3. Graphify (Telemetry Monitor)
**Operational Role:** Real-time execution routing and pipeline visualization.

**Mission Link:** Maps pipeline trajectories (Nodes/Edges) as the sequential swarm runs. It instantly pinpoints rate limits, timeout events, or fallback routing issues across local/cloud environments, keeping system mechanics fully visible.

---

## Real Market Validation & Optimization Policy

### 1. Verification Priorities
The system completely rejects Strategy Tester "Net Profit" or "Profit Factor" figures as definitive proof of strategy viability. Code validation must prioritize resilience under realistic market conditions:

**Primary Targets:** TradingView Bar Replay validation, forward testing paper logs, ticks simulation arrays, broker export data reconciliation, spread and slippage impact verification.

### 2. Optimization Rules
When generating or modifying Pine Script logic, the framework enforces these constraints:

#### Architecture Freeze Protocol
**STRICTLY ENFORCE — ABSOLUTELY AVOID**

##### Core Anti-Cheat Rules (Never Violate)
- **Confirmed bars validation only** — Use `barstate.isconfirmed` (or equivalent) for all entry/exit decisions
- **No lookahead / future leakage** — Never reference `bar_index[n]` where n < 0, `close[0]`, or any unreleased data
- **Zero historical repainting** — No `security()` calls with lookahead, no changing past signals on realtime bars
- **No ATR-based dynamic stops on the entry bar** — Stops must be calculated from prior confirmed bars only

##### Overfitting & Curve-Fitting Defenses
- **No over-fit indicator matching** — Avoid stacking 5+ indicators tuned to the same dataset
- **No arbitrary win-rate targeting** — Never optimize parameters specifically to hit 60%+ win rate
- **Minimal & justified parameters only** — Excessive inputs = automatic rejection
- **No unchecked recursive variables** — All recursive logic must be bounded and reset on new positions

##### Real-World Simulation Requirements
- **Explicit slippage modeling** — Always include realistic slippage (minimum 1-2 ticks or % of ATR)
- **Real-world spread allowance** — Factor in bid-ask spread on every entry and exit
- **Drawdown mitigation rules** — Implement position sizing, max concurrent risk, and equity curve protection

---

## Pre-Execution Validation Checklist
Before any modification or file writing occurs, the system must execute this validation checklist against the proposed code block:

1. **Does this update directly fix, validate, or optimize Pine Script logic?**
2. **Does this update add unneeded architecture, external workflows, or UI complexity?**

**If Question 1 is NO, or Question 2 is YES: Abort execution instantly. Do not write the code.**

---

## File Registry & System Activation
This document serves as the absolute blueprint for system operation. It is permanently cataloged to maintain operational alignment across sessions:

**Target Storage Location:** `C:\Users\Softthrone\Claude\Dashboard\PROJECT_MISSION.md`

**Status:** Frozen v1.5 Core — No architectural changes permitted without explicit user authorization.
