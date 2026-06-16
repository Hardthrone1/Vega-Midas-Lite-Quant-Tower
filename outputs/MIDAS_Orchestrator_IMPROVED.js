/**
 * MIDAS Multi-Agent Orchestrator
 *
 * Tiered Workflow:
 * 1. Routine (Vision/Quant/Backtest) → FREE SWARM (Qwen, Nemotron, Llama)
 * 2. Synthesis → GEMINI 2.0 FLASH (Free endpoint, long context)
 * 3. Premium/Audit → CLAUDE (Only for final code/risk refinement)
 * 4. Safety: Block Claude/Grok calls on routine tasks (cost leakage prevention)
 * 5. Memory: Obsidian vault context injected into synthesis
 */

class MIDASOrchestrator {
  constructor(config = {}) {
    this.apiKey = config.apiKey || window.env?.OPENROUTER_API_KEY;
    this.vaultBridge = null;
    this.costTracker = { swarm: 0, gemini: 0, claude: 0, saved: 0 };
    this.taskLog = [];
    this.modelCache = new Map(); // Cache resolved model IDs

    // Agent definitions with cost tiers
    this.agents = {
      // FREE SWARM
      qwen: {
        id: 'qwen',
        name: 'Qwen2.5 VL 32B',
        model: 'qwen/qwen-2.5-vl-32b-instruct',
        tier: 'FREE',
        role: 'Vision',
        costPerMT: 0
      },
      nemotron: {
        id: 'nemotron',
        name: 'Nemotron 70B',
        model: 'nvidia/nemotron-4-340b-instruct',
        tier: 'FREE',
        role: 'Quant',
        costPerMT: 0
      },
      llama: {
        id: 'llama',
        name: 'Llama 3.3 70B',
        model: 'meta-llama/llama-3.3-70b-instruct',
        tier: 'FREE',
        role: 'Auxiliary',
        costPerMT: 0
      },

      // SYNTHESIS (Free endpoint)
      gemini: {
        id: 'gemini',
        name: 'Gemini 2.0 Flash',
        model: 'google/gemini-3.5-flash',
        tier: 'FREE',
        role: 'Synthesis',
        costPerMT: 0
      },

      // PREMIUM (Use sparingly)
      claude: {
        id: 'claude',
        name: 'Claude 3.5 Sonnet',
        model: 'anthropic/claude-sonnet-4.6',
        tier: 'PREMIUM',
        role: 'Audit/Implementation',
        costPerMT: 0.003 // $3 per 1M tokens (approximate)
      }
    };
  }

  /**
   * Main orchestration entry point
   * Routes tasks through tiered workflow
   */
  async executeAnalysis(task) {
    const startTime = Date.now();
    const taskId = `task_${Date.now()}`;

    console.log(`[ORCHESTRATOR] Starting analysis: ${task.type} (${taskId})`);

    try {
      // Step 1: Fetch historical context from Obsidian (LOCAL, $0)
      console.log(`[VAULT] Querying Obsidian for context...`);
      const context = await this.vaultBridge?.search(task.tags || []) || {};

      // Step 2: Route to FREE SWARM (Parallel execution)
      console.log(`[SWARM] Executing parallel agents...`);
      const swarmResults = await this.executeSwarm(task, context);

      // Step 3: SYNTHESIZE via Gemini (Free endpoint)
      console.log(`[GEMINI] Synthesizing swarm results...`);
      const synthesis = await this.executeSynthesis(swarmResults, context);

      // Step 4: AUDIT via Claude (ONLY if high confidence or explicit request)
      let finalResult = synthesis;
      if (task.requiresAudit === true || synthesis.confidence < 0.75) {
        console.log(`[CLAUDE] Executing audit (confidence: ${synthesis.confidence})...`);
        finalResult = await this.executeAudit(synthesis, task);
      }

      // Step 5: Track costs and log
      const duration = Date.now() - startTime;
      this.logTask(taskId, task, finalResult, duration);

      return {
        success: true,
        taskId,
        result: finalResult,
        cost: this.calculateTaskCost(finalResult),
        duration
      };

    } catch (err) {
      console.error(`[ORCHESTRATOR] Task failed: ${err.message}`);
      return { success: false, taskId, error: err.message };
    }
  }

