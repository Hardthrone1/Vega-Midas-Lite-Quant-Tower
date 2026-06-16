const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 8001;

app.use(cors({ origin: '*' }));
app.use(express.json());

// Detailed logging
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url} | Origin: ${req.headers.origin || 'unknown'}`);
    next();
});

const getApiKey = () => "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";

app.post('/api/v1/chat/completions', async (req, res) => {
    try {
        const model = req.body.model || 'unknown';
        console.log(`[PROXY] Forwarding → ${model}`);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getApiKey()}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:8000',
                'X-Title': 'MIDAS Lab Dashboard'
            },
            body: JSON.stringify(req.body)
        });

        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('[PROXY] Invalid JSON from OpenRouter');
            data = { error: "Invalid response from OpenRouter", raw: text.substring(0, 500) };
        }

        console.log(`[PROXY] OpenRouter → ${response.status} for ${model}`);
        return res.status(response.status).json(data);

    } catch (err) {
        console.error('[PROXY CRASH]', err.message);
        return res.status(500).json({ error: err.message });
    }
});


app.post('/api/graphify', async (req, res) => {
    const graphData = req.body;
    const { nodes, edges } = graphData;

    console.log('[GRAPHIFY] Processing orchestration graph');
    console.log(`[GRAPHIFY]   Nodes: ${nodes?.length || 0}`);
    console.log(`[GRAPHIFY]   Edges: ${edges?.length || 0}`);

    // Log the orchestration flow for debugging
    if (nodes && edges) {
        console.log('[GRAPHIFY] Orchestration Flow:');
        edges.forEach(edge => {
            const source = nodes.find(n => n.id === edge.source);
            const target = nodes.find(n => n.id === edge.target);
            console.log(`[GRAPHIFY]   ${source?.label || edge.source} → ${target?.label || edge.target}`);
        });
    }

    // Return success without spawning graphify
    // (Graphify CLI is for code analysis, not orchestration visualization)
    res.json({
        success: true,
        output: `Orchestration graph: ${nodes?.length || 0} nodes, ${edges?.length || 0} edges`,
        graphData
    });
});

app.get('/health', (req, res) => res.json({ status: 'ok', proxy: 'MIDAS v3.5' }));

app.listen(PORT, () => {
    console.log(`🛡️ MIDAS Proxy v3.5 (Stable) running on http://localhost:${PORT}`);
});
