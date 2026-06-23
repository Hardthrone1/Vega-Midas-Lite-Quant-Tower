/**
 * MIDAS Secure Key Proxy - Express Version
 *
 * This server:
 * 1. Accepts POST requests from your dashboard (port 8000)
 * 2. Injects your API key securely (not exposed to browser)
 * 3. Forwards to OpenRouter
 * 4. Returns results to dashboard
 *
 * Run: node midas-proxy.js
 */

const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = 8001;
const API_KEY = process.env.OPENROUTER_API_KEY || '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';

// Global CORS fallback
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

console.log('[PROXY] ═════════════════════════════════════');
console.log('[PROXY] MIDAS Secure Key Proxy (Express)');
console.log('[PROXY] ═════════════════════════════════════');
console.log(`[PROXY] Port: http://localhost:${PORT}`);
console.log(`[PROXY] API Key: ${API_KEY.substring(0, 30)}...`);
console.log('[PROXY] ═════════════════════════════════════');
console.log('');

// Health check for frontend (matches what index_ws.html expects)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'midas-proxy', 
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// ════════ MIDDLEWARE ════════
// Enable CORS for all requests from localhost:8000
app.use(cors({
  origin: true,                    // Allow all origins (including null/file)
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

// Parse JSON payloads
app.use(express.json());

// ════════ ROUTES ════════

/**
 * POST /api/v1/chat/completions
 * Forward chat requests to OpenRouter with API key injection
 */
app.post('/api/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, max_tokens, temperature } = req.body;

    console.log(`[PROXY] POST /api/v1/chat/completions`);
    console.log(`[PROXY]   Model: ${model}`);
    console.log(`[PROXY]   Messages: ${messages?.length || 0}`);

    // Build request to OpenRouter
    const payload = JSON.stringify({
      model,
      messages,
      max_tokens: max_tokens || 2000,
      temperature: temperature || 0.7
    });

    const options = {
      hostname: 'openrouter.io',
      port: 443,
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': 'http://localhost:8000',
        'X-Title': 'MIDAS Orchestrator'
      }
    };

    // Forward to OpenRouter
    const proxyReq = https.request(options, (proxyRes) => {
      let data = '';

      proxyRes.on('data', chunk => {
        data += chunk;
      });

      proxyRes.on('end', () => {
        console.log(`[PROXY]   ✓ OpenRouter returned ${proxyRes.statusCode}`);

        // Send response back to dashboard
        res.status(proxyRes.statusCode)
           .set('Content-Type', 'application/json')
           .send(data);
      });
    });

    proxyReq.on('error', (err) => {
      console.error(`[PROXY]   ✗ Error: ${err.message}`);
      res.status(500).json({ error: err.message });
    });

    proxyReq.write(payload);
    proxyReq.end();

  } catch (error) {
    console.error(`[PROXY]   ✗ Exception: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/models
 * Forward models list request to OpenRouter
 */
app.get('/api/v1/models', (req, res) => {
  console.log(`[PROXY] GET /api/v1/models`);

  const options = {
    hostname: 'openrouter.ai',
    port: 443,
    path: '/api/v1/models',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${API_KEY}`
    }
  };

  const proxyReq = https.request(options, (proxyRes) => {
    let data = '';

    proxyRes.on('data', chunk => {
      data += chunk;
    });

    proxyRes.on('end', () => {
      console.log(`[PROXY]   ✓ Returned ${proxyRes.statusCode}`);

      res.status(proxyRes.statusCode)
         .set('Content-Type', 'application/json')
         .send(data);
    });
  });

  proxyReq.on('error', (err) => {
    console.error(`[PROXY]   ✗ Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  });

  proxyReq.end();
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

// ════════ START SERVER ════════
app.listen(PORT, () => {
  console.log(`[PROXY] ✓ Ready on http://localhost:${PORT}`);
  console.log(`[PROXY] Dashboard can now call /api/v1/chat/completions`);
  console.log('');
});
