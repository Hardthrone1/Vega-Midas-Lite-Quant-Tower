/**
 * test_memory_policy.js
 * Verifies memory conditioning through the REAL orchestrator path (no monkey-patch).
 * Uses an isolated throwaway vault so the live Obsidian vault is never touched.
 *
 * Run from the Dashboard folder:  node test_memory_policy.js
 * (requires: npm install js-yaml)
 */
const fs = require('fs');
const path = require('path');
const MIDASOrchestrator = require('./MIDAS_Orchestrator.js');

const TEST_WS = path.join(__dirname, '__policy_test_vault__');
const VAULT = path.join(TEST_WS, 'Obsidian');
fs.mkdirSync(VAULT, { recursive: true });

function audit(name, fm) { fs.writeFileSync(path.join(VAULT, name), `---\n${fm}\n---\n# ${name}`); }

// 6 toxic PASSes by nemotron on rsi_breakout (above the n=5 floor; all reality PF < 1.0)
for (let i = 1; i <= 6; i++) {
  audit(`toxic_${i}.md`, `task_id: t${i}\noriginal_pf: 4.2\nadjusted_pf: 0.45\nambiguous_traps: 12\nstrategy_tags: ["rsi_breakout", "mean_reversion"]\nnemotron_verdict: PASS`);
}
// A viable strategy history (trend_following, reality PF >= 1.5)
audit('viable_1.md', `task_id: v1\nadjusted_pf: 2.15\nambiguous_traps: 1\nstrategy_tags: ["trend_following"]\nnemotron_verdict: PASS`);
audit('viable_2.md', `task_id: v2\nadjusted_pf: 1.90\nambiguous_traps: 0\nstrategy_tags: ["trend_following"]\nnemotron_verdict: PASS`);
// A single gemini PASS — below the floor, must NOT produce an alignment line
audit('single.md', `task_id: g1\nadjusted_pf: 0.3\nstrategy_tags: ["scalp"]\ngemini_verdict: PASS`);

const orch = new MIDASOrchestrator({ workspacePath: TEST_WS, memoryPolicy: true });

function check(label, cond) { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`); return cond; }
let ok = true;

console.log('\n=== TEST 1: nemotron, toxic rsi_breakout (negative conditioning + n-floor met) ===');
const p1 = orch.buildSwarmPrompt(
  { type: 'strategy-analysis', setup: 'RSI Breakout Engine for NAS100', tags: ['rsi', 'mean_reversion'] },
  orch.agents.nemotron, {});
console.log(p1.split('[MIDAS MEMORY CONDITIONING]')[1] ? '[conditioning block]\n' + '[MIDAS MEMORY CONDITIONING]' + p1.split('[MIDAS MEMORY CONDITIONING]')[1] : '(no conditioning)');
ok &= check('conditioning block present', /\[MIDAS MEMORY CONDITIONING\]/.test(p1));
ok &= check('agent alignment: 75% of nemotron PASSes were toxic (n=8)', /PASS-on-toxic rate is 75\.0% \(n=8\)/.test(p1));
ok &= check('strategy history: rsi match, PF 0.45, 72 traps', /variants run 6x.*0\.45.*traps hit: 72/s.test(p1));
ok &= check('CRITICAL reject line for non-viable history', /CRITICAL:/.test(p1));
ok &= check('no "trapshit" spacing bug', !/trapshit/.test(p1) && /traps hit: 72/.test(p1));

console.log('\n=== TEST 2: viable trend_following (positive reinforcement) ===');
const p2 = orch.buildSwarmPrompt({ setup: 'EMA Crossover on Gold', tags: ['trend_following'] }, orch.agents.nemotron, {});
ok &= check('reinforcement line for viable history', /REINFORCEMENT:/.test(p2));
ok &= check('PF 2.02 averaged from 2.15 & 1.90', /True \(reality\) PF: 2\.02/.test(p2));
ok &= check('no CRITICAL line on viable strategy', !/CRITICAL:/.test(p2));

console.log('\n=== TEST 3: n-floor — single gemini PASS must NOT report a rate ===');
const p3 = orch.buildSwarmPrompt({ setup: 'scalp test', tags: ['scalp'] }, orch.agents.gemini, {});
ok &= check('no agent-alignment line below n-floor', !/PASS-on-toxic rate/.test(p3));

console.log('\n=== TEST 4: unknown strategy / no history → prompt unchanged (no-op) ===');
const p4 = orch.buildSwarmPrompt({ setup: 'unheard-of', tags: ['nonexistent_xyz'] }, orch.agents.qwen, {});
ok &= check('no conditioning block when nothing reportable', !/\[MIDAS MEMORY CONDITIONING\]/.test(p4));

// cleanup
fs.rmSync(TEST_WS, { recursive: true, force: true });
console.log(`\n${ok ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'}`);
process.exit(ok ? 0 : 1);
