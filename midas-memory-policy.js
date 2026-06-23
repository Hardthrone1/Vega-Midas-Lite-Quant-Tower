/**
 * midas-memory-policy.js
 * --------------------------------------------------------------------------
 * Memory-conditioned prompt policy for the MIDAS swarm.
 *
 * Reads the SAME Obsidian vault the orchestrator writes to, computes aggregate
 * audit statistics (per-agent reliability, per-strategy realised performance),
 * and produces a conditioning block that gets appended to swarm prompts.
 *
 * Node/CLI only (uses fs + js-yaml). If js-yaml is missing or the vault is
 * empty, every public method degrades to a no-op so it can NEVER destabilise
 * the live prompt path ... same philosophy as the orchestrator's vault bridge
 * going null in the browser.
 * --------------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');

let yaml = null;
try { yaml = require('js-yaml'); }
catch (_) { /* not installed -> index stays empty, policy no-ops */ }

// Tunables ------------------------------------------------------------------
const MIN_AGENT_SAMPLES = 5;   // don't report a hallucination rate below this n (kills n=1 noise)
const VIABLE_PF        = 1.5;  // adjusted/"reality" PF at/above which a strategy is "viable"

function safeNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

class MidasMemoryIndex {
  constructor(vaultPath) {
    this.vaultPath = vaultPath;
    this.index = [];
    this.available = !!yaml;          // false when js-yaml is not installed
  }

  buildIndex() {
    this.index = [];
    if (!yaml) {
      console.warn('[POLICY] js-yaml not installed ... memory conditioning disabled (npm install js-yaml).');
      return this;
    }
    try {
      if (!fs.existsSync(this.vaultPath)) fs.mkdirSync(this.vaultPath, { recursive: true });
      const files = this._walk(this.vaultPath); // recurse subfolders (Setups/, Validation/, etc.)
      for (const file of files) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          const m = content.match(/^---\n([\s\S]*?)\n---/);
          if (!m) continue;
          const fm = yaml.load(m[1]);
          if (fm && typeof fm === 'object') this.index.push(fm);
        } catch (e) {
          console.warn(`[POLICY] Skipped unreadable audit ${path.basename(file)}: ${e.message}`);
        }
      }
      console.log(`[POLICY] Memory index built ... ${this.index.length} audits parsed (recursive).`);
    } catch (e) {
      console.warn('[POLICY] buildIndex failed:', e.message);
    }
    return this;
  }

  /** Recursively collect every .md file under dir (mirrors vault-sync walkDirectory). */
  _walk(dir) {
    const out = [];
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (e) { console.warn(`[POLICY] Failed to read ${dir}: ${e.message}`); return out; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...this._walk(full));
      else if (entry.name.endsWith('.md')) out.push(full);
    }
    return out;
  }

  /**
   * Reliability of an agent. Of the audits where it voted PASS, how many were
   * later exposed as toxic (reality/adjusted PF < 1.0)?
   * Returns { reportable:false } until there are at least MIN_AGENT_SAMPLES
   * passes, so a single data point can't masquerade as a "100%" rate.
   */
  getAgentStats(agentName) {
    if (!agentName) return null;
    const key = `${String(agentName).toLowerCase()}_verdict`;
    const passes = this.index.filter(m => String(m[key]).toUpperCase() === 'PASS');
    if (passes.length < MIN_AGENT_SAMPLES) {
      return { totalPasses: passes.length, reportable: false };
    }
    let toxic = 0;
    for (const m of passes) {
      const adj = safeNumber(m.adjusted_pf);
      if (adj !== null && adj < 1.0) toxic++;
    }
    return {
      totalPasses: passes.length,
      reportable: true,
      failRate: ((toxic / passes.length) * 100).toFixed(1)
    };
  }

  /**
   * Realised history for a single strategy tag. A vault strategy_tag matches the
   * requested tag when either contains the other (case-insensitive), so a task
   * tag like 'rsi' resolves against a vault tag like 'rsi_breakout'.
   */
  getStrategyContext(strategyTag) {
    if (!strategyTag) return null;
    const tag = String(strategyTag).toLowerCase();
    const matches = this.index.filter(m =>
      Array.isArray(m.strategy_tags) &&
      m.strategy_tags.some(t => {
        const s = String(t).toLowerCase();
        return s === tag || s.includes(tag) || tag.includes(s);
      })
    );
    if (matches.length === 0) return null;

    let sumAdj = 0, nAdj = 0, traps = 0;
    for (const m of matches) {
      const adj = safeNumber(m.adjusted_pf);
      if (adj !== null) { sumAdj += adj; nAdj++; }
      traps += safeNumber(m.ambiguous_traps) || 0;
    }
    const avgAdj = nAdj > 0 ? sumAdj / nAdj : null;
    return {
      historicalAttempts: matches.length,
      avgAdjustedPF: avgAdj === null ? null : avgAdj.toFixed(2),
      totalTrapsCaught: traps,
      historicallyViable: avgAdj !== null && avgAdj >= VIABLE_PF
    };
  }

  /** First task tag that has any vault history. */
  resolveStrategy(tags) {
    if (!Array.isArray(tags)) return null;
    for (const t of tags) {
      const ctx = this.getStrategyContext(t);
      if (ctx) return { tag: t, ctx };
    }
    return null;
  }

  /**
   * RAM Hot-Update — write a fresh audit straight into the in-memory index,
   * bypassing disk I/O. Stores the FULL frontmatter object (same shape as
   * buildIndex pushes) so live records stay visible to getAgentStats AND
   * getStrategyContext alike. De-dupes on task_id.
   */
  hotInject(auditData) {
    if (!auditData || !auditData.task_id) {
      console.warn('[POLICY] Abandoning hot-inject: missing task_id.');
      return false;
    }
    // Remove any prior version of this task to prevent duplicates.
    this.index = this.index.filter(m => m.task_id !== auditData.task_id);

    // Preserve every field (verdicts, tags, original_pf, ambiguous_traps, ...);
    // only normalise the numeric fields the analytics actually rely on, using
    // the same safeNumber the disk path uses so a bad value becomes null
    // (excluded from averages) rather than silently collapsing to 0.
    const record = { ...auditData };
    record.adjusted_pf = safeNumber(auditData.adjusted_pf);
    if ('original_pf' in auditData)     record.original_pf     = safeNumber(auditData.original_pf);
    if ('ambiguous_traps' in auditData) record.ambiguous_traps = safeNumber(auditData.ambiguous_traps);
    record.strategy_tags = Array.isArray(auditData.strategy_tags) ? auditData.strategy_tags : [];

    this.index.push(record);
    console.log(`[POLICY] Hot-update: ${auditData.task_id} injected into RAM index (${this.index.length} total). Disk scan bypassed.`);
    return true;
  }

  /** Spec-compat alias: any caller using .addRecord() routes to hotInject. */
  addRecord(auditData) {
    return this.hotInject(auditData);
  }
}

