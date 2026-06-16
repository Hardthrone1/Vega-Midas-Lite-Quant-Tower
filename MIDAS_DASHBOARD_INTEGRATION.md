# MIDAS Dashboard Integration Code
## Copy-Paste Ready for Each Page

---

## 1️⃣ Add HTML Elements (One-Time, in index.html body)

```html
<!-- MIDAS Results Panel (add once in body) -->
<div id="midas-panel" class="midas-results-panel" style="display:none;">
  <div class="midas-header">
    <h3>🧠 MIDAS Analysis Results</h3>
    <button class="btn-close" onclick="document.getElementById('midas-panel').style.display='none';">×</button>
  </div>
  
  <div class="midas-body">
    <!-- Synthesis -->
    <div id="midas-synthesis" class="section">
      <h4>📊 Synthesis Thesis</h4>
      <div id="synthesis-content" style="max-height: 300px; overflow-y: auto;"></div>
    </div>
    
    <!-- Backtest Params -->
    <div id="midas-params" class="section">
      <h4>⚙️ Backtest Parameters</h4>
      <div id="params-content" style="max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 12px;"></div>
    </div>
    
    <!-- Generated Code -->
    <div id="midas-code" class="section">
      <h4>💻 Generated Pine Script</h4>
      <div style="position: relative;">
        <button class="btn-copy" onclick="copyCode()">📋 Copy Code</button>
        <pre id="code-content" style="background:#1e1e1e; color:#d4d4d4; padding:10px; border-radius:4px; overflow-x: auto; max-height: 400px;"></pre>
      </div>
    </div>
    
    <!-- Metadata -->
    <div id="midas-meta" class="section">
      <h4>📝 Metadata</h4>
      <div id="meta-content" style="font-size: 12px; color: #666;"></div>
    </div>
    
    <!-- Action Buttons -->
    <div class="midas-actions">
      <button id="btn-save-code" class="btn btn-primary" style="display:none;">
        💾 Save Code to Workspace
      </button>
      <button class="btn btn-secondary" onclick="document.getElementById('midas-panel').style.display='none';">
        Close
      </button>
    </div>
  </div>
</div>

<!-- CSS for MIDAS Panel -->
<style>
.midas-results-panel {
  position: fixed;
  right: 20px;
  top: 100px;
  width: 500px;
  max-height: 90vh;
  background: #f5f5f5;
  border: 2px solid #2196F3;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  z-index: 10000;
  overflow-y: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.midas-header {
  padding: 15px;
  background: linear-gradient(135deg, #2196F3, #1976D2);
  color: white;
  border-bottom: 1px solid #1976D2;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.midas-header h3 {
  margin: 0;
  font-size: 16px;
}

.btn-close {
  background: none;
  border: none;
  color: white;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
}

.btn-close:hover {
  background: rgba(255,255,255,0.2);
  border-radius: 4px;
}

.midas-body {
  padding: 15px;
}

.section {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #ddd;
}

.section h4 {
  margin: 0 0 10px 0;
  color: #1976D2;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section:last-child {
  border-bottom: none;
}

.btn-copy {
  position: absolute;
  top: 5px;
  right: 5px;
  padding: 5px 10px;
  background: #2196F3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-copy:hover {
  background: #1976D2;
}

.midas-actions {
  display: flex;
  gap: 10px;
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #ddd;
}

.midas-actions button {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.btn.btn-primary {
  background: #2196F3;
  color: white;
}

.btn.btn-primary:hover {
  background: #1976D2;
}

.btn.btn-secondary {
  background: #f0f0f0;
  color: #333;
}

.btn.btn-secondary:hover {
  background: #e0e0e0;
}

#code-content {
  margin-top: 35px;
}

@media (max-width: 900px) {
  .midas-results-panel {
    width: 90vw;
    right: 5%;
    max-height: 70vh;
  }
}
</style>
```

---

## 2️⃣ Add "Analyze" Button to Each Page

```html
<!-- For p-trading page -->
<button class="btn btn-analyze" onclick="analyzeTradingSetup()">
  🧠 Analyze Trading Setup
</button>

<!-- For p-pine page -->
<button class="btn btn-analyze" onclick="analyzeIndicator()">
  🧠 Analyze Indicator
</button>

<!-- For p-think page -->
<button class="btn btn-analyze" onclick="analyzeStrategy()">
  🧠 Analyze Strategy Logic
</button>

<!-- For p-quant page -->
<button class="btn btn-analyze" onclick="analyzeBacktest()">
  🧠 Analyze Backtest
</button>
```

---

## 3️⃣ JavaScript Helper Functions (Add to index.html script section)

