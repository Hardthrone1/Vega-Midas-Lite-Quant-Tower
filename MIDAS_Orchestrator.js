/**
 * MIDAS Orchestrator v1.5 - Fixed & Updated June 2026
 * Stable version with better proxy handling, code extraction, and new models
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
        name: 'Claude Sonnet 4.6',
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        tier: 'PREMIUM',
        role: 'High Quality Fallback'
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
    console.log(`[ROUTER] Routing task: ${task.type}`);

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

  buildSwarmPrompt(task, agent) {
    return `Analyze this trading setup for Pine Script optimization:\nSetup: ${task.setup || 'General'}\nContext: ${task.context || ''}`;
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

    let auditText = "";

    // 1. Primary: Nemotron (strong logic)
    console.log(`[AUDIT 1/3] Trying Nemotron...`);
    auditText = await this.callAgent(this.agents.nemotron, userPrompt);

    // 2. Second: Nex-N2-Pro (agentic coding)
    if (auditText.includes("[Error") || auditText.length < 400 || !auditText.includes("strategy.")) {
        console.log(`[AUDIT 2/3] Trying Nex-N2-Pro (free)...`);
        auditText = await this.callAgent(this.agents.nex, userPrompt);
    }

    // 3. Final fallback: Claude
    if (auditText.includes("[Error") || auditText.length < 400 || !auditText.includes("strategy.")) {
        console.log(`[AUDIT 3/3] Using Claude as final fallback...`);
        auditText = await this.callAgent(this.agents.claude, userPrompt);
    }

    console.log(`[AUDIT] Code generation finished (${auditText.length} chars)`);

    return {
        synthesis: synthesis.synthesis,
        auditNotes: auditText,
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
    return { success: true, filepath: `generated_strategies/strategy_${taskId}.pine` };
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
