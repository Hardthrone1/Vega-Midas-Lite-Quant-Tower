/**
 * Vega Gateway Server v1.4
 * Multi-Provider + Rate Limiting + Retry + Circuit Breaker + Tool Calling + Validation + Tracing + Prometheus
 */
'use strict';

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { RateLimiterMemory } = require('rate-limiter-flexible');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const client = require('prom-client');
const { createSwarmOrchestrator } = require('./swarm_orchestrator');

const app = express();
// Railway (and most PaaS) inject $PORT and route external traffic to it.
const PORT = process.env.PORT || 8001;
// Bind loopback locally (safe default), all interfaces when deployed —
// binding 127.0.0.1 in a container makes the service unreachable and the
// platform health check will crash-loop it.
const HOST = process.env.HOST || (process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : '127.0.0.1');
const GATEWAY_VERSION = '1.4';

// Shared-secret gate. When VEGA_API_KEY is set, every /api/* request must
// carry it as X-Vega-Key. Unset = open (local dev). CORS alone is no defence:
// it only constrains browsers, not curl.
const VEGA_API_KEY = process.env.VEGA_API_KEY || null;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const WORKSPACE = process.env.WORKSPACE_PATH || null;
const LOG_FILE = WORKSPACE ? path.join(WORKSPACE, 'dashboard.log') : null;

const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';

// Named NVIDIA slots — one API key per agent role for isolated usage/rate limits
const PROVIDERS = {
  nvidia_intake: {
    baseURL: NVIDIA_BASE_URL,
    apiKey: process.env.NVIDIA_KEY_INTAKE || '',
    defaultModel: process.env.NVIDIA_MODEL_INTAKE || 'qwen/qwen3.5-397b-a17b',
  },
  nvidia_pine: {
    baseURL: NVIDIA_BASE_URL,
    apiKey: process.env.NVIDIA_KEY_PINE || '',
    defaultModel: process.env.NVIDIA_MODEL_PINE || 'meta/llama-4-maverick-17b-128e-instruct',
  },
  nvidia_lint: {
    baseURL: NVIDIA_BASE_URL,
    apiKey: process.env.NVIDIA_KEY_LINT || '',
    defaultModel: process.env.NVIDIA_MODEL_LINT || 'meta/llama-3.1-8b-instruct',
  },
  nvidia_backtest: {
    baseURL: NVIDIA_BASE_URL,
    apiKey: process.env.NVIDIA_KEY_BACKTEST || '',
    defaultModel: process.env.NVIDIA_MODEL_BACKTEST || 'nvidia/nemotron-3-ultra-550b-a55b',
  },
  // Backward-compat alias → intake slot
  nvidia: {
    baseURL: NVIDIA_BASE_URL,
    apiKey: process.env.NVIDIA_KEY_INTAKE || process.env.NVIDIA_API_KEY || '',
    defaultModel: process.env.NVIDIA_MODEL_INTAKE || 'meta/llama-3.3-70b-instruct',
  },
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || '',
    defaultModel: process.env.OPENROUTER_MODEL_INTAKE || process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct',
  },
  gemini: {
    baseURL: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: process.env.GEMINI_API_KEY || '',
    defaultModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  },
  deepseek: {
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
  },
  grok: {
    baseURL: process.env.XAI_BASE_URL || process.env.GROK_BASE_URL || 'https://api.x.ai/v1',
    apiKey: process.env.XAI_API_KEY || process.env.GROK_API_KEY || '',
  },
};

const DEFAULT_PROVIDER = process.env.DEFAULT_PROVIDER || 'nvidia_intake';

// Explicit allow-list from env (comma-separated). When unset we fall back to a
// permissive localhost rule below so the dev frontend keeps working no matter
// which port Vite lands on (5173, 5174, 5175…).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Any http://localhost:<port> or http://127.0.0.1:<port> is treated as a local
// dev origin. This avoids CORS breakage when Vite bumps to the next free port.
const LOCALHOST_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function corsOrigin(origin, cb) {
  // Same-origin / curl / server-to-server requests have no Origin header.
  if (!origin) return cb(null, true);
  if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
  if (LOCALHOST_ORIGIN.test(origin)) return cb(null, true);
  return cb(new Error(`Origin not allowed by CORS: ${origin}`));
}

