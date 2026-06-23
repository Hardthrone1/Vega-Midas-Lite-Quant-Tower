/**
 * test-reality-pipeline.js
 * --------------------------------------------------------------------------
 * One-shot smoke test of the full Reality Engine chain:
 *
 *   executeAnalysis(task)
 *     -> executeAudit (linter + trapCheck)
 *     -> computeRealityPF (slippage/commission/trap adjustment)
 *     -> createValidationEntry (writes .md to vault with policy schema)
 *     -> memoryIndex.hotInject (RAM index update)
 *
 * SAFE BY DESIGN:
 *   - Uses a THROWAWAY vault (./._test_vault) — never touches real Obsidian.
 *   - STUBS the agent/swarm calls — no OpenRouter API calls, no cost, no
 *     network dependency. We are testing OUR wire, not the LLM swarm.
 *   - Cleans up the throwaway vault on exit (pass --keep to inspect output).
 *
 * Run:   node test-reality-pipeline.js
 *        node test-reality-pipeline.js --keep   (leave the .md for inspection)
 * --------------------------------------------------------------------------
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const KEEP = process.argv.includes('--keep');
const TEST_VAULT = path.join(__dirname, '._test_vault');

// ── coloured console ────────────────────────────────────────────────────
const C = { g:'\x1b[32m', r:'\x1b[31m', y:'\x1b[33m', c:'\x1b[36m', d:'\x1b[2m', x:'\x1b[0m' };
let passed = 0, failed = 0;
function check(name, cond, detail='') {
  if (cond) { console.log(`  ${C.g}✓${C.x} ${name}`); passed++; }
  else      { console.log(`  ${C.r}✗ ${name}${C.x}${detail?'  '+C.d+detail+C.x:''}`); failed++; }
}
function section(t){ console.log(`\n${C.c}=== ${t} ===${C.x}`); }

// ── clean slate ─────────────────────────────────────────────────────────
function resetVault() {
  if (fs.existsSync(TEST_VAULT)) fs.rmSync(TEST_VAULT, { recursive: true, force: true });
  fs.mkdirSync(TEST_VAULT, { recursive: true });
}

async function main() {
  console.log(`${C.c}╔══════════════════════════════════════════════╗${C.x}`);
  console.log(`${C.c}║  MIDAS Reality Engine — Pipeline Smoke Test  ║${C.x}`);
  console.log(`${C.c}╚══════════════════════════════════════════════╝${C.x}`);

  resetVault();

  // ── load the real orchestrator + memory policy from disk ──────────────
  let MIDASOrchestrator;
  try {
    MIDASOrchestrator = require('./MIDAS_Orchestrator.js');
  } catch (e) {
    console.log(`${C.r}FATAL: could not load MIDAS_Orchestrator.js: ${e.message}${C.x}`);
    process.exit(1);
  }

  section('1. Initialize orchestrator (throwaway vault)');
  const orch = new MIDASOrchestrator({ workspacePath: TEST_VAULT, memoryPolicy: true });
  check('orchestrator constructed', !!orch);
  check('memoryIndex present', !!orch.memoryIndex, 'memory policy did not initialize');
  check('computeRealityPF wired', typeof orch.computeRealityPF === 'function',
        'require for compute-reality-pf.js missing — apply Edit 1');
  check('vaultBridge present', !!orch.vaultBridge, 'vault-sync did not initialize');
  check('createValidationEntry available',
        !!(orch.vaultBridge && typeof orch.vaultBridge.createValidationEntry === 'function'));
  check('hotInject available',
        !!(orch.memoryIndex && typeof orch.memoryIndex.hotInject === 'function'),
        'midas-memory-policy.js missing hotInject — use updated version');

  // ── STUB the swarm so no real API calls fire ──────────────────────────
  // We replace the network-bound pieces with deterministic returns, but let
  // the REAL executeAnalysis / wire / vault / memory code run untouched.
  section('2. Stub agent calls (no OpenRouter, deterministic)');
  orch.routeTask        = async () => ['nemotron'];
  orch.callAgent        = async () => 'STUBBED agent response: strategy logic ok.';
  orch.executeSwarm     = async (task) => [{ agent:'nemotron', result:'stub swarm analysis' }];
  orch.executeSynthesis = async () => ({ synthesis:'Stub synthesis thesis.', confidence:0.82 });
  orch.callGraphify     = async () => ({ success:true });
  // executeAudit: return a realistic shape WITH a trapCheck carrying a trap trade,
  // and force the path through executeAudit by setting requiresAudit on the task.
  orch.executeAudit = async (synthesis, task) => ({
    synthesis: synthesis.synthesis,
    auditNotes: '//@version=5\nstrategy("Stub", overlay=true)\n// ...',
    successAgent: 'Nemotron',
    ruleCheck: {
      passed: true,
      violations: [],
      warnings: ['high indicator stacking'],
      trapCheck: { status:'TRAP', message:'1 ambiguous SL/TP same-bar',
                   trapTrades: [{ pnl: 300 }] }   // one phantom +300 win -> reclassified to loss
    },
    confidence: 0.82
  });
  check('swarm + audit stubbed', true);

  // ── build the mock task with realistic backtest metrics ───────────────
  section('3. Dispatch executeAnalysis with backtest payload');
  const task = {
    type: 'strategy-analysis',
    setup: 'Smoke Test — XAUUSD trend',
    symbol: 'XAUUSD',
    tags: ['trend_following', 'smoke_test'],
    requiresAudit: true,                 // force the executeAudit branch
    visualize: false,                    // skip graphify
    backtest: {                          // <-- the input contract task.backtest
      grossProfit: 5000,
      grossLoss: 2500,
      totalTrades: 120
    }
  };

  // Hand-compute expected adjusted_pf for XAUUSD (slip .20, comm 0):
  //   trap pulls +300 out of profit, into loss:
  //     GP = 5000 - 300 = 4700 ; GL = 2500 + 300 = 2800
  //   inj slip = 120 * .20 = 24 ; comm = 0
  //     adjGP = 4700 - 24 = 4676 ; adjGL = 2800 + 24 = 2824
  //     adjusted_pf = 4676 / 2824 = 1.6558
  const EXPECTED_ADJ = 1.6558;

  let result;
  try {
    result = await orch.executeAnalysis(task);
    check('executeAnalysis returned', !!result);
    check('executeAnalysis success flag', result && result.success !== false,
          result && result.error ? result.error : '');
  } catch (e) {
    check('executeAnalysis ran without throwing', false, e.message);
  }

  // ── verify the vault .md was written with policy schema ───────────────
  section('4. Verify validation .md written with adjusted_pf + verdict');
  const valDir = path.join(TEST_VAULT, 'Obsidian', 'Setups', 'Validation');
  let mdFile = null;
  if (fs.existsSync(valDir)) {
    const mds = fs.readdirSync(valDir).filter(f => f.endsWith('.md'));
    if (mds.length) mdFile = path.join(valDir, mds[mds.length - 1]);
  }
  check('validation .md created', !!mdFile, `nothing under ${valDir}`);

  if (mdFile) {
    const md = fs.readFileSync(mdFile, 'utf8');
    const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
    const fm = fmMatch ? fmMatch[1] : '';
    console.log(`${C.d}  ── frontmatter ──\n${fm.split('\n').map(l=>'    '+l).join('\n')}${C.x}`);

    const adjMatch = fm.match(/adjusted_pf:\s*([0-9.]+)/);
    const adjVal = adjMatch ? Number(adjMatch[1]) : null;
    check('adjusted_pf present in frontmatter', adjVal !== null);
    check(`adjusted_pf ≈ ${EXPECTED_ADJ}`, adjVal !== null && Math.abs(adjVal - EXPECTED_ADJ) < 0.01,
          `got ${adjVal}`);
    check('original_pf present', /original_pf:\s*[0-9.]+/.test(fm));
    check('ambiguous_traps = 1', /ambiguous_traps:\s*1/.test(fm));
    check('strategy_tags written', /strategy_tags:\s*\[/.test(fm));
    check('nemotron_verdict: PASS (linter passed, winning agent)',
          /nemotron_verdict:\s*PASS/.test(fm),
          'verdict mapping wrong — check Edit 2/3');
  }

  // ── verify hotInject updated the RAM index ────────────────────────────
  section('5. Verify hotInject updated MidasMemoryIndex (RAM)');
  const inRam = orch.memoryIndex && Array.isArray(orch.memoryIndex.index)
    ? orch.memoryIndex.index.filter(r => Array.isArray(r.strategy_tags)
        && r.strategy_tags.includes('smoke_test')) : [];
  check('record hot-injected into RAM index', inRam.length >= 1,
        `index has ${orch.memoryIndex ? orch.memoryIndex.index.length : 'n/a'} records, none tagged smoke_test`);
  if (inRam.length) {
    const rec = inRam[inRam.length - 1];
    check('RAM record carries adjusted_pf', typeof rec.adjusted_pf === 'number' || rec.adjusted_pf === null);
    check('RAM record carries the verdict', String(rec.nemotron_verdict).toUpperCase() === 'PASS',
          `got ${rec.nemotron_verdict}`);
  }

  // ── summary ───────────────────────────────────────────────────────────
  console.log(`\n${C.c}══════════════════════════════════════${C.x}`);
  if (failed === 0) console.log(`${C.g}✓ ALL ${passed} CHECKS PASSED — pipeline fires end-to-end.${C.x}`);
  else              console.log(`${C.r}✗ ${failed} FAILED${C.x}, ${C.g}${passed} passed${C.x}. See above.`);
  console.log(`${C.c}══════════════════════════════════════${C.x}`);

  if (KEEP) console.log(`${C.y}Throwaway vault kept at: ${TEST_VAULT}${C.x}`);
  else { fs.rmSync(TEST_VAULT, { recursive:true, force:true }); console.log(`${C.d}(throwaway vault cleaned; use --keep to inspect)${C.x}`); }

  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error(`${C.r}HARNESS ERROR: ${e.stack}${C.x}`); process.exit(1); });