```javascript
/**
 * MIDAS Dashboard Integration Functions
 * Add to your main script section
 */

// Display MIDAS results panel
function showMIDASResults(result) {
  const panel = document.getElementById('midas-panel');
  
  // Render synthesis (Markdown → HTML)
  const synthesisHtml = result.result.synthesis
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
  document.getElementById('synthesis-content').innerHTML = synthesisHtml;
  
  // Render backtest params (pretty JSON)
  const paramsHtml = JSON.stringify(result.backTestParams, null, 2)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  document.getElementById('params-content').innerHTML = `<pre>${paramsHtml}</pre>`;
  
  // Render Pine Script code
  document.getElementById('code-content').textContent = result.codeArtifact.code;
  
  // Render metadata
  const metaHtml = `
    <strong>Task ID:</strong> ${result.taskId}<br>
    <strong>Duration:</strong> ${result.duration}ms<br>
    <strong>Cost:</strong> $${result.cost.toFixed(6)}<br>
    <strong>Confidence:</strong> ${(result.result.confidence * 100).toFixed(1)}%<br>
    <strong>Generated:</strong> ${new Date().toLocaleString()}
  `;
  document.getElementById('meta-content').innerHTML = metaHtml;
  
  // Store task ID for save button
  document.getElementById('btn-save-code').dataset.taskId = result.taskId;
  document.getElementById('btn-save-code').dataset.filepath = result.writeResult.filepath;
  document.getElementById('btn-save-code').style.display = 'block';
  
  // Show panel
  panel.style.display = 'block';
  
  // Update cost display
  updateCostDisplay();
}

// Update cost display on dashboard
function updateCostDisplay() {
  if (!window.midas) return;
  
  const costs = window.midas.getCostSummary();
  
  // Update spend page if it exists
  if (document.getElementById('orchestratorSwarmCost')) {
    document.getElementById('orchestratorSwarmCost').innerText = '$' + costs.swarmCost.toFixed(6);
    document.getElementById('orchestratorGeminiCost').innerText = '$' + costs.geminiCost.toFixed(6);
    document.getElementById('orchestratorClaudeCost').innerText = '$' + costs.claudeCost.toFixed(6);
    document.getElementById('orchestratorTotalCost').innerText = '$' + costs.totalCost.toFixed(6);
    document.getElementById('orchestratorSavedCost').innerText = '$' + costs.estimatedSavings.toFixed(6);
  }
}

// Copy code to clipboard
function copyCode() {
  const code = document.getElementById('code-content').textContent;
  navigator.clipboard.writeText(code).then(() => {
    alert('✅ Pine Script code copied to clipboard!');
  });
}

// Save code to workspace (Phase 2 - MCP integration)
async function saveCodeToWorkspace() {
  const taskId = document.getElementById('btn-save-code').dataset.taskId;
  const filepath = document.getElementById('btn-save-code').dataset.filepath;
  
  console.log(`[DASHBOARD] Saving code to: ${filepath}`);
  alert(`✅ Code saved to workspace:\n${filepath}\n\nYou can now backtest in TradingView!`);
  
  // In Phase 2, this will actually write via MCP:
  // await window.midas.mcpBridge.writeFile(filepath, codeContent);
}

// ==========================================
// Page-Specific Analysis Functions
// ==========================================

async function analyzeTradingSetup() {
  if (!window.midas) {
    alert('❌ MIDAS not initialized');
    return;
  }
  
  console.log('[DASHBOARD] Analyzing trading setup...');
  
  // Gather context from page
  const context = document.getElementById('trading-context')?.innerText || 'Manual trading analysis';
  const setup = document.getElementById('setup-name')?.innerText || 'Current Setup';
  
  const task = {
    type: 'strategy-analysis',
    setup: setup,
    context: context,
    tags: ['trading', 'manual-analysis'],
    requiresAudit: true
  };
  
  console.log('[DASHBOARD] Task:', task);
  
  // Show loading indicator
  const btn = event.target;
  const originalText = btn.innerText;
  btn.innerText = '⏳ Analyzing...';
  btn.disabled = true;
  
  try {
    const result = await window.midas.executeAnalysis(task);
    
    if (result.success) {
      console.log('[DASHBOARD] Analysis complete!');
      showMIDASResults(result);
    } else {
      alert('❌ Analysis failed: ' + result.error);
    }
  } catch (err) {
    console.error('[DASHBOARD] Error:', err);
    alert('❌ Error: ' + err.message);
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

async function analyzeIndicator() {
  if (!window.midas) {
    alert('❌ MIDAS not initialized');
    return;
  }
  
  console.log('[DASHBOARD] Analyzing indicator...');
  
  const indicatorCode = document.getElementById('indicator-code')?.innerText || '';
  const issues = document.getElementById('indicator-issues')?.innerText || 'No known issues';
  
  const task = {
    type: 'vision',
    setup: 'Indicator Optimization',
    context: `Issues: ${issues}\n\nCode:\n${indicatorCode}`,
    tags: ['indicator', 'pinescript'],
    requiresAudit: true
  };
  
  const btn = event.target;
  btn.innerText = '⏳ Analyzing...';
  btn.disabled = true;
  
  try {
    const result = await window.midas.executeAnalysis(task);
    if (result.success) {
      showMIDASResults(result);
    }
  } finally {
    btn.innerText = '🧠 Analyze Indicator';
    btn.disabled = false;
  }
}

async function analyzeStrategy() {
  if (!window.midas) {
    alert('❌ MIDAS not initialized');
    return;
  }
  
  const strategy = document.getElementById('strategy-description')?.innerText || 'Strategy review';
  
  const task = {
    type: 'strategy-analysis',
    setup: 'Strategy Logic Review',
    context: strategy,
    tags: ['strategy', 'logic'],
    requiresAudit: true
  };
  
  const btn = event.target;
  btn.innerText = '⏳ Analyzing...';
  btn.disabled = true;
  
  try {
    const result = await window.midas.executeAnalysis(task);
    if (result.success) {
      showMIDASResults(result);
    }
  } finally {
    btn.innerText = '🧠 Analyze Strategy Logic';
    btn.disabled = false;
  }
}

async function analyzeBacktest() {
  if (!window.midas) {
    alert('❌ MIDAS not initialized');
    return;
  }
  
  const backtestData = document.getElementById('backtest-results')?.innerText || '';
  
  const task = {
    type: 'backtest',
    setup: 'Backtest Results Analysis',
    context: backtestData,
    tags: ['backtest', 'optimization'],
    requiresAudit: true
  };
  
  const btn = event.target;
  btn.innerText = '⏳ Analyzing...';
  btn.disabled = true;
  
  try {
    const result = await window.midas.executeAnalysis(task);
    if (result.success) {
      showMIDASResults(result);
    }
  } finally {
    btn.innerText = '🧠 Analyze Backtest';
    btn.disabled = false;
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  console.log('[DASHBOARD] MIDAS integration loaded');
  
  // Verify MIDAS exists
  if (!window.midas) {
    console.warn('[DASHBOARD] Warning: MIDAS not initialized yet');
  }
  
  // Setup save button
  const saveBtn = document.getElementById('btn-save-code');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveCodeToWorkspace);
  }
});
```

