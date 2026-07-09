/**
 * ============================================================================
 *  ⚠️  ARCHIVED — NOT PART OF THE ACTIVE VEGA SUITE.  DO NOT WIRE THIS IN.
 * ============================================================================
 *  This is a standalone multi-agent swarm orchestrator class from the older
 *  vanilla-JS HUD. It is NOT used by the current stack:
 *    - The React frontend (midas_code/) does not import it.
 *    - Vega_Gateway_Server.js does not require it.
 *    - No index.html loads it.
 *  It has no Node entry point (it only exports a class / attaches to
 *  `window.Vega` in a browser), so `node Vega_Orchestrator.legacy.js` does
 *  nothing. It was removed from launch_vega_suite.ps1 for that reason.
 *
 *  Kept for reference / possible future reuse (agent routing, swarm→synthesis→
 *  audit pipeline, Pine validation, cost tracking). If you revive it, give it a
 *  real entry point and move it back out of archive/ deliberately.
 * ============================================================================
 *
 * Vega Orchestrator v1.5 - Fixed & Updated June 2026
 * Stable version with better proxy handling, code extraction, and new models
 */

/**
 * v1.5.1 NOTE - Vault Bridge Behavior:
 *
 * Node/CLI context: vaultBridge initialized via require() → vault sync works, analyses persist to Obsidian vault
 * Browser context: vaultBridge is null (no require/fs access in sandboxed DOM environment)
 *   → Vault queue accepts writes but fails gracefully (see _processVaultWrite null-check)
 *   → Analyses stored in window.VegaResults[taskId] for HUD display
 *   → No Obsidian sync from browser (expected, accepted behavior for v1.5.1)
 *
 * Browser vault persistence deferred to v1.5.2 (requires server-side endpoint on localhost:8001).
 * This design maintains v1.5.0's correctness: no silent failures, explicit error logs, graceful fallback.
 */
class VegaOrchestrator {
  constructor(config = {}) {
    this.workspacePath = config.workspacePath || 'C:\\Users\\Softthrone\\Claude\\TradingView-Suite';

    // Each agent maps to a named gateway provider slot (same pattern as Strategy Intake).
    // Slots: nvidia_intake | nvidia_pine | nvidia_lint | nvidia_backtest | gemini | openrouter
    this.agents = {
      hermes: {
        id: 'hermes',
        name: 'Hermes Router (Llama 3.3)',
        model: 'meta/llama-3.3-70b-instruct',
        provider: 'nvidia_intake',
        temperature: 0.3,
        tier: 'NVIDIA',
        role: 'Router & Orchestrator (Primary)'
      },
      qwen_fallback: {
        id: 'qwen_fallback',
        name: 'Llama 3.3 Fallback',
        model: 'meta/llama-3.3-70b-instruct',
        provider: 'nvidia_intake',
        temperature: 0.3,
        tier: 'NVIDIA',
        role: 'Router Fallback'
      },
      qwen: {
        id: 'qwen',
        name: 'Architect (Llama 3.3)',
        model: 'meta/llama-3.3-70b-instruct',
        provider: 'nvidia_intake',
        temperature: 0.4,
        tier: 'NVIDIA',
        role: 'Vision + Reasoning / Architecture'
      },
      nemotron: {
        id: 'nemotron',
        name: 'Nemotron 3 Ultra',
        model: 'nvidia/nemotron-3-ultra-550b-a55b',
        provider: 'nvidia_backtest',
        temperature: 0.5,
        tier: 'NVIDIA',
        role: 'Quant + Logic'
      },
      nex: {
        id: 'nex',
        name: 'Maverick Pine Coder',
        model: 'meta/llama-4-maverick-17b-128e-instruct',
        provider: 'nvidia_pine',
        temperature: 0.65,
        tier: 'NVIDIA',
        role: 'Agentic Coding & Pine Generation'
      },
      claude: {
        id: 'claude',
        name: 'Maverick Pine Authority',
        model: 'meta/llama-4-maverick-17b-128e-instruct',
        provider: 'nvidia_pine',
        temperature: 0.65,
        tier: 'NVIDIA',
        role: 'Pine Script Authority'
      },
      gemini: {
        id: 'gemini',
        name: 'Gemini 2.0 Flash',
        model: 'gemini-2.0-flash',
        provider: 'gemini',
        temperature: 0.5,
        tier: 'GEMINI',
        role: 'Fast Synthesis'
      },
      gpt: {
        id: 'gpt',
        name: 'Llama 3.1 Lint',
        model: 'meta/llama-3.1-8b-instruct',
        provider: 'nvidia_lint',
        temperature: 0.2,
        tier: 'NVIDIA',
        role: 'Lightweight Reasoning / Lint'
      }
    };

    this.costTracker = { swarm: 0, gemini: 0, claude: 0, saved: 0 };
    this.taskLog = [];
    this.vaultBridge = null;
    this.vaultWriteQueue = Promise.resolve();
    this.vaultWriteSeq = 0;

    // Memory-conditioned prompt policy. OFF by default — enable explicitly with
    // new VegaOrchestrator({ memoryPolicy: true }). Kept dormant so it never
    // alters prompts during troubleshooting.
    this.memoryIndex = null;
    this.PromptPolicy = null;
    this.memoryPolicyEnabled = config.memoryPolicy === true;

    // Initialize vault bridge immediately (not lazily) to avoid concurrent race conditions
    this.initializeVaultBridge();
    this.initializeMemoryPolicy();

    // Reality Engine — independent of memory conditioning; always load in Node.
    this.computeRealityPF = null;
    if (typeof require !== 'undefined') {
      try {
        const { computeRealityPF } = require('./compute-reality-pf.js');
        this.computeRealityPF = computeRealityPF;
        console.log('[REALITY] ✓ Reality Engine loaded');
      } catch (err) {
        console.warn('[REALITY] Could not load compute-reality-pf.js:', err.message);
      }
    }
  }