// ---------------------------------------------------------------------------
// Zod Tool Schemas
// ---------------------------------------------------------------------------
const SubmitStrategySpecSchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  session: z.object({
    sessionName: z.string(),
    timezone: z.string().optional(),
    tradeRTHOnly: z.boolean().optional(),
  }),
  riskProfile: z.enum(['conservative', 'balanced', 'aggressive']).optional(),
  executionMode: z.enum(['research', 'paper', 'live-ready']).optional(),
  entry: z.object({
    side: z.enum(['long', 'short', 'both']).optional(),
    orderType: z.enum(['market', 'limit', 'stop']).optional(),
    confirmOnBarClose: z.boolean().optional(),
    allowPyramiding: z.boolean().optional(),
    conditions: z.array(z.object({
      type: z.enum([
        'ema_crossover', 'session_filter', 'volume_spike',
        'rsi_oversold', 'rsi_overbought', 'atr_expansion',
        'htf_trend', 'breakout', 'custom',
      ]),
      parameters: z.record(z.unknown()),
      description: z.string().optional(),
    })).min(2).max(5).optional(),
  }).optional(),
});

// ---------------------------------------------------------------------------
// Prometheus Metrics
// ---------------------------------------------------------------------------
const register = new client.Registry();

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests handled by the gateway',
  labelNames: ['method', 'path', 'status', 'provider'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 120],
  registers: [register],
});

const gatewayToolCallsTotal = new client.Counter({
  name: 'gateway_tool_calls_total',
  help: 'Successful validated tool calls returned by the gateway',
  labelNames: ['tool', 'provider'],
  registers: [register],
});

// ---------------------------------------------------------------------------
// Rate Limiters + Circuit Breaker
// ---------------------------------------------------------------------------
const rateLimiters = {};
const circuitBreakers = {};

function getRateLimiter(provider) {
  if (!rateLimiters[provider]) {
    rateLimiters[provider] = new RateLimiterMemory({
      keyPrefix: `gateway_${provider}`,
      points: provider.startsWith('nvidia') ? 30 : 20,
      duration: 60,
    });
  }
  return rateLimiters[provider];
}