class PromptPolicy {
  /**
   * Conditioning block appended to a swarm agent's prompt. Returns '' (no-op)
   * when nothing is reportable, so prompts are unchanged until the vault holds
   * relevant, sufficient history.
   */
  static buildMemoryBriefing(agentName, tags, indexer) {
    if (!indexer || !indexer.available || indexer.index.length === 0) return '';

    const lines = [];

    const stats = indexer.getAgentStats(agentName);
    if (stats && stats.reportable) {
      lines.push(`* AGENT ALIGNMENT: Your historical PASS-on-toxic rate is ${stats.failRate}% (n=${stats.totalPasses}). Tighten your technical threshold accordingly.`);
    }

    const resolved = indexer.resolveStrategy(tags);
    if (resolved) {
      const c = resolved.ctx;
      const pf = c.avgAdjustedPF === null ? 'n/a' : c.avgAdjustedPF;
      lines.push(`* STRATEGY HISTORY: '${resolved.tag}' variants run ${c.historicalAttempts}x. True (reality) PF: ${pf}. Intra-bar traps hit: ${c.totalTrapsCaught}.`);
      if (c.historicallyViable) {
        lines.push(`* REINFORCEMENT: this footprint has held up under execution friction. Treat the core edge as sound; focus optimization on robustness and scaling, not re-deriving the signal.`);
      } else {
        lines.push(`* CRITICAL: this footprint routinely collapses under execution friction. Reject generic variations unless a concrete structural breakout edge is proven.`);
      }
    }

    if (lines.length === 0) return '';
    return `\n\n[MIDAS MEMORY CONDITIONING]\n${lines.join('\n')}\n[END CONDITIONING]\n`;
  }
}

module.exports = { MidasMemoryIndex, PromptPolicy, MIN_AGENT_SAMPLES, VIABLE_PF };