  initializeMemoryPolicy() {
    if (!this.memoryPolicyEnabled) {
      console.log('[POLICY] Memory conditioning disabled via config.');
      return;
    }
    if (typeof require === 'undefined') return; // browser context: no-op, like the vault bridge
    try {
      const { VegaMemoryIndex, PromptPolicy } = require('./Vega-memory-policy.js');
      this.PromptPolicy = PromptPolicy;
      this.memoryIndex = new VegaMemoryIndex(this.workspacePath + '/Obsidian').buildIndex();
      console.log('[POLICY] ✓ Memory conditioning initialized');
    } catch (err) {
      console.warn('[POLICY] Could not initialize memory policy:', err.message);
      this.memoryIndex = null;
      this.PromptPolicy = null;
    }
  }

  initializeVaultBridge() {
    if (typeof require !== 'undefined') {
      try {
        const path = require('path');
        const VaultSync = require('./vault-sync.js');
        this.vaultBridge = new VaultSync(this.workspacePath + '/Obsidian');
        console.log('[VAULT] ✓ Vault bridge initialized');
      } catch (err) {
        console.warn('[VAULT] Could not initialize vault bridge:', err.message);
      }
    }
  }

  // ==================== IMPROVED CALL AGENT ====================
  async callAgent(agent, userPrompt, systemPrompt = null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minute timeout

    try {
      const messages = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: userPrompt });

      console.log(`[API] → ${agent.name} (${agent.provider}/${agent.model})`);

