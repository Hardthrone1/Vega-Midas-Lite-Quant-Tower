// ════════════════════════════════════════════════════════════════════════
// MIDAS_Bridge_Route.js  ·  v1.0
//
// Thin HTTP bridge between the MIDAS dashboard (browser) and the
// tradingview-mcp CLI (which drives TradingView Desktop over CDP / port 9222).
//
// WHY THIS EXISTS
//   The dashboard is a browser page and cannot call MCP/stdio tools directly.
//   This router exposes a SMALL, FIXED set of HTTP endpoints that shell out to
//   the `tv` CLI (JSON-out, exit-code clean) and return the parsed JSON.
//
// HOW IT MOUNTS  (no second server, no extra window)
//   In MIDAS_Gateway_Server.js, after `const app = express();`:
//
//       const { mountBridgeRoutes } = require('./MIDAS_Bridge_Route.js');
//       mountBridgeRoutes(app);
//
//   Everything stays on Port 8001 alongside the existing Gateway routes.
//
// SECURITY
//   - Only a fixed allow-list of CLI commands can run. No arbitrary passthrough.
//   - Pine source is written to a temp file (never interpolated into a shell
//     string), so code with quotes/newlines/`$()` cannot inject anything.
//   - child_process.execFile (not exec) — no shell, no glob, no injection.
// ════════════════════════════════════════════════════════════════════════

'use strict';

const { execFile }   = require('child_process');
const fs             = require('fs');
const os             = require('os');
const path           = require('path');

// ── CONFIG ──────────────────────────────────────────────────────────────
// Point this at the tradingview-mcp checkout on the VPS.
const TV_MCP_DIR = process.env.TV_MCP_DIR
  || 'C:\\Users\\Softthrone\\3D Objects\\TradingTools\\tradingview-mcp-jackson';

const TV_CLI     = path.join(TV_MCP_DIR, 'src', 'cli', 'index.js');
const NODE_BIN   = process.execPath;                 // same node running the Gateway
const CLI_TIMEOUT_MS = 60000;                         // hard ceiling per CLI call

// ── CLI RUNNER ──────────────────────────────────────────────────────────
// Runs `node <TV_CLI> <args...>`, returns parsed JSON stdout.
// Never uses a shell. Never interpolates user input into a command string.
function runCli(args) {
  return new Promise((resolve) => {
    execFile(NODE_BIN, [TV_CLI, ...args], {
      cwd: TV_MCP_DIR,
      timeout: CLI_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 12 * 1024 * 1024,   // strategy trade lists can be large
    }, (err, stdout, stderr) => {
      // The CLI prints JSON to stdout even on tool-level failure.
      // Exit code 2 = CDP connection failure (TradingView not reachable).
      let parsed = null;
      const out = (stdout || '').trim();
      if (out) { try { parsed = JSON.parse(out); } catch { /* not json */ } }

      if (parsed !== null) {
        resolve({ ok: true, data: parsed });
        return;
      }
      // No parseable JSON — surface a clean error.
      const code = err && typeof err.code !== 'undefined' ? err.code : 'unknown';
      let reason = (stderr || '').trim() || (err && err.message) || 'No output from CLI';
      if (code === 2)        reason = 'TradingView Desktop not reachable on CDP port 9222. Run Start-TradingAI.bat first.';
      else if (code === 'ENOENT') reason = `tv CLI not found at ${TV_CLI}. Check TV_MCP_DIR.`;
      else if (err && err.killed) reason = `CLI timed out after ${CLI_TIMEOUT_MS / 1000}s.`;
      resolve({ ok: false, error: reason, exitCode: code });
    });
  });
}

// Write Pine source to a temp file so it is NEVER part of a command string.
function withTempPine(source, fn) {
  const file = path.join(os.tmpdir(), `midas_pine_${Date.now()}_${Math.random().toString(36).slice(2)}.pine`);
  fs.writeFileSync(file, source, 'utf-8');
  return Promise.resolve(fn(file)).finally(() => {
    try { fs.unlinkSync(file); } catch { /* best effort */ }
  });
}