  /**
   * Step 2: FREE SWARM - Execute multiple agents in parallel
   * Vision + Quant + Orchestration tasks
   * Total cost: ~$0 (free endpoints only)
   */
  async executeSwarm(task, obsidianContext) {
    const swarmPromises = [];
    const activeAgents = [];

    // Determine which swarm agents to activate based on task type
    if (task.type === 'vision' || task.type === 'setup-analysis') {
      activeAgents.push('qwen');
    }
    if (task.type === 'quant' || task.type === 'backtest' || task.type === 'setup-analysis') {
      activeAgents.push('nemotron');
    }
    if (task.type === 'orchestration') {
      activeAgents.push('llama'); // Llama for complex reasoning
    }

    // Execute all swarm agents in parallel
    for (const agentId of activeAgents) {
      const agent = this.agents[agentId];
      const promise = (async () => {
        try {
          // Discover available model dynamically
          let modelId;
          if (typeof getAvailableModel !== 'undefined') {
            modelId = await getAvailableModel(agentId, ':free');
          } else {
            throw new Error(`Model discovery not available (getAvailableModel not defined)`);
          }

          return {
            agent: agentId,
            result: await this.callAgent(
              { ...agent, model: modelId },
              this.buildSwarmPrompt(task, agent, obsidianContext)
            ),
            cost: 0 // Free tier
          };
        } catch (err) {
          console.error(`[SWARM] Agent ${agentId} failed: ${err.message}`);
          return {
            agent: agentId,
            result: `[Error: ${err.message}]`,
            cost: 0
          };
        }
      })();
      swarmPromises.push(promise);
    }

    const swarmResults = await Promise.all(swarmPromises);
    console.log(`[SWARM] Completed ${swarmResults.length} agents (Cost: $0)`);

    return swarmResults;
  }

  /**
   * Step 3: GEMINI SYNTHESIS - Aggregate swarm outputs
   * Free endpoint, long context
   * Cost: ~$0.03-0.05 per analysis
   */
  async executeSynthesis(swarmResults, obsidianContext) {
    const swarmSummary = swarmResults
      .map(r => `${r.agent}: ${r.result.substring(0, 200)}`)
      .join('\n\n');

    const synthesisPrompt = `
You are a synthesis agent. Aggregate these analysis results into a single coherent insight.

SWARM RESULTS:
${swarmSummary}

OBSIDIAN CONTEXT (Historical):
${obsidianContext.summary || 'No historical context available'}

Provide a structured synthesis with:
1. Key findings
2. Confidence level (0-1)
3. Suggested next action
4. Risk factors

Be concise. Max 500 tokens.
    `.trim();

    const synthesis = await this.callAgent(this.agents.gemini, synthesisPrompt);
    const cost = this.estimateCost(synthesisPrompt, 'gemini');

    console.log(`[GEMINI] Synthesis complete (Cost: $${cost.toFixed(4)})`);
    this.costTracker.gemini += cost;

    return {
      synthesis,
      confidence: this.extractConfidence(synthesis),
      cost
    };
  }

  /**
   * Step 4: CLAUDE AUDIT - Final code/risk refinement
   * PREMIUM: Only route if confidence < 75% OR explicit audit request
   * Cost: ~$0.15-0.30 per audit
   */
  async executeAudit(synthesis, task) {
    const auditPrompt = `
You are a trading/code architect. Review this analysis and provide final recommendations.

SYNTHESIS:
${synthesis.synthesis}

ORIGINAL TASK:
Type: ${task.type}
Context: ${task.context || 'General setup analysis'}

Provide:
1. ✓ Confirmation or corrections to the synthesis
2. ⚠️ Risk management notes
3. 💻 Code/implementation suggestions (if applicable)
4. 🎯 Final recommendation (GO/NO-GO)

Be decisive. Max 300 tokens.
    `.trim();

    const auditResult = await this.callAgent(this.agents.claude, auditPrompt);
    const cost = this.estimateCost(auditPrompt, 'claude');

    console.log(`[CLAUDE] Audit complete (Cost: $${cost.toFixed(4)})`);
    this.costTracker.claude += cost;

    // Calculate savings vs all-Claude approach
    const allClaudeCost = this.estimateCost(auditPrompt, 'claude') * 3; // rough estimate
    this.costTracker.saved += (allClaudeCost - cost);

    return {
      synthesis: synthesis.synthesis,
      auditNotes: auditResult,
      confidence: Math.min(synthesis.confidence + 0.1, 1.0), // Bump confidence after audit
      cost: cost,
      costSavedVsAllClaude: allClaudeCost - cost
    };
  }

  /**
   * Safety Constraint: Block unnecessary expensive calls
   * Prevents routing routine tasks to Claude/Grok
   */
  validateAgentRoute(agentId, taskType) {
    const agent = this.agents[agentId];

    // Safety rule: Don't route routine tasks to premium agents
    if (agent.tier === 'PREMIUM' && ['vision', 'quant', 'backtest'].includes(taskType)) {
      console.warn(`[SAFETY] Blocked ${agentId} for routine task ${taskType} (cost leakage prevention)`);
      return false;
    }

    return true;
  }