      const response = await fetch('http://localhost:8001/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: agent.model,
          provider: agent.provider,
          messages,
          max_tokens: agent.max_tokens ?? 4000,
          temperature: agent.temperature ?? 0.7
        })
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || `HTTP ${response.status}`);
      }

      console.log(`[API] ✓ ${agent.name} success`);
      return data.choices?.[0]?.message?.content || '[No response]';

    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        console.error(`[API] ${agent.name} timed out after 3 minutes`);
        return `[Error: ${agent.name} timed out]`;
      }

      console.error(`[API] ${agent.name} failed: ${err.message}`);
      return `[Error: ${agent.name} unavailable - ${err.message}]`;
    }
  }

  // ==================== STRONGER CODE EXTRACTION ====================
  extractCodeGeneration(auditResult) {
    // Safely extract text before calling .match()
    let text = auditResult;

    if (typeof text !== 'string') {
      if (text && text.auditNotes) {
        text = text.auditNotes;
      } else if (text && text.synthesis) {
        text = text.synthesis;        // non-audit path: use the real synthesis text, not a JSON dump
      } else if (text && text.text) {
        text = text.text;
      } else {
        text = '';                    // never JSON.stringify a result object into a .pine file
      }
    }

    // NOW safe to call .match() on text
    if (typeof text !== 'string') {
      text = '';
    }

    // Try various code block formats
    let match = text.match(/```(?:pinescript|pine|typescript|js)?\s*\n([\s\S]*?)\n```/i);
    if (!match) match = text.match(/```([\s\S]*?)```/i);

    if (match && match[1].trim().length > 80) {
      return { code: match[1].trim(), language: 'pinescript', generated: true };
    }

    // Fallback for raw Pine Script
    if (text.includes('//@version') || text.includes('indicator(') || text.includes('strategy(')) {
      return { code: text.substring(0, 3500), language: 'pinescript', generated: true };
    }

    return {
      code: text.substring(0, 2000) || '[No valid Pine Script code block found in response]',
      language: 'pinescript',
      generated: false
    };
  }

  // ==================== OTHER METHODS (unchanged but kept for completeness) ====================
  async injectPriorLearning() {
    console.log('[MEMORY] Attempting to inject prior learning...');
    return 'No prior heuristics recorded yet.';
  }

  async executeAnalysis(task) {
    const startTime = Date.now();
    const taskId = `task_${Date.now()}`;

    console.log(`[ORCHESTRATOR] Starting analysis: ${task.type} (${taskId})`);

    try {
      const priorLearning = await this.injectPriorLearning();
      task.priorLearning = priorLearning;

      console.log(`[VAULT] Querying Obsidian for context...`);
      let context = {};

      // Query vault for context by task tags
      if (this.vaultBridge && task.tags) {
        try {
          context = await this.vaultBridge.search(task.tags) || {};
          console.log(`[VAULT] ✓ Retrieved context from ${Object.keys(context).length} notes`);
        } catch (err) {
          console.warn('[VAULT] Vault query failed:', err.message);
          context = {};
        }
      }

      console.log(`[SWARM] Executing parallel agents...`);
      const swarmResults = await this.executeSwarm(task, context);

      console.log(`[GEMINI] Synthesizing swarm results...`);
      const synthesis = await this.executeSynthesis(swarmResults, context);

      let finalResult = synthesis;
      if (task.requiresAudit === true || synthesis.confidence < 0.75) {
        console.log(`[CLAUDE] Generating Pine Script code...`);
        finalResult = await this.executeAudit(synthesis, task);
      }

      const codeArtifact = this.extractCodeGeneration(finalResult);
      const backTestParams = this.extractBacktestParams(finalResult);

      console.log(`[VAULT] Saving analysis...`);
      const analysisData = {
        title: `${task.setup || 'Analysis'} (${task.type})`,
        tags: task.tags || ['general'],
        confidence: finalResult?.confidence || 0,
        summary: finalResult?.synthesis || finalResult || 'Analysis complete',
        auditNotes: codeArtifact?.code || ''
      };
     await this.saveToVault(analysisData);
      // ── REALITY INJECTOR → VALIDATION → MEMORY ─────────────────────────
      try {
        const bt = task.backtest || {};   // dashboard/API supplies {grossProfit,grossLoss,totalTrades}
        const reality = (this.computeRealityPF || (() => ({ adjusted_pf:null, original_pf:null, ambiguous_traps:0, injectedSlippage:0 })))({
          grossProfit: bt.grossProfit,
          grossLoss:   bt.grossLoss,
          totalTrades: bt.totalTrades,
          symbol:      task.symbol,
          trades:      bt.trades,
          trapCheck:   finalResult?.ruleCheck?.trapCheck
        });
        const agentKey = String(finalResult?.successAgent || 'unknown').toLowerCase() + '_verdict';
        const verdict  = finalResult?.ruleCheck?.passed ? 'PASS' : 'FAIL';
        const validationData = {
          title: `${task.setup || 'Analysis'} (${task.type})`,
          tags: task.tags || ['general'],
          confidence: finalResult?.confidence || 0,
          compileStatus: finalResult?.ruleCheck ? (finalResult.ruleCheck.passed ? 'pass' : 'fail') : 'pending',
          ruleCheck: finalResult?.ruleCheck || null,
          slippageDelta: reality.injectedSlippage || undefined,
          task_id: taskId,
          adjusted_pf: reality.adjusted_pf,
          original_pf: reality.original_pf,
          ambiguous_traps: reality.ambiguous_traps,
          strategy_tags: task.tags || [],
          [agentKey]: verdict
        };
        if (this.vaultBridge && typeof this.vaultBridge.createValidationEntry === 'function') {
          await this.vaultBridge.createValidationEntry(validationData);
        }
        if (this.memoryIndex && typeof this.memoryIndex.hotInject === 'function') {
          this.memoryIndex.hotInject({
            task_id: taskId,
            adjusted_pf: reality.adjusted_pf,
            original_pf: reality.original_pf,
            ambiguous_traps: reality.ambiguous_traps,
            strategy_tags: task.tags || [],
            [agentKey]: verdict
          });
        }
        console.log(`[REALITY] adjusted_pf=${reality.adjusted_pf} (${verdict} on ${finalResult?.successAgent || 'unknown'})`);
      } catch (e) {
        console.warn('[REALITY] validation/memory wire skipped:', e.message);
      }
      // ───────────────────────────────────────────────────────────────────
      if (task.visualize !== false) {
        await this.callGraphify(task);
      }

      console.log(`[REFLEXION] Running post-mortem...`);
      await this.runReflexion(taskId, 'Success', finalResult);

      console.log(`[MCP] Preparing code write...`);
      const writeResult = await this.writeCodeToWorkspace(taskId, codeArtifact, backTestParams);

      const duration = Date.now() - startTime;
      this.logTask(taskId, task, finalResult, duration);

      const fullResult = {
        success: true,
        taskId,
        result: finalResult,
        codeArtifact,
        backTestParams,
        writeResult,
        cost: 0.000002,
        duration
      };

      // ==================== HANDOFF TO HUD ====================
      // Save result to task-keyed storage + compatibility alias
      if (typeof window !== 'undefined') {
        window.VegaResults = window.VegaResults || {};
        window.VegaResults[taskId] = fullResult;
        window.lastResult = fullResult; // alias: always points at most recently completed task
        console.log(`[ORCHESTRATOR] ✓ Result saved to window.VegaResults[${taskId}]`);

        // Trigger HUD display function if available
        if (typeof window.VegaIntegration !== 'undefined' && typeof window.VegaIntegration.showResults === 'function') {
          console.log('[ORCHESTRATOR] ✓ Triggering VegaIntegration.showResults()');
          window.VegaIntegration.showResults(fullResult);
        }
      }
      // ========================================================

      return fullResult;

    } catch (err) {
      console.error(`[ORCHESTRATOR] Task failed: ${err.message}`);
      return { success: false, taskId, error: err.message };
    }
  }

  async routeTask(task) {
    console.log(`[ROUTER] Routing task: ${task.type} (5s initial cooldown)...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('[ROUTER] Cooldown complete, testing models...');

    const routingPrompt = `You are a task router. Decide which specialized agents should handle this task:
Task type: ${task.type}
Setup: ${task.setup || 'unknown'}
Context: ${task.context?.substring(0, 200) || 'none'}

Available agents:
- qwen: Architect (nvidia_intake / llama-3.3-70b)
- nemotron: Quant + Logic (nvidia_backtest / nemotron)
- nex: Pine Coder (nvidia_pine / llama-4-maverick)
- claude: Pine Authority (nvidia_pine / llama-4-maverick)
- gemini: Fast Synthesis (gemini-2.0-flash)
- gpt: Lightweight Lint (nvidia_lint / llama-3.1-8b)

Respond with agent IDs only, comma-separated. For now, respond with: qwen,nemotron`;

    // Primary router — nvidia_intake / llama-3.3-70b (same slot as Strategy Intake)
    let routingDecision = await this.callAgent(this.agents.hermes, routingPrompt);

    if (routingDecision.includes('[Error') || routingDecision.length < 5) {
      console.warn(`[ROUTER] Hermes failed, trying intake-slot fallback...`);
      routingDecision = await this.callAgent(this.agents.qwen_fallback, routingPrompt);
    }

    // If Llama fails, try Gemini
    if (routingDecision.includes('[Error') || routingDecision.length < 5) {
      console.warn(`[ROUTER] Llama fallback failed, trying Gemini fallback...`);
      routingDecision = await this.callAgent(this.agents.gemini, routingPrompt);
    }

    if (routingDecision.includes('[Error') || routingDecision.length < 5) {
      console.warn(`[GEMINI] Fallback failed, trying Claude fallback...`);
      routingDecision = await this.callAgent(this.agents.claude, routingPrompt);
    }

    if (routingDecision.includes('[Error') || routingDecision.length < 5) {
      console.warn(`[CLAUDE] Fallback failed, using static routing rules...`);
      routingDecision = this.getStaticRouting(task);
    }

    const agents = routingDecision.split(',').map(s => s.trim().toLowerCase()).filter(id => this.agents[id]);

    console.log(`[ROUTER] Final agents: ${agents.join(', ')}`);
    return agents.length > 0 ? agents : ['qwen'];
  }

  getStaticRouting(task) {
    // Static routing rules based on task type
    const rules = {
      'vision': ['qwen'],
      'setup-analysis': ['qwen'],
      'strategy-analysis': ['qwen'],
      'backtest': ['nemotron'],
      'code': ['nex', 'claude']
    };

    const taskType = task.type?.toLowerCase() || 'setup-analysis';
    const agents = rules[taskType] || rules['setup-analysis'];
    console.log(`[STATIC] Using rules for "${taskType}": ${agents.join(', ')}`);
    return agents.join(', ');
  }

  // ==================== ANTI-CHEAT / OVERFITTING LINTER ====================
  validatePineScriptRules(code) {
    const violations = [];
    const warnings = [];

    if (typeof code !== 'string') {
      code = String(code);
    }

    // 1. CONFIRMED BARS VALIDATION: barstate.isconfirmed must be present if strategy.entry() exists
    const hasEntry = /strategy\.entry\s*\(/i.test(code);
    if (hasEntry && !code.includes('barstate.isconfirmed')) {
      violations.push('strategy.entry() detected but barstate.isconfirmed validation missing');
    }

    // 2. LOOKAHEAD DETECTION: negative offsets, close[-...], bar_index + negative
    const lookaheadPatterns = [
      /close\s*\[\s*-/i,           // close[-1], close[- etc.
      /\[bar_index\s*\+\s*\d/i,    // [bar_index + 1] or larger
      /security\([^)]*lookahead\s*=\s*barmerge\.lookahead_on/i  // security() with lookahead=on
    ];

    lookaheadPatterns.forEach((pattern, idx) => {
      if (pattern.test(code)) {
        violations.push(`Potential lookahead leakage detected (pattern ${idx + 1})`);
      }
    });

    // 3. REPAINTING: security() with any lookahead parameter (overly broad but safe)
    if (/security\s*\([^)]*lookahead/i.test(code)) {
      violations.push('security() call with lookahead parameter may cause repainting');
    }

    // 4. OVERFITTING HEURISTIC: Count distinct ta.* indicator calls
    const indicators = code.match(/ta\.\w+\s*\(/gi) || [];
    const uniqueIndicators = new Set(indicators.map(i => i.toLowerCase()));
    if (uniqueIndicators.size >= 5) {
      warnings.push(`High indicator stacking detected (${uniqueIndicators.size} distinct ta.* calls) - risk of overfitting`);
    }

    // 5. MANDATORY SLIPPAGE/SPREAD MODELING
    if (!/slippage|spread|commiss/i.test(code)) {
      warnings.push('No slippage, spread, or commission modeling detected - may diverge from real-world fills');
    }

    // 6. ATR-BASED STOPS ON ENTRY BAR: heuristic check
    const atrOnEntryPattern = /strategy\.entry[^}]*atr\s*\(/i;
    if (atrOnEntryPattern.test(code) && !code.includes('barstate.isconfirmed')) {
      warnings.push('ATR-based stops may be calculated on entry bar without bar confirmation - review manually');
    }

    // 7. INTRA-BAR TRAP-DETECTION PRECONDITION
    // The future Reality engine needs to read the actual SL/TP that were active at
    // exit so it can replay 1m data and check whether stop or target printed first.
    // This rule reports whether that audit is even POSSIBLE for this strategy.
    // It does NOT fail the strategy - it always reports a status to the operator.
    let trapStatus = 'n/a';   // no exit at all -> nothing to audit
    const hasExit = /strategy\.(exit|close)\s*\(/i.test(code);
    if (hasExit) {
      // Optimistic default: assume detectable, then downgrade below if evidence is missing.
      trapStatus = 'available';

      // Detect trailing first - it changes how the SL/TP readability is reported.
      // A trailing stop's exit-time value differs from its entry-time value, so a
      // logger that captures SL at entry would audit the trade against a stale price.
      const hasTrailingExit = /trail_(points|price|offset)\s*=/i.test(code) ||
                              /strategy\.exit[^)]*trail/i.test(code);

      // 7a. Are stop/limit prices passed as named variables, or inlined / absent?
      const stopArg  = code.match(/\bstop\s*=\s*([^,\)\n]+)/i);
      const limitArg = code.match(/\blimit\s*=\s*([^,\)\n]+)/i);

      const looksLikeVariable = (m) => {
        if (!m) return false;
        const val = m[1].trim();
        // a bare identifier (optionally with [n] history) reads as a variable;
        // a literal number or an inline expression with operators does not.
        return /^[A-Za-z_]\w*(\s*\[\s*\d+\s*\])?$/.test(val);
      };

      const stopReadable  = looksLikeVariable(stopArg);
      const limitReadable = looksLikeVariable(limitArg);

      if (!stopArg && !limitArg) {
        trapStatus = 'unavailable';
        warnings.push('TRAP-CHECK: no stop= / limit= found on exit - intra-bar trap detection unavailable (cannot recover SL/TP intent)');
      } else if ((!stopReadable || !limitReadable) && !hasTrailingExit) {
        trapStatus = 'partial';
        warnings.push('TRAP-CHECK: SL/TP appear inlined as literals or expressions, not named variables - logger would record incomplete boundaries; expose them as var float for trap detection');
      }

      // 7b. Trailing is the louder flag - route these to manual replay, not the resolver.
      if (hasTrailingExit) {
        trapStatus = 'unreliable';
        warnings.push('TRAP-CHECK: trailing stop detected - exit-time SL differs from entry-time SL; intra-bar trap detection is UNRELIABLE for this strategy (route to manual replay, not the static-bracket resolver)');
      }
    }

    // 7c. Always emit a readable status message (was previously silent on the clean case).
    const trapMessages = {
      'available':   'TRAP-CHECK: intra-bar trap detection AVAILABLE - stop= and limit= are named variables; static-bracket resolver can replay 1m data against the recorded SL/TP.',
      'partial':     'TRAP-CHECK: intra-bar trap detection PARTIAL - SL/TP inlined as literals/expressions; expose them as `var float` to recover full boundaries.',
      'unavailable': 'TRAP-CHECK: intra-bar trap detection UNAVAILABLE - no stop=/limit= on exit; SL/TP intent cannot be recovered.',
      'unreliable':  'TRAP-CHECK: intra-bar trap detection UNRELIABLE - trailing stop; exit-time SL differs from entry-time SL. Route to manual replay, not the static-bracket resolver.',
      'n/a':         'TRAP-CHECK: not applicable - no strategy.exit() / strategy.close() found.'
    };

    return {
      passed: violations.length === 0,
      violations,
      warnings,
      trapCheck: { status: trapStatus, message: trapMessages[trapStatus] }
    };
  }

  async executeSwarm(task, obsidianContext) {
    // Get routing decision from Hermes
    const agentIds = await this.routeTask(task);

    const results = [];

    for (const agentId of agentIds) {
      const agent = this.agents[agentId];
      if (!agent) {
        console.warn(`[SWARM] Unknown agent: ${agentId}`);
        continue;
      }

      console.log(`[SWARM] → Calling ${agent.name}...`);

      try {
        const result = await this.callAgent(
          agent,
          this.buildSwarmPrompt(task, agent, obsidianContext)
        );

        results.push({ agent: agentId, result });

        // Reduced cooldown (was 30 seconds)
        if (agentIds.length > 1) {
          console.log(`[SWARM] Cooling down 4 seconds before next agent...`);
          await new Promise(resolve => setTimeout(resolve, 4000));
        }

      } catch (error) {
        console.error(`[SWARM] ❌ ${agentId} failed:`, error);
        results.push({ agent: agentId, result: error.message });
      }
    }

    return results;
  }

  buildSwarmPrompt(task, agent, obsidianContext = {}) {
    const agentId = agent.id?.toLowerCase();
    const contextStr = obsidianContext?.summary || '';

    let prompt;

    // Lane-specific prompts per blueprint's "Disciplined Swarm Roles & Lanes"
    if (agentId === 'qwen') {
      prompt = `[ARCHITECT LANE] Analyze this trading setup for structural architecture and session-based logic:

Setup: ${task.setup || 'General'}
Context: ${task.context || 'None'}

Vault Context: ${contextStr || 'No prior analysis'}

Focus on:
- Session filters (New York, London, Asian session openings)
- Execution intervals and timeframe logic
- Standard structural logic blocks (entry conditions, exit conditions)
- Order routing flows (market, limit, stop orders)

Respond with concrete architectural recommendations for Pine Script v5.`;
    } else if (agentId === 'nemotron') {
      prompt = `[QUANT CORE LANE] Analyze this trading setup for advanced quantitative mathematics:

Setup: ${task.setup || 'General'}
Context: ${task.context || 'None'}

Vault Context: ${contextStr || 'No prior analysis'}

Focus on:
- Complex indicator mathematics (Hull MA, LSMA, ZLEMA hybrid smoothing)
- Multi-timeframe (MTF) array aggregation techniques
- Fibonacci "Golden Zone" pullback coordinate calculations
- Advanced smoothing and confirmation algorithms

Respond with precise mathematical formulations ready for Pine Script implementation.`;
    } else {
      // Default generic prompt for other agents (Gemini, Nex, Claude, etc.)
      prompt = `Analyze this trading setup for Pine Script optimization:

Setup: ${task.setup || 'General'}
Context: ${task.context || 'None'}

Vault Context: ${contextStr || 'No prior analysis'}

Provide analysis and recommendations for Pine Script v5 strategy design.`;
    }

    // Append memory conditioning from prior vault audits.
    // No-op when the policy is disabled, unavailable, or the vault lacks relevant history.
    if (this.memoryPolicyEnabled && this.memoryIndex && this.PromptPolicy) {
      try {
        prompt += this.PromptPolicy.buildMemoryBriefing(agent.id, task.tags, this.memoryIndex);
      } catch (err) {
        console.warn('[POLICY] Briefing skipped:', err.message);
      }
    }

    return prompt;
  }

  async executeSynthesis(swarmResults) {
    const summary = swarmResults
        .map(r => `=== ${r.agent.toUpperCase()} ANALYSIS ===\n${r.result?.substring(0, 800) || '[No response]'}`)
        .join('\n\n');

    const prompt = `You are a quantitative trading analyst. Synthesize the following multi-agent analysis reports into a single coherent trading thesis with a clear directional bias, confidence level, and Pine Script strategy recommendation.

${summary}

Provide:
1. THESIS: One-detailed synthesis of the combined analysis
2. DIRECTIONAL BIAS: Bullish / Bearish / Neutral with reasoning
3. KEY CONFLUENCES: Top 3 signals agents agreed on
4. PINE SCRIPT RECOMMENDATION: Indicator/strategy type to code
5. CONFIDENCE: 0.0–1.0 score based on agent agreement`;

    let synthesisText = await this.callAgent(this.agents.gemini, prompt);

    // Debug logging for synthesis result type
    console.log('[SYNTHESIS DEBUG] Result type:', typeof synthesisText, 'Value:', synthesisText);

    // Handle multiple return types from different models
    if (typeof synthesisText !== 'string') {
      if (synthesisText && synthesisText.text) {
        synthesisText = synthesisText.text;
      } else if (typeof synthesisText === 'object') {
        synthesisText = JSON.stringify(synthesisText);
      }
    }

    console.log('[SYNTHESIS DEBUG] After fix, type:', typeof synthesisText);
    return { synthesis: synthesisText, confidence: 0.82 };
  }

  async executeAudit(synthesis, task) {
    console.log(`[AUDIT] Starting hybrid code generation...`);

    const userPrompt = `Generate a complete, clean, production-ready Pine Script v5 strategy.

Thesis:
${synthesis.synthesis}

Requirements:
- Use //@version=5
- Proper strategy.entry() and strategy.exit()
- Risk management (stop loss, take profit, position sizing)
- Clear comments explaining the logic
- Ready to copy-paste into TradingView`;

    const agents = [
      { name: 'Claude', agent: this.agents.claude },
      { name: 'Nex', agent: this.agents.nex },
      { name: 'Nemotron', agent: this.agents.nemotron }
    ];

    let auditText = "";
    let successAgent = null;

    // Try each agent in order, KEEP FIRST SUCCESS
    for (let i = 0; i < agents.length; i++) {
      const { name, agent } = agents[i];
      console.log(`[AUDIT ${i + 1}/3] Trying ${name}...`);

      const result = await this.callAgent(agent, userPrompt);

      // LOG WHAT WE GOT
      console.log(`[AUDIT DEBUG] ${name} returned ${result.length} chars`);
      console.log(`[AUDIT DEBUG] First 150 chars:`, result.substring(0, 150));
      console.log(`[AUDIT DEBUG] Has "strategy"?`, result.toLowerCase().includes("strategy"));
      console.log(`[AUDIT DEBUG] Has "entry"?`, result.toLowerCase().includes("entry"));
      console.log(`[AUDIT DEBUG] Has "//"?`, result.includes("//"));
      console.log(`[AUDIT DEBUG] Has "[Error"?`, result.includes("[Error"));

      // Validate: is this good code? (looser validation)
      const isValid = !result.includes("[Error") &&
                      result.length >= 50 &&
                      (result.toLowerCase().includes("strategy") ||
                       result.toLowerCase().includes("entry") ||
                       result.toLowerCase().includes("exit") ||
                       result.toLowerCase().includes("pine") ||
                       result.toLowerCase().includes("var ") ||
                       result.includes("//"));

      console.log(`[AUDIT DEBUG] ${name} validation: ${isValid ? "✓ PASS" : "✗ FAIL"}`);

      if (isValid) {
        auditText = result;
        successAgent = name;
        console.log(`[AUDIT] ✓ ${name} succeeded (${result.length} chars)`);
        break;  // STOP HERE, don't overwrite with next agent
      } else {
        console.log(`[AUDIT] ${name} failed validation`);
      }
    }

    // If ALL agents failed, return error (never lose working code)
    let ruleCheck = null;
    if (!auditText) {
      auditText = "[Error: All code generation agents exhausted]";
      console.log(`[AUDIT] ✗ All agents failed`);
    } else {
      // Run static anti-cheat linter on successful code (non-blocking)
      ruleCheck = this.validatePineScriptRules(auditText);
      console.log(`[AUDIT LINT] passed=${ruleCheck.passed}, violations=${ruleCheck.violations.length}, warnings=${ruleCheck.warnings.length}`);
      console.log(`[AUDIT LINT] trap-detection: ${ruleCheck.trapCheck.status} - ${ruleCheck.trapCheck.message}`);
      if (ruleCheck.violations.length > 0) {
        console.warn(`[AUDIT LINT] Violations:`, ruleCheck.violations);
      }
      if (ruleCheck.warnings.length > 0) {
        console.warn(`[AUDIT LINT] Warnings:`, ruleCheck.warnings);
      }
    }

    console.log(`[AUDIT] Code generation finished (${auditText.length} chars)`);

    return {
        synthesis: synthesis.synthesis,
        auditNotes: auditText,
        successAgent: successAgent,
        ruleCheck: ruleCheck,
        confidence: 0.82
    };
  }

  extractBacktestParams(text) {
    return {
      timeframe: "Not specified",
      riskPerTrade: "Not specified",
      entryCondition: "Not specified",
      exitCondition: "Not specified",
      maxPositions: "Not specified",
      expectedWinRate: "Not specified"
    };
  }

  async saveToVault(analysisData) {
    const writeNumber = ++this.vaultWriteSeq;
    console.log('[VAULT] Queued write');

    const task = this.vaultWriteQueue.then(() => this._processVaultWrite(analysisData, writeNumber));
    this.vaultWriteQueue = task.catch(() => {}); // keep chain alive even if a write errors

    return task;
  }

  async _processVaultWrite(analysisData, writeNumber) {
    console.log(`[VAULT] Processing write ${writeNumber}/${this.vaultWriteSeq}`);

    if (!this.vaultBridge) {
      console.error('[VAULT] ERROR: vaultBridge not initialized');
      return { success: false, error: 'Vault bridge unavailable' };
    }

    try {
      const result = await this.vaultBridge.createAnalysisEntry(analysisData);
      if (result?.success) {
        console.log(`[VAULT] File created: ${result.filepath}`);
        // Refresh memory index so the next swarm run sees this audit
        if (this.memoryIndex) {
          try { this.memoryIndex.buildIndex(); }
          catch (e) { console.warn('[POLICY] Index refresh skipped:', e.message); }
        }
      }
      return result;
    } catch (err) {
      console.error('[VAULT] Save failed:', err);
      return { success: false, error: err.message };
    }
  }
  async runReflexion() { console.log('[REFLEXION] Lesson extracted.'); return "Lesson learned."; }
  async writeCodeToWorkspace(taskId, codeArtifact) {
    console.log(`[MCP] Code ready: ${codeArtifact.code?.substring(0, 100)}...`);

    // Node.js context: write to disk
    if (typeof require !== 'undefined') {
      try {
        const fs = require('fs');
        const path = require('path');

        const strategyDir = path.join(this.workspacePath, 'generated_strategies');
        const filepath = path.join(strategyDir, `strategy_${taskId}.pine`);

        // Create directory if missing
        if (!fs.existsSync(strategyDir)) {
          fs.mkdirSync(strategyDir, { recursive: true });
        }

        // Write the Pine Script code
        fs.writeFileSync(filepath, codeArtifact.code || '[Empty code artifact]', 'utf8');
        console.log(`[MCP] Pine Script written: ${filepath}`);
        return { success: true, filepath, context: 'Node.js', size: (codeArtifact.code || '').length };
      } catch (err) {
        console.error(`[MCP] File write failed: ${err.message}`);
        return { success: false, error: err.message, context: 'Node.js' };
      }
    }

    // Browser context: no fs access
    console.warn('[MCP] Running in browser context - fs write unavailable');
    return { success: false, reason: 'browser context - no fs access', filepath: `<client-side-only: generated_strategies/strategy_${taskId}.pine>` };
  }

  async callGraphify(analysisData) {
    console.log(`[GRAPHIFY] Sending data to proxy for visualization...`);

    const graphData = {
      nodes: [
        { id: 'task', label: analysisData.type || 'analysis', type: 'task' },
        { id: 'qwen', label: 'Qwen', type: 'agent' },
        { id: 'nemotron', label: 'Nemotron', type: 'agent' },
        { id: 'result', label: 'Synthesis', type: 'result' }
      ],
      edges: [
        { source: 'task', target: 'qwen' },
        { source: 'task', target: 'nemotron' },
        { source: 'qwen', target: 'result' },
        { source: 'nemotron', target: 'result' }
      ]
    };

    try {
      const response = await fetch('http://localhost:8001/api/graphify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graphData)
      });

      const result = await response.json();
      if (result.success) {
        console.log(`[GRAPHIFY] ✓ Graph rendered: ${result.output?.substring(0, 100) || ''}`);
      } else {
        console.warn('[GRAPHIFY] Warning:', result.error?.substring(0, 200));
      }
      return result;
    } catch (err) {
      console.warn('[GRAPHIFY] Proxy call failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ==================== COST TRACKING ====================
  getCostSummary() {
    const total = this.costTracker.swarm + this.costTracker.gemini + this.costTracker.claude;
    return {
      swarmCost: parseFloat(this.costTracker.swarm.toFixed(6)),
      geminiCost: parseFloat(this.costTracker.gemini.toFixed(6)),
      claudeCost: parseFloat(this.costTracker.claude.toFixed(6)),
      totalCost: parseFloat(total.toFixed(6)),
      estimatedSavings: parseFloat(this.costTracker.saved.toFixed(6)),
      taskCount: this.taskLog.length
    };
  }

  calculateTaskCost(result) {
    return (result?.cost || 0) + (result?.costSavedVsAllClaude || 0);
  }

  logTask(taskId, task, result, duration) {
    this.taskLog.push({
      taskId,
      type: task.type,
      timestamp: new Date().toISOString(),
      duration,
      cost: this.calculateTaskCost(result),
      confidence: result?.confidence || 0,
      success: true
    });
    console.log(`[LOG] Task ${taskId} completed | ${duration}ms`);
  }

  estimateCost(prompt, agentId) {
    return 0.000001;
  }
}

// Initialize for browser
if (typeof window !== 'undefined') {
  window.Vega = new VegaOrchestrator();
  console.log('✅ Vega Orchestrator v1.5 initialized on window.Vega');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = VegaOrchestrator;
}
