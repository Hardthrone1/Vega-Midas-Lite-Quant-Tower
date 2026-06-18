/**
 * MIDAS Gateway Server v1.0
 * Port 8001 | Express proxy for OpenRouter + Graphify + Vault writes
 *
 * Serves exactly what MIDAS_Orchestrator.js v1.5 expects:
 *   POST /api/v1/chat/completions  → OpenRouter proxy (callAgent)
 *   POST /api/graphify             → Topology logger (callGraphify)
 *   POST /api/vault/write          → Browser vault write (future v1.5.2)
 *   GET  /api/health               → Diagnostic
 *
 * Model registry mirrors this.agents in Orchestrator exactly.
 * Rate-limit handling mirrors the 5s cooldowns already in executeSwarm.
 */

'use strict';

const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
require('dotenv').config();

const app  = express();
const PORT = 8001;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const WORKSPACE      = process.env.WORKSPACE_PATH
                    || 'C:\\Users\\Softthrone\\Claude\\Dashboard';
const LOG_FILE       = path.join(WORKSPACE, 'dashboard.log');

// Models the Orchestrator actually uses — kept here for validation/logging.
// If Orchestrator sends a model not in this list, we pass it through anyway.
const KNOWN_MODELS = new Set([
  'meta-llama/llama-3.1-8b-instruct',             // qwen slot
  'nousresearch/hermes-3-llama-3.1-405b:free',    // nemotron
  'nex-agi/nex-n2-pro:free',                       // nex
  'google/gemma-4-31b-it:free',                    // gemini
  'anthropic/claude-haiku-4-5-20251001:free',      // claude
  'qwen/qwen3-next-80b-a3b-instruct:free',         // hermes (primary router)
  'meta-llama/llama-3.3-70b-instruct:free',        // qwen_fallback
  'openai/gpt-oss-120b',                           // gpt
]);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));

// Request logger — matches the style of Orchestrator console output
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${req.method} ${req.path}`;
  console.log(line);
  appendLog(line);
  next();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appendLog(line) {
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (_) {
    // Log write failure is non-fatal
  }
}

function isMissingKey() {
  return !OPENROUTER_KEY || OPENROUTER_KEY.trim() === '';
}

// Sandbox mock — returned when no API key is configured.
// Produces a minimal valid Pine Script so the Orchestrator's
// extractCodeGeneration() and validatePineScriptRules() still fire correctly.
function mockPineResponse(model) {
  return {
    choices: [{
      message: {
        role: 'assistant',
        content: [
          '```pinescript',
          '//@version=5',
          'strategy("MIDAS Sandbox", overlay=true, ',
          '         default_qty_type=strategy.percent_of_equity,',
          '         default_qty_value=1, commission_type=strategy.commission.percent,',
          '         commission_value=0.04, slippage=2)',
          '',
          '// ── SANDBOX MODE ─────────────────────────────────────────────────',
          '// No OPENROUTER_API_KEY found in .env',
          '// Add OPENROUTER_API_KEY=sk-or-... to Dashboard/.env and restart.',
          '// ─────────────────────────────────────────────────────────────────',
          '',
          'fastLen = input.int(9,  "Fast MA")',
          'slowLen = input.int(21, "Slow MA")',
          '',
          'fast = ta.ema(close, fastLen)',
          'slow = ta.ema(close, slowLen)',
          '',
          'longCond  = ta.crossover(fast, slow)  and barstate.isconfirmed',
          'shortCond = ta.crossunder(fast, slow) and barstate.isconfirmed',
          '',
          'if longCond',
          '    strategy.entry("Long", strategy.long)',
          '',
          'if shortCond',
          '    strategy.entry("Short", strategy.short)',
          '',
          'strategy.exit("Long TP/SL", "Long",',
          '    profit = close * 0.015 / syminfo.mintick,',
          '    loss   = close * 0.008 / syminfo.mintick)',
          '',
          'strategy.exit("Short TP/SL", "Short",',
          '    profit = close * 0.015 / syminfo.mintick,',
          '    loss   = close * 0.008 / syminfo.mintick)',
          '',
          'plot(fast, "Fast EMA", color.new(color.cyan,   0))',
          'plot(slow, "Slow EMA", color.new(color.orange, 0))',
          '```',
          '',
          `// [GATEWAY SANDBOX] Model requested: ${model}`,
          '// Add your OpenRouter key to .env to get real AI responses.',
        ].join('\n')
      }
    }],
    model,
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };
}

// ---------------------------------------------------------------------------
// Route 1: OpenRouter proxy
// POST /api/v1/chat/completions
// Called by: callAgent() in MIDAS_Orchestrator.js
// ---------------------------------------------------------------------------

