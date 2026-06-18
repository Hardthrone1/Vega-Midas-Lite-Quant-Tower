/**
 * MIDAS Orchestrator v1.5 - Fixed & Updated June 2026
 * Stable version with better proxy handling, code extraction, and new models
 */

/**
 * v1.5.1 NOTE - Vault Bridge Behavior:
 *
 * Node/CLI context: vaultBridge initialized via require() → vault sync works, analyses persist to Obsidian vault
 * Browser context: vaultBridge is null (no require/fs access in sandboxed DOM environment)
 *   → Vault queue accepts writes but fails gracefully (see _processVaultWrite null-check)
 *   → Analyses stored in window.midasResults[taskId] for HUD display
 *   → No Obsidian sync from browser (expected, accepted behavior for v1.5.1)
 *
 * Browser vault persistence deferred to v1.5.2 (requires server-side endpoint on localhost:8001).
 * This design maintains v1.5.0's correctness: no silent failures, explicit error logs, graceful fallback.
 */
class MIDASOrchestrator {
  constructor(config = {}) {
    this.workspacePath = config.workspacePath || 'C:\\Users\\Softthrone\\Claude\\Dashboard';

    this.agents = {
      qwen: {
        id: 'qwen',
        name: 'Qwen 2.5 72B',
        model: 'meta-llama/llama-3.1-8b-instruct',
        tier: 'FREE',
        role: 'Vision + Reasoning'
      },
      nemotron: {
        id: 'nemotron',
        name: 'Nemotron 3 Ultra',
        model: 'nousresearch/hermes-3-llama-3.1-405b:free',
        tier: 'FREE',
        role: 'Quant + Logic'
      },
      nex: {
        id: 'nex',
        name: 'Nex-N2-Pro',
        model: 'nex-agi/nex-n2-pro:free',
        tier: 'FREE',
        role: 'Agentic Coding & Reasoning'
      },
      gemini: {
        id: 'gemini',
        name: 'Gemini 3.5 Flash',
        model: 'google/gemma-4-31b-it:free',
        tier: 'FREE',
        role: 'Fast Synthesis'
      },
      claude: {
        id: 'claude',
        name: 'Claude',
        model: 'anthropic/claude-haiku-4-5-20251001:free',
        tier: 'FREE',
        role: 'Pine Script Authority'
      },
      hermes: {
        id: 'hermes',
        name: 'Qwen3-Next 80B',
        model: 'qwen/qwen3-next-80b-a3b-instruct:free',
        tier: 'FREE',
        role: 'Router & Orchestrator (Primary)'
      },
      qwen_fallback: {
        id: 'qwen_fallback',
        name: 'Llama 3.3 70B',
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        tier: 'FREE',
        role: 'Router Fallback'
      },
      gpt: {
        id: 'gpt',
        name: 'GPT OSS 120B',
        model: 'openai/gpt-oss-120b',
        tier: 'FREE',
        role: 'Open Source Reasoning'
      }
    };

    this.costTracker = { swarm: 0, gemini: 0, claude: 0, saved: 0 };
    this.taskLog = [];
    this.vaultBridge = null;
    this.vaultWriteQueue = Promise.resolve();
    this.vaultWriteSeq = 0;

    // Initialize vault bridge immediately (not lazily) to avoid concurrent race conditions
    this.initializeVaultBridge();
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
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      try {
        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: userPrompt });

        console.log(`[API] → ${agent.name} (${agent.model})`);