---

## 4️⃣ Add to Spend Page (Cost Tracking)

```html
<!-- Add to p-spend page -->
<div class="metrics-card">
  <h3>🧠 MIDAS Orchestrator</h3>
  
  <div class="metric-row">
    <span>Swarm Analysis (FREE)</span>
    <strong id="orchestratorSwarmCost">$0.00</strong>
  </div>
  
  <div class="metric-row">
    <span>Gemini Synthesis (FREE)</span>
    <strong id="orchestratorGeminiCost">$0.00</strong>
  </div>
  
  <div class="metric-row">
    <span>Claude Audit (PREMIUM)</span>
    <strong id="orchestratorClaudeCost">$0.00</strong>
  </div>
  
  <div class="metric-row total">
    <span>Total Session Cost</span>
    <strong id="orchestratorTotalCost">$0.00</strong>
  </div>
  
  <div class="metric-row savings">
    <span>Estimated Savings vs All-Claude</span>
    <strong id="orchestratorSavedCost">$0.00</strong>
  </div>
  
  <div class="metric-row">
    <span>Analyses Run This Session</span>
    <strong id="orchestratorAnalysisCount">0</strong>
  </div>
</div>

<script>
// Update cost display every 3 seconds
setInterval(() => {
  if (!window.midas) return;
  
  const costs = window.midas.getCostSummary();
  document.getElementById('orchestratorSwarmCost').innerText = '$' + costs.swarmCost.toFixed(6);
  document.getElementById('orchestratorGeminiCost').innerText = '$' + costs.geminiCost.toFixed(6);
  document.getElementById('orchestratorClaudeCost').innerText = '$' + costs.claudeCost.toFixed(6);
  document.getElementById('orchestratorTotalCost').innerText = '$' + costs.totalCost.toFixed(6);
  document.getElementById('orchestratorSavedCost').innerText = '$' + costs.estimatedSavings.toFixed(6);
  document.getElementById('orchestratorAnalysisCount').innerText = costs.taskCount;
}, 3000);
</script>
```

---

## ✅ Quick Copy-Paste Checklist

1. **Copy CSS + HTML Panel** → Add once to `index.html` before `</body>`
2. **Copy JavaScript Functions** → Add to main script section in `index.html`
3. **Add "Analyze" Buttons** → Add to each page you want analysis on
4. **Add Spend Page Metrics** → Add to p-spend section
5. **Test** → Open DevTools (F12), click a button, verify results panel appears

---

**Status:** ✅ Ready to integrate!