app.post('/api/v1/chat/completions', async (req, res) => {
  const { model, messages, max_tokens, temperature } = req.body;

  if (!model || !messages) {
    return res.status(400).json({ error: { message: 'model and messages are required' } });
  }

  const knownFlag = KNOWN_MODELS.has(model) ? '' : ' [UNKNOWN MODEL]';
  console.log(`[GATEWAY] → ${model}${knownFlag}`);

  // Sandbox mode — no key
  if (isMissingKey()) {
    console.warn('[GATEWAY] ⚠  No OPENROUTER_API_KEY — returning sandbox mock.');
    return res.json(mockPineResponse(model));
  }

  // Live OpenRouter call
  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  'http://localhost:8001',
        'X-Title':       'MIDAS QuantLab',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens:  max_tokens  ?? 4000,
        temperature: temperature ?? 0.7,
      }),
      signal: AbortSignal.timeout(60_000),    // 60s hard timeout
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      const msg = data?.error?.message || `OpenRouter HTTP ${upstream.status}`;
      console.error(`[GATEWAY ✗] ${model} → ${msg}`);
      return res.status(upstream.status).json({ error: { message: msg } });
    }

    const preview = data?.choices?.[0]?.message?.content?.substring(0, 80) || '';
    console.log(`[GATEWAY ✓] ${model} → "${preview}..."`);
    appendLog(`[GATEWAY ✓] ${model} | ${upstream.status}`);

    return res.json(data);

  } catch (err) {
    const msg = err.name === 'TimeoutError'
      ? `Request to ${model} timed out after 60s`
      : err.message;
    console.error(`[GATEWAY ✗] ${model} → ${msg}`);
    return res.status(500).json({ error: { message: msg } });
  }
});

// ---------------------------------------------------------------------------
// Route 2: Graphify topology logger
// POST /api/graphify
// Called by: callGraphify() in MIDAS_Orchestrator.js
// Input:  { nodes: [{id, label, type}], edges: [{source, target}] }
// Output: { success, output, timestamp, topology }
// ---------------------------------------------------------------------------

app.post('/api/graphify', (req, res) => {
  const { nodes = [], edges = [] } = req.body;

  console.log(`[GRAPHIFY] nodes=${nodes.length} edges=${edges.length}`);

  try {
    // Build a readable execution trace matching what the Orchestrator logs
    const nodeMap  = Object.fromEntries(nodes.map(n => [n.id, n]));

    const trace = edges.map(e => {
      const src = nodeMap[e.source]?.label || e.source;
      const tgt = nodeMap[e.target]?.label || e.target;
      return `${src} → ${tgt}`;
    }).join(' | ');

    const summary = nodes
      .map(n => `[${(n.type || 'node').toUpperCase()}] ${n.label}`)
      .join(' ➔ ');

    // Build adjacency list for optional downstream rendering
    const topology = nodes.map(n => ({
      id:     n.id,
      label:  n.label,
      type:   n.type,
      edges:  edges
        .filter(e => e.source === n.id)
        .map(e => nodeMap[e.target]?.label || e.target)
    }));

    const ts = new Date().toISOString();
    appendLog(`[GRAPHIFY] ${trace}`);

    return res.json({
      success:   true,
      output:    `Topology: ${summary}`,
      trace,
      topology,
      timestamp: ts,
    });

  } catch (err) {
    console.error(`[GRAPHIFY ✗] ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Route 3: Browser vault write (v1.5.2 pre-wire)
// POST /api/vault/write
// Body: { filepath, content }
// This is the endpoint v1.5.1 deferred — wired now so the browser context
// can call it without a code change later.
// ---------------------------------------------------------------------------

app.post('/api/vault/write', (req, res) => {
  const { filepath, content } = req.body;

  if (!filepath || content === undefined) {
    return res.status(400).json({ success: false, error: 'filepath and content required' });
  }

  // Jail writes to the workspace — never let a caller escape to arbitrary paths
  const resolved = path.resolve(filepath);
  const jailRoot = path.resolve(WORKSPACE);

  if (!resolved.startsWith(jailRoot)) {
    console.warn(`[VAULT] ✗ Path escape attempt blocked: ${resolved}`);
    return res.status(403).json({ success: false, error: 'Path outside workspace' });
  }

  try {
    const dir = path.dirname(resolved);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, content, 'utf8');
    console.log(`[VAULT] ✓ Written: ${resolved} (${content.length} bytes)`);
    return res.json({ success: true, filepath: resolved, size: content.length });
  } catch (err) {
    console.error(`[VAULT] ✗ Write failed: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Route 4: Health check
// GET /api/health
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({
    status:      'ONLINE',
    gateway:     'MIDAS_GATEWAY_SERVER',
    version:     '1.0',
    port:        PORT,
    openrouter:  isMissingKey() ? 'SANDBOX (no key)' : 'LIVE',
    workspace:   WORKSPACE,
    timestamp:   new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Catch-all for unmatched routes
// ---------------------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({ error: `No route: ${req.method} ${req.path}` });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('================================================================');
  console.log('  MIDAS Gateway Server v1.0');
  console.log(`  http://127.0.0.1:${PORT}`);
  console.log('');
  console.log(`  OpenRouter: ${isMissingKey() ? '⚠  SANDBOX MODE (add key to .env)' : '✓  LIVE'}`);
  console.log(`  Workspace:  ${WORKSPACE}`);
  console.log('');
  console.log('  Routes:');
  console.log('    POST /api/v1/chat/completions  → OpenRouter proxy');
  console.log('    POST /api/graphify             → Topology logger');
  console.log('    POST /api/vault/write          → Browser vault write');
  console.log('    GET  /api/health               → Status');
  console.log('================================================================');
  console.log('');

  if (isMissingKey()) {
    console.warn('  ⚠  No OPENROUTER_API_KEY in .env');
    console.warn('     Gateway returns sandbox Pine Script until key is added.');
    console.warn('     Add to Dashboard/.env:');
    console.warn('       OPENROUTER_API_KEY=sk-or-v1-...');
    console.warn('');
  }
});