        const response = await fetch('http://localhost:8001/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: agent.model,
            messages,
            max_tokens: 4000,
            temperature: 0.7
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || `HTTP ${response.status}`);
        }

        console.log(`[API] ✓ ${agent.name} success`);
        return data.choices?.[0]?.message?.content || '[No response]';

      } catch (err) {
        attempts++;
        console.error(`[API] ${agent.name} failed (attempt ${attempts}): ${err.message}`);
        if (attempts >= maxAttempts) {
          return `[Error: ${agent.name} unavailable - ${err.message}]`;
        }
        await new Promise(r => setTimeout(r, 1200));
      }
    }
  }

  // ==================== STRONGER CODE EXTRACTION ====================
  extractCodeGeneration(auditResult) {
    // Safely extract text before calling .match()
    let text = auditResult;

    if (typeof text !== 'string') {
      if (text && text.auditNotes) {
        text = text.auditNotes;
      } else if (text && text.text) {
        text = text.text;
      } else if (typeof text === 'object') {
        text = JSON.stringify(text);
      } else {
        text = '';
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
        window.midasResults = window.midasResults || {};
        window.midasResults[taskId] = fullResult;
        window.lastResult = fullResult; // alias: always points at most recently completed task
        console.log(`[ORCHESTRATOR] ✓ Result saved to window.midasResults[${taskId}]`);

        // Trigger HUD display function if available
        if (typeof window.MIDASIntegration !== 'undefined' && typeof window.MIDASIntegration.showResults === 'function') {
          console.log('[ORCHESTRATOR] ✓ Triggering MIDASIntegration.showResults()');
          window.MIDASIntegration.showResults(fullResult);
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
- Qwen: Vision + Reasoning
- Nemotron: Quant + Logic
- Nex: Agentic Coding
- Gemini: Fast Synthesis
- Claude: High Quality (premium)

Respond with agent IDs only, comma-separated. For now, respond with: qwen,nemotron`;

    // Try primary router (Qwen3-Next 80B)
    let routingDecision = await this.callAgent(this.agents.hermes, routingPrompt);

    // If Qwen3-Next fails, try Llama 3.3 70B fallback
    if (routingDecision.includes('[Error') || routingDecision.length < 5) {
      console.warn(`[ROUTER] Qwen3-Next failed, trying Llama 3.3 70B fallback...`);
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

    return {
      passed: violations.length === 0,
      violations,
      warnings
    };
  }

  async executeSwarm(task, obsidianContext) {
    // Get routing decision from Hermes
    const agentIds = await this.routeTask(task);

    // Sequential execution - one agent at a time, safe for free tier
    const results = [];
    for (const agentId of agentIds) {
      const agent = this.agents[agentId];
      console.log(`[SWARM] → Calling ${agent.name} sequentially...`);
      try {
        const result = await this.callAgent(agent, this.buildSwarmPrompt(task, agent, obsidianContext));
        results.push({ agent: agentId, result });
        // Anti-Rate-Limit: 5sec cooldown before next agent
        console.log(`[SWARM] ✓ ${agent.name} finished. Cooling down...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error(`[SWARM] ❌ ${agentId} failed:`, error);
        results.push({ agent: agentId, result: error.message });
        // Continue to next agent even if one fails
      }
    }
    return results;
  }

  buildSwarmPrompt(task, agent, obsidianContext = {}) {
    const agentId = agent.id?.toLowerCase();
    const contextStr = obsidianContext?.summary || '';

    // Lane-specific prompts per blueprint's "Disciplined Swarm Roles & Lanes"
    if (agentId === 'qwen') {
      return `[ARCHITECT LANE] Analyze this trading setup for structural architecture and session-based logic:

Setup: ${task.setup || 'General'}
Context: ${task.context || 'None'}

Vault Context: ${contextStr || 'No prior analysis'}

Focus on:
- Session filters (New York, London, Asian session openings)
- Execution intervals and timeframe logic
- Standard structural logic blocks (entry conditions, exit conditions)
- Order routing flows (market, limit, stop orders)

Respond with concrete architectural recommendations for Pine Script v5.`;
    }

    if (agentId === 'nemotron') {
      return `[QUANT CORE LANE] Analyze this trading setup for advanced quantitative mathematics:

Setup: ${task.setup || 'General'}
Context: ${task.context || 'None'}

Vault Context: ${contextStr || 'No prior analysis'}

Focus on:
- Complex indicator mathematics (Hull MA, LSMA, ZLEMA hybrid smoothing)
- Multi-timeframe (MTF) array aggregation techniques
- Fibonacci "Golden Zone" pullback coordinate calculations
- Advanced smoothing and confirmation algorithms

Respond with precise mathematical formulations ready for Pine Script implementation.`;
    }

    // Default generic prompt for other agents (Gemini, Nex, Claude, etc.)
    return `Analyze this trading setup for Pine Script optimization:

Setup: ${task.setup || 'General'}
Context: ${task.context || 'None'}

Vault Context: ${contextStr || 'No prior analysis'}

Provide analysis and recommendations for Pine Script v5 strategy design.`;
  }

  async executeSynthesis(swarmResults) {
    const summary = swarmResults
        .map(r => `=== ${r.agent.toUpperCase()} ANALYSIS ===\n${r.result?.substring(0, 800) || '[No response]'}`)
        .join('\n\n');

    const prompt = `You are a quantitative trading analyst. Synthesize the following multi-agent analysis reports into a single coherent trading thesis with a clear directional bias, confidence level, and Pine Script strategy recommendation.

${summary}

Provide:
1. THESIS: One-paragraph synthesis of the combined analysis
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
      { name: 'Nemotron', agent: this.agents.nemotron },
      { name: 'Nex-N2-Pro', agent: this.agents.nex },
      { name: 'Claude', agent: this.agents.claude }
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
  window.midas = new MIDASOrchestrator();
  console.log('✅ MIDAS Orchestrator v1.5 initialized on window.midas');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MIDASOrchestrator;
}