// ── ROUTE MOUNTING ──────────────────────────────────────────────────────
function mountBridgeRoutes(app) {
  // express.json() is already applied by the Gateway; we assume req.body parsed.

  // Health: is the bridge reachable, is TradingView connected?
  app.get('/api/bridge/health', async (_req, res) => {
    const r = await runCli(['status']);
    res.status(r.ok ? 200 : 503).json(r);
  });

  // Current chart state (symbol, timeframe, type, indicators)
  app.get('/api/bridge/chart/state', async (_req, res) => {
    const r = await runCli(['state']);
    res.status(r.ok ? 200 : 503).json(r);
  });

  // Set symbol  { "symbol": "OANDA:XAUUSD" }
  app.post('/api/bridge/chart/symbol', async (req, res) => {
    const symbol = (req.body && req.body.symbol || '').toString().trim();
    if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });
    const r = await runCli(['symbol', symbol]);
    res.status(r.ok ? 200 : 503).json(r);
  });

  // Set timeframe  { "timeframe": "15" }
  app.post('/api/bridge/chart/timeframe', async (req, res) => {
    const tf = (req.body && req.body.timeframe || '').toString().trim();
    if (!tf) return res.status(400).json({ ok: false, error: 'timeframe required' });
    const r = await runCli(['timeframe', tf]);
    res.status(r.ok ? 200 : 503).json(r);
  });

  // Server-side compile check (no chart needed)  { "source": "//@version=5 ..." }
  app.post('/api/bridge/pine/check', async (req, res) => {
    const source = (req.body && req.body.source || '').toString();
    if (!source.trim()) return res.status(400).json({ ok: false, error: 'source required' });
    const r = await withTempPine(source, (file) => runCli(['pine', 'check', '--file', file]));
    res.status(r.ok ? 200 : 503).json(r);
  });

  // Inject source into the live Pine editor  { "source": "..." }
  app.post('/api/bridge/pine/set', async (req, res) => {
    const source = (req.body && req.body.source || '').toString();
    if (!source.trim()) return res.status(400).json({ ok: false, error: 'source required' });
    const r = await withTempPine(source, (file) => runCli(['pine', 'set', '--file', file]));
    res.status(r.ok ? 200 : 503).json(r);
  });

  // Smart compile the script currently in the editor (detect button, check errors)
  app.post('/api/bridge/pine/compile', async (_req, res) => {
    const r = await runCli(['pine', 'compile']);
    res.status(r.ok ? 200 : 503).json(r);
  });

  // Get current compile errors
  app.get('/api/bridge/pine/errors', async (_req, res) => {
    const r = await runCli(['pine', 'errors']);
    res.status(r.ok ? 200 : 503).json(r);
  });

  // Real executed trades from Strategy Tester
  app.get('/api/bridge/data/trades', async (_req, res) => {
    const r = await runCli(['trades']);
    res.status(r.ok ? 200 : 503).json(r);
  });

  // Real strategy performance metrics
  app.get('/api/bridge/data/strategy', async (_req, res) => {
    const r = await runCli(['strategy']);
    res.status(r.ok ? 200 : 503).json(r);
  });

  // ── FULL VALIDATION LOOP ────────────────────────────────────────────
  // One call: inject → compile → check errors → pull real trades + metrics.
  // Body: { "source": "//@version=5 ..." }
  // This is the high-value endpoint: real fills, not LLM-guessed signals.
  app.post('/api/bridge/validate', async (req, res) => {
    const source = (req.body && req.body.source || '').toString();
    if (!source.trim()) return res.status(400).json({ ok: false, error: 'source required' });

    const result = { ok: true, steps: {} };

    // 1. Inject
    const set = await withTempPine(source, (file) => runCli(['pine', 'set', '--file', file]));
    result.steps.set = set;
    if (!set.ok) return res.status(503).json({ ...result, ok: false, failedAt: 'set' });

    // 2. Compile
    const compile = await runCli(['pine', 'compile']);
    result.steps.compile = compile;

    // 3. Errors (always read, even if compile reports ok)
    const errors = await runCli(['pine', 'errors']);
    result.steps.errors = errors;

    // If compile produced errors, stop here — do NOT report trades from a stale run.
    const hasErrors = errors.ok
      && errors.data
      && Array.isArray(errors.data.errors)
      && errors.data.errors.length > 0;
    if (hasErrors) {
      return res.status(200).json({ ...result, ok: false, failedAt: 'compile', compileErrors: errors.data.errors });
    }

    // 4. Real trades + metrics
    result.steps.trades   = await runCli(['trades']);
    result.steps.strategy = await runCli(['strategy']);

    res.status(200).json(result);
  });

  console.log('[MIDAS Bridge] Routes mounted · /api/bridge/* · CLI:', TV_CLI);
}

module.exports = { mountBridgeRoutes };