function getCircuitBreaker(provider) {
  if (!circuitBreakers[provider]) {
    circuitBreakers[provider] = {
      state: 'CLOSED',
      failures: 0,
      lastFailureTime: 0,
      threshold: 5,
      timeout: 30000,
    };
  }
  return circuitBreakers[provider];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getProviderConfig(provider = DEFAULT_PROVIDER) {
  const config = PROVIDERS[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);
  if (!config.apiKey) throw new Error(`Missing API key for provider: ${provider}`);
  return { ...config, name: provider };
}

function appendLog(line) {
  if (!LOG_FILE) return;
  try { fs.appendFileSync(LOG_FILE, line + '\n', 'utf8'); } catch (_) {}
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isCircuitOpen(provider) {
  const breaker = getCircuitBreaker(provider);
  if (breaker.state === 'OPEN') {
    if (Date.now() - breaker.lastFailureTime > breaker.timeout) {
      breaker.state = 'HALF_OPEN';
      return false;
    }
    return true;
  }
  return false;
}

function recordFailure(provider) {
  const breaker = getCircuitBreaker(provider);
  breaker.failures++;
  breaker.lastFailureTime = Date.now();
  if (breaker.failures >= breaker.threshold) {
    breaker.state = 'OPEN';
    console.warn(`[CIRCUIT BREAKER] ${provider} is now OPEN`);
  }
}

function recordSuccess(provider) {
  const breaker = getCircuitBreaker(provider);
  breaker.failures = 0;
  breaker.state = 'CLOSED';
}

/** NVIDIA integrate model IDs → OpenRouter slugs (fallback chain only). */
const NVIDIA_TO_OPENROUTER_MODEL = {
  'meta/llama-3.3-70b-instruct': process.env.OPENROUTER_MODEL_INTAKE || 'meta-llama/llama-3.3-70b-instruct',
  'meta/llama-4-maverick-17b-128e-instruct': process.env.OPENROUTER_MODEL_PINE || 'meta-llama/llama-4-maverick',
  'meta/llama-3.1-8b-instruct': process.env.OPENROUTER_MODEL_LINT || 'meta-llama/llama-3.1-8b-instruct',
  'nvidia/nemotron-3-ultra-550b-a55b': process.env.OPENROUTER_MODEL_BACKTEST || 'meta-llama/llama-3.3-70b-instruct',
};

function resolveModelForProvider(providerName, requestedModel, providerConfig) {
  if (providerName === 'openrouter') {
    if (requestedModel && NVIDIA_TO_OPENROUTER_MODEL[requestedModel]) {
      return NVIDIA_TO_OPENROUTER_MODEL[requestedModel];
    }
    if (requestedModel && /^meta\/llama-/.test(requestedModel)) {
      return providerConfig.defaultModel || 'meta-llama/llama-3.3-70b-instruct';
    }
    return requestedModel || providerConfig.defaultModel || 'meta-llama/llama-3.3-70b-instruct';
  }

  if (providerName.startsWith('nvidia')) {
    return requestedModel || providerConfig.defaultModel;
  }

  return requestedModel || providerConfig.defaultModel;
}

const CONDITION_TYPES = new Set([
  'ema_crossover', 'session_filter', 'volume_spike',
  'rsi_oversold', 'rsi_overbought', 'atr_expansion',
  'htf_trend', 'breakout', 'custom',
]);

const DEFAULT_CONDITION_PARAMETERS = {
  ema_crossover: { fastLength: 9, slowLength: 21 },
  session_filter: { sessionName: 'NY Open' },
  volume_spike: { threshold: 2, lookback: 20 },
  rsi_oversold: { length: 14, threshold: 30 },
  rsi_overbought: { length: 14, threshold: 70 },
  atr_expansion: { atrLength: 14, multiplier: 1.5 },
  htf_trend: { timeframe: '1h', emaLength: 50 },
  breakout: { lookback: 20 },
  custom: {},
};

function normalizeTypeSlug(raw) {
  return String(raw ?? 'custom')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function coerceConditionType(raw) {
  const slug = normalizeTypeSlug(raw);
  if (CONDITION_TYPES.has(slug)) return slug;

  const firstToken = slug.match(/^([a-z_]+)/)?.[1];
  if (firstToken && CONDITION_TYPES.has(firstToken)) return firstToken;

  return 'custom';
}

function parseParametersFromExpression(expression) {
  const inner = expression.match(/\(([^)]*)\)/)?.[1]?.trim();
  if (!inner) return {};

  const params = {};
  for (const part of inner.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const rawValue = part.slice(eq + 1).trim();
    try {
      params[key] = JSON.parse(rawValue);
    } catch {
      const numeric = Number(rawValue);
      params[key] = Number.isFinite(numeric) ? numeric : rawValue.replace(/^["']|["']$/g, '');
    }
  }
  return params;
}

function normalizeConditionParameters(type, parameters) {
  const p = { ...parameters };
  if (type === 'volume_spike' && p.multiplier != null && p.threshold == null) {
    p.threshold = p.multiplier;
  }
  return p;
}

function extractRepairedType(raw) {
  if (typeof raw.expression === 'string' && raw.expression.trim()) {
    const match = raw.expression.trim().match(/^([a-zA-Z_]+)/);
    if (match) return match[1];
  }
  if (typeof raw.description === 'string' && raw.description.trim()) {
    return raw.description.trim().toLowerCase().replace(/\s+/g, '_');
  }
  if (typeof raw.type === 'string' && raw.type.trim()) return raw.type.trim();
  return 'custom';
}

function normalizeCondition(raw, index = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      type: 'custom',
      parameters: { ...DEFAULT_CONDITION_PARAMETERS.custom },
      description: `Condition ${index + 1}`,
    };
  }

  if (
    raw.type &&
    raw.parameters &&
    typeof raw.parameters === 'object' &&
    !Array.isArray(raw.parameters)
  ) {
    const type = coerceConditionType(raw.type);
    const rawParams = raw.parameters;
    const parameters = normalizeConditionParameters(
      type,
      Object.keys(rawParams).length > 0 ? { ...rawParams } : { ...DEFAULT_CONDITION_PARAMETERS[type] }
    );
    return {
      type,
      parameters,
      description: typeof raw.description === 'string' && raw.description.trim()
        ? raw.description.trim()
        : type,
    };
  }

  const rawType = extractRepairedType(raw);
  const type = coerceConditionType(rawType);

  let parameters = {};
  if (raw.parameters && typeof raw.parameters === 'object' && !Array.isArray(raw.parameters)) {
    parameters = { ...raw.parameters };
  } else if (typeof raw.expression === 'string') {
    parameters = parseParametersFromExpression(raw.expression);
  } else if (raw.expression && typeof raw.expression === 'object' && !Array.isArray(raw.expression)) {
    parameters = { ...raw.expression };
  }

  if (Object.keys(parameters).length === 0) {
    parameters = { ...DEFAULT_CONDITION_PARAMETERS[type] };
  }

  parameters = normalizeConditionParameters(type, parameters);

  const descriptionText = (
    typeof raw.description === 'string' ? raw.description : type
  ).trim();

  return {
    type,
    parameters,
    description: descriptionText.length > 0 ? descriptionText : type,
  };
}

/**
 * Validate submit_strategy_spec tool arguments against SubmitStrategySpecSchema.
 * Normalizes conditions server-side, then writes cleaned args back onto the tool call.
 * Returns { ok: true } for non-matching tools or valid args; { ok: false, ... } on failure.
 */
function validateSubmitStrategySpec(toolCall) {
  if (toolCall.function.name !== 'submit_strategy_spec') {
    return { ok: true };
  }

  let args;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch {
    return { ok: false, message: 'Tool arguments are not valid JSON' };
  }

  // Normalize conditions regardless of what the model returned
  if (args.entry?.conditions) {
    args.entry.conditions = args.entry.conditions.map((cond, index) => normalizeCondition(cond, index));
  }

  const result = SubmitStrategySpecSchema.safeParse(args);
  if (!result.success) {
    return {
      ok: false,
      message: 'Tool arguments failed validation',
      details: result.error.flatten(),
    };
  }

  // Replace the tool call arguments with the normalized version
  toolCall.function.arguments = JSON.stringify(args);

  return { ok: true, tool: 'submit_strategy_spec' };
}

// ---------------------------------------------------------------------------
// Core Request Function
// ---------------------------------------------------------------------------
async function callProvider(providerConfig, body, maxAttempts = 4) {
  if (isCircuitOpen(providerConfig.name)) {
    throw new Error(`Circuit breaker is OPEN for ${providerConfig.name}`);
  }

  const limiter = getRateLimiter(providerConfig.name);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await limiter.consume('global');
    } catch (rlRes) {
      await sleep(rlRes.msBeforeNext ?? 1000);
      continue;
    }

    try {
      const res = await fetch(`${providerConfig.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${providerConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });

      const data = await res.json();

      if (res.status === 429) {
        recordFailure(providerConfig.name);
        const retryAfter = parseInt(res.headers.get('retry-after')) || (2 ** attempt) * 1000;
        await sleep(retryAfter);
        continue;
      }

      if (!res.ok) {
        recordFailure(providerConfig.name);
        throw new Error(data?.error?.message || `HTTP ${res.status}`);
      }

      recordSuccess(providerConfig.name);
      return data;

    } catch (err) {
      if (attempt === maxAttempts - 1) {
        recordFailure(providerConfig.name);
        throw err;
      }
      await sleep((2 ** attempt) * 700);
    }
  }
}

// ---------------------------------------------------------------------------
// Middleware (with Tracing)
// ---------------------------------------------------------------------------
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '2mb' }));

// Shared-secret gate on /api/* (except health, so platform probes still pass).
// Timing-safe compare; no-op when VEGA_API_KEY is unset (local dev).
app.use('/api', (req, res, next) => {
  if (!VEGA_API_KEY) return next();
  if (req.path === '/health') return next();
  if (req.method === 'OPTIONS') return next();          // CORS preflight
  const supplied = req.get('X-Vega-Key') || '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(VEGA_API_KEY);
  const ok = a.length === b.length && require('crypto').timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: { message: 'Unauthorized: bad or missing X-Vega-Key' } });
  next();
});

app.use((req, res, next) => {
  req.requestId = uuidv4();
  const startTime = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const durationSec = durationMs / 1000;
    const activeProvider = req.body?.provider || DEFAULT_PROVIDER;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
      provider: activeProvider,
    }));
    appendLog(`[${req.requestId}] ${req.method} ${req.path} ${res.statusCode} ${durationMs}ms`);

    // Record Prometheus metrics (skip /metrics to avoid self-scrape noise)
    if (req.path !== '/metrics') {
      httpRequestsTotal.inc({
        method: req.method,
        path: req.path,
        status: String(res.statusCode),
        provider: activeProvider,
      });
      httpRequestDuration.observe({ method: req.method, path: req.path }, durationSec);
    }
  });

  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.post('/api/v1/chat/completions', async (req, res) => {
  const { model, messages, max_tokens, temperature, provider, tools, tool_choice } = req.body;

  if (!messages) {
    return res.status(400).json({ error: { message: 'messages are required' } });
  }

  try {
    const activeProvider = provider || DEFAULT_PROVIDER;
    const providerConfig = getProviderConfig(activeProvider);
    const resolvedModel = resolveModelForProvider(activeProvider, model, providerConfig);

    if (!resolvedModel) {
      return res.status(400).json({ error: { message: 'model is required (or set a provider defaultModel)' } });
    }

    const requestBody = {
      messages,
      max_tokens: max_tokens ?? 8192,
      temperature: temperature ?? 0.7,
    };

    if (tools) requestBody.tools = tools;
    if (tool_choice) requestBody.tool_choice = tool_choice;

    const fallbackChain = Array.from(new Set([activeProvider, 'openrouter']));
    let data;
    for (let i = 0; i < fallbackChain.length; i++) {
      const p = fallbackChain[i];
      const isLast = i === fallbackChain.length - 1;
      const chainConfig = getProviderConfig(p);
      const bodyForProvider = {
        ...requestBody,
        model: resolveModelForProvider(p, model || resolvedModel, chainConfig),
      };
      try {
        data = await callProvider(chainConfig, bodyForProvider);
        break;
      } catch (err) {
        if (isLast) throw err;
        console.warn(`[FALLBACK] ${p} failed (${err.message}), trying next provider`);
      }
    }

    // Backend Zod validation for submit_strategy_spec tool calls
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall) {
      const validation = validateSubmitStrategySpec(toolCall);
      if (!validation.ok) {
        console.error(JSON.stringify({
          event: 'tool_validation_failed',
          requestId: req.requestId,
          tool: toolCall.function.name,
          message: validation.message,
          details: validation.details ?? null,
        }));
        return res.status(400).json({
          error: {
            message: validation.message,
            ...(validation.details ? { details: validation.details } : {}),
          },
        });
      }

      if (validation.tool === 'submit_strategy_spec') {
        console.log(JSON.stringify({
          event: 'tool_call',
          requestId: req.requestId,
          tool: 'submit_strategy_spec',
          provider: activeProvider,
        }));
        gatewayToolCallsTotal.inc({ tool: 'submit_strategy_spec', provider: activeProvider });
      }
    }

    return res.json(data);

  } catch (err) {
    console.error(`[GATEWAY ✗] [${req.requestId}] ${err.message}`);
    return res.status(500).json({ error: { message: err.message } });
  }
});

app.post('/api/vision', async (_req, res) => {
  res.status(501).json({ error: 'Vision route not yet implemented with tools' });
});

// ---------------------------------------------------------------------------
// Multi-agent swarm — fan-out → synthesis → audit (see swarm_orchestrator.js).
// Runs inside the gateway so every agent call reuses the same rate limiting,
// circuit breakers and retries as a normal chat request.
// ---------------------------------------------------------------------------
const swarm = createSwarmOrchestrator({
  callProvider,
  getProviderConfig,
  resolveModelForProvider,
  log: (msg) => console.log(msg),
});

app.post('/api/swarm', async (req, res) => {
  const task = req.body?.task || {};
  if (!task.setup && !task.context && !task.symbol) {
    return res.status(400).json({
      error: { message: 'task must include at least one of: setup, context, symbol' },
    });
  }
  try {
    const result = await swarm.runSwarm(task, { agents: req.body?.agents });
    result.swarmResults?.forEach((r) => {
      gatewayToolCallsTotal.inc({ tool: `swarm_${r.lane}`, provider: 'swarm' });
    });
    res.json(result);
  } catch (err) {
    console.error(`[SWARM] failed: ${err.message}`);
    res.status(500).json({ error: { message: err.message } });
  }
});

app.get('/api/providers', (_req, res) => {
  const list = Object.keys(PROVIDERS).map(name => ({
    name,
    configured: !!PROVIDERS[name].apiKey,
    isDefault: name === DEFAULT_PROVIDER,
    defaultModel: PROVIDERS[name].defaultModel ?? null,
  }));
  res.json({ default: DEFAULT_PROVIDER, providers: list });
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ONLINE',
    version: GATEWAY_VERSION,
    activeProvider: DEFAULT_PROVIDER,
    circuitState: getCircuitBreaker(DEFAULT_PROVIDER).state,
    timestamp: new Date().toISOString(),
  });
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Static dashboard — serve the built SPA from the same origin as the API, so a
// single-service deploy needs no cross-origin config at all. Mounted last so
// every /api route above wins; the fallback only catches non-API GETs.
// ---------------------------------------------------------------------------
const DIST_DIR = path.join(__dirname, 'midas_code', 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
  console.log(`[gateway] serving dashboard from ${DIST_DIR}`);
} else {
  console.log('[gateway] no midas_code/dist — API only (run: npm run build)');
}

app.listen(PORT, HOST, () => {
  console.log(`\n=== Vega Gateway Server v${GATEWAY_VERSION} ===`);
  console.log(`Default Provider : ${DEFAULT_PROVIDER}`);
  console.log(`Auth             : ${VEGA_API_KEY ? 'X-Vega-Key required' : 'OPEN (set VEGA_API_KEY to lock down)'}`);
  console.log(`http://${HOST}:${PORT}`);
  console.log(`Rate limiting + Retry + Circuit Breaker + Tracing + Prometheus enabled\n`);
});