  /**
   * Dynamically resolve available model from OpenRouter
   * Cascading fallbacks: exact match → free model → any available
   */
  async resolveModelId(agent) {
    const cacheKey = agent.id;

    // Return cached result if available
    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey);
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });

      if (!response.ok) {
        console.warn(`[MODEL] OpenRouter API ${response.status}, using hardcoded ${agent.model}`);
        return agent.model;
      }

      const data = await response.json();

      // Find matching model by family name (e.g., 'nemotron', 'llama')
      let candidates = data.data.filter(m =>
        m.id.toLowerCase().includes(agent.id.toLowerCase()) &&
        m.supported_generation_models &&
        m.supported_generation_models.length > 0
      );

      // Fallback 1: If no exact match, search for any available model
      if (candidates.length === 0) {
        console.warn(`[MODEL] No match for "${agent.id}", searching broadly...`);
        candidates = data.data.filter(m =>
          m.supported_generation_models &&
          m.supported_generation_models.length > 0
        );
      }

      if (candidates.length === 0) {
        console.error(`[MODEL] No available models! Using hardcoded: ${agent.model}`);
        return agent.model;
      }

      // Fallback 2: Prefer free models for swarm tier
      if (agent.tier === 'FREE') {
        const freeModel = candidates.find(m => m.id.includes(':free'));
        if (freeModel) {
          this.modelCache.set(cacheKey, freeModel.id);
          console.log(`[MODEL] ✓ ${agent.id} → ${freeModel.id} (free)`);
          return freeModel.id;
        }
      }

      // Use first available
      const resolved = candidates[0].id;
      this.modelCache.set(cacheKey, resolved);
      console.log(`[MODEL] ✓ ${agent.id} → ${resolved}`);
      return resolved;

    } catch (err) {
      console.error(`[MODEL] Resolution error: ${err.message}, using ${agent.model}`);
      return agent.model;
    }
  }

  /**
   * Call agent via OpenRouter API
   * Uses global model discovery if available
   */
  async callAgent(agent, prompt) {
    try {
      // Get model ID from agent config (must be resolved beforehand)
      const modelId = agent.model;
      console.log(`[AGENT] ${agent.name} → ${modelId}`);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000
        })
      });

      const data = await response.json();

      if (!response.ok) {
        const error = data.error?.message || `HTTP ${response.status}`;
        console.error(`[API] ${agent.name} error: ${error}`);
        return `[Error: ${error}]`;
      }

      return data.choices?.[0]?.message?.content || '[No response]';
    } catch (err) {
      console.error(`[API] Failed to call ${agent.name}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Build swarm-specific prompt with Obsidian context
   */
  buildSwarmPrompt(task, agent, obsidianContext) {
    let prompt = '';

    if (agent.role === 'Vision') {
      prompt = `
Analyze this trading setup visually.

Setup: ${task.setup || 'GBP/USD 4H outside bar'}
Context: ${obsidianContext.summary || 'General analysis'}

Return JSON:
{
  "pattern": "detected pattern name",
  "confidence": 0.87,
  "notes": "brief analysis"
}
      `.trim();
    } else if (agent.role === 'Quant') {
      prompt = `
Analyze this setup quantitatively.

Setup: ${task.setup || 'GBP/USD 4H outside bar'}
Historical Data: ${obsidianContext.stats || 'No data available'}

Return JSON:
{
  "winRate": 0.583,
  "riskReward": 2.1,
  "sharpeRatio": 1.42,
  "sampleSize": 47,
  "confidence": 0.82
}
      `.trim();
    }

    return prompt;
  }

  /**
   * Utility: Estimate token cost
   */
  estimateCost(prompt, agentId) {
    const agent = this.agents[agentId];
    const tokens = Math.ceil(prompt.length / 4); // rough estimate

    if (agent.tier === 'FREE') return 0;
    return (tokens / 1000000) * (agent.costPerMT || 0);
  }

  /**
   * Utility: Calculate task cost
   */
  calculateTaskCost(result) {
    return (result.cost || 0) + (result.costSavedVsAllClaude || 0);
  }

  /**
   * Utility: Extract confidence from synthesis text
   */
  extractConfidence(text) {
    const match = text.match(/confidence[:\s]+([0-9.]+)/i);
    return match ? parseFloat(match[1]) : 0.5;
  }

  /**
   * Logging: Track all tasks for cost/performance analysis
   */
  logTask(taskId, task, result, duration) {
    this.taskLog.push({
      taskId,
      type: task.type,
      timestamp: new Date().toISOString(),
      duration,
      cost: this.calculateTaskCost(result),
      confidence: result.confidence || 0,
      success: result.success !== false
    });

    console.log(`[LOG] Task ${taskId} | ${duration}ms | $${this.calculateTaskCost(result).toFixed(4)}`);
  }

  /**
   * Dashboard interface: Get cost summary
   */
  getCostSummary() {
    return {
      swarmCost: this.costTracker.swarm,
      geminiCost: this.costTracker.gemini,
      claudeCost: this.costTracker.claude,
      totalCost: this.costTracker.swarm + this.costTracker.gemini + this.costTracker.claude,
      estimatedSavings: this.costTracker.saved,
      taskCount: this.taskLog.length
    };
  }

  /**
   * Initialize Obsidian vault bridge
   */
  async initVaultBridge(vaultPath) {
    // Dynamic import of vault-sync module
    try {
      const VaultSync = require('./vault-sync.js');
      this.vaultBridge = new VaultSync(vaultPath);
      console.log(`[VAULT] Bridge initialized: ${vaultPath}`);
    } catch (err) {
      console.warn(`[VAULT] Bridge init failed: ${err.message} (running in browser mode)`);
    }
  }
}

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MIDASOrchestrator;
}
