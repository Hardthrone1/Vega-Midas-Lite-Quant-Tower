# MIDAS Validation Workflow: TradingView Bar Replay Integration

## Overview

MIDAS generates production-ready Pine Script code via `executeAnalysis()`. However, **code generation is only the first half of validation.** Per `PROJECT_MISSION.md`'s "Real Market Validation & Optimization Policy," the dashboard explicitly *rejects* Strategy Tester "Net Profit" or "Profit Factor" figures as proof of viability.

True validation requires:
1. **Compile verification** — Code must compile without errors in TradingView
2. **Anti-cheat linting** — Static checks for lookahead leakage, repainting, overfitting (built into `executeAudit()` as `ruleCheck`)
3. **Bar Replay forward testing** — Execute trades step-by-step against real historical bars to confirm signal accuracy
4. **Slippage/spread comparison** — Measure the delta between Strategy Tester's assumed fills and Bar Replay's simulated fills (the "live trade comparison")

The first two are automatic. The last two require a **Claude session with TradingView MCP access** because they rely on the `mcp__tradingview__*` tools, which require CDP (Chrome DevTools Protocol) connection to a live TradingView Desktop app — these tools are not callable from plain JavaScript or Node.js.

---

## Workflow: End-to-End Validation

### Prerequisites

1. **MIDAS generates code** (automatic):
   - Run `window.midas.executeAnalysis({ type: 'strategy-analysis', setup: 'Your Setup', context: 'Your Context' })`
   - The orchestrator produces a `fullResult` object with:
     - `codeArtifact.code` — the Pine Script v5 code
     - `ruleCheck` — anti-cheat linter results (violations, warnings)
     - `backTestParams` — extracted parameters (timeframe, risk, entry/exit conditions, etc.)
   - The code is **written to disk** at: `C:\Users\Softthrone\Claude\Dashboard\generated_strategies\strategy_<taskId>.pine`
   - Results are stored in the vault at `Obsidian/Setups/<date> <setup name> (strategy-analysis).md`

2. **TradingView Desktop is running** with the strategy/indicator you want to validate
3. **Claude session with MCP access** — this session, or a fresh one dedicated to validation

### Step 1: Health Check & Setup

In your Claude session with TradingView MCP:

```
mcp__tradingview__tv_health_check()
```

Expected output: `{ connected: true, symbol: "...", timeframe: "...", ... }`

If not connected, launch TradingView:

```
mcp__tradingview__tv_launch()
```

### Step 2: Inject the Generated Code

Open the generated Pine Script file in TradingView:

```
mcp__tradingview__pine_open(name: "strategy_<taskId>")
```

Or inject it directly:

```
mcp__tradingview__pine_set_source(source: <codeArtifact.code>)
```

### Step 3: Compile & Check for Errors

```
mcp__tradingview__pine_smart_compile()
```

Expected: `{ compiled: true, errors: [], ... }`

If `errors` is not empty, **abort here**. The code is not production-ready. Report the error back to MIDAS for another iteration:

```
window.midas.executeAnalysis({
  type: 'strategy-analysis',
  setup: 'Your Setup',
  context: 'Previous code failed compile: [error details]'
})
```

### Step 4: Set Chart Context

Ensure the chart matches the strategy's intended symbol and timeframe:

```
mcp__tradingview__chart_set_symbol(symbol: "<from backTestParams.symbol or user choice>")
mcp__tradingview__chart_set_timeframe(timeframe: "<from backTestParams.timeframe>")
```

Example: `chart_set_symbol("BTCUSD")`, `chart_set_timeframe("1H")`

### Step 5: Start Bar Replay

Enter replay mode at a specific historical date (e.g., 6 months back):

```
mcp__tradingview__replay_start(date: "2025-12-01")
```

Expected: Replay mode activates; chart shows the first bar of that date.

### Step 6: Step Through Bars & Execute Trades

Manually step through the bars and execute trades at the strategy's signal points:

```
mcp__tradingview__replay_step()   // Advance one bar
mcp__tradingview__replay_status() // Check current bar/state
```

When the strategy signals an entry:

```
mcp__tradingview__replay_trade(action: "buy")
```

When it signals an exit:

```
mcp__tradingview__replay_trade(action: "sell")
```

Repeat until you've walked through a meaningful test period (50–100 bars minimum).

**Alternatively, use autoplay for longer sequences:**

```
mcp__tradingview__replay_autoplay(speed: 300)  // 300ms per bar
```

Then manually issue `replay_trade()` calls when you observe signal bars.

### Step 7: Capture Trade Results

After completing the replay walk-through, extract the trades and equity curve:

```
mcp__tradingview__data_get_trades(max_trades: 100)
```

Expected output: Array of `{ date, price, size, action, pnl, ... }`

Also capture overall metrics:

```
mcp__tradingview__data_get_strategy_results()
```

And equity curve:

```
mcp__tradingview__data_get_equity()
```

### Step 8: Stop Replay & Compute Slippage Delta

Exit replay mode:

```
mcp__tradingview__replay_stop()
```

Now compute the **live trade comparison**:

- Compare each Bar Replay fill (from `data_get_trades()`) against the Strategy Tester's assumed fill price.
- Compute delta as: `(replay_price - backtest_price) / backtest_price * 100%`
- Average across all trades.

**This is the "live trade comparison" — the blueprint's proof that the code works under realistic market microstructure (spreads, slippage, order fill latency).**

### Step 9: Create Vault Validation Entry

Back in your MIDAS environment (Node.js or browser with vault access):

```javascript
const validationData = {
  title: 'Bar Replay Validation: [Your Setup Name]',
  tags: ['validation', 'replay', 'forward-test'],
  confidence: 0.88,
  compileStatus: 'success',
  ruleCheck: {
    passed: true,
    violations: [],
    warnings: ['No slippage modeling in code']
  },
  backtestMetrics: {
    profitFactor: 1.45,
    netProfit: 2450,
    totalTrades: 23,
    winRate: 0.65,
    maxDD: -8.5,
    note: 'Per blueprint policy, Strategy Tester metrics are signals only — not proof.'
  },
  replayTrades: [
    { action: 'buy', date: '2025-12-15', price: 42100, size: 0.5 },
    { action: 'sell', date: '2025-12-16', price: 42450, size: 0.5 },
    // ... more trades
  ],
  slippageDelta: 0.08,  // 0.08% average difference between backtest fills and replay fills
  notes: 'Passed compile. No anti-cheat violations. Bar Replay walk-through confirmed signal accuracy across 50 bars. Slippage delta (0.08%) is within acceptable range for 4-hour timeframe.'
};

// Write to vault
window.midas.vaultBridge?.createValidationEntry(validationData);
// Or in Node context:
// const vault = new (require('./vault-sync.js'))('./Obsidian');
// await vault.createValidationEntry(validationData);
```

The validation entry is stored at:
```
C:\Users\Softthrone\Claude\Dashboard\Obsidian\Setups\Validation\<YYYY-MM-DD> Bar Replay Validation: [Your Setup Name].md
```

---

## Anti-Cheat Rules (Built Into `executeAudit()`)

The `ruleCheck` output includes automated linting for the following blueprint rules:

| Rule | Check | Status |
|------|-------|--------|
| Confirmed bars validation | `barstate.isconfirmed` present with `strategy.entry()` | Violation if absent |
| No lookahead leakage | No `close[-`, `[bar_index + positive`, or `security()` with `lookahead_on` | Violation if found |
| No repainting | No `security()` with lookahead parameter | Violation if found |
| No overfitting | Indicator stacking ≤ 4 distinct `ta.*` calls | Warning if ≥ 5 |
| Slippage/spread modeling | At least one keyword: `slippage`, `spread`, `commission` | Warning if absent |
| ATR stops on confirmed bars | ATR-based stops paired with `barstate.isconfirmed` | Warning if ATR on entry bar |

**Important:** The linter is **static and heuristic** — it catches common mistakes by regex, not by full Pine parsing. Always review `ruleCheck.violations` manually. A passing linter is necessary but not sufficient for production code.

---

## Summary: Three Levels of Proof

| Level | Tool | Proof | Example |
|-------|------|-------|---------|
| **Code Quality** | Static Linter (`validatePineScriptRules()`) | No obvious anti-cheat violations | ✓ barstate.isconfirmed present, no lookahead detected |
| **Compilation** | TradingView Compiler (`pine_smart_compile()`) | Code is syntactically valid Pine v5 | ✓ 0 errors, 0 warnings |
| **Real-World Validation** | Bar Replay (`replay_*` tools) + Slippage Calc | Signals fire accurately; fills match expected prices within realistic slippage | ✓ 23 trades, 0.08% average slippage delta vs. backtest |

**All three must pass for a strategy to be considered production-ready.**

---

## Troubleshooting

### Compile Error on Fresh Code
- MIDAS may have generated code with a syntax error. Log the error and re-run `window.midas.executeAnalysis()` with the error details in the context field.
- Check that `//@version=5` is at the top of the script.

### Replay Fills Diverge Significantly from Backtest
- Check the chart's bid/ask spread for the symbol/timeframe. Real spreads are often 2–5 ticks wider than Strategy Tester assumes.
- Check for `strategy.entry(..., limit=...)` vs. market orders — limit orders may not fill on the expected bar.
- Verify bar timestamps match your expected timezone (TradingView uses UTC for most exchanges).

### No Trades in Bar Replay Despite Strategy Tester Showing Trades
- Possible lookahead leakage that Bar Replay caught. Check `ruleCheck.violations`.
- Entry condition may depend on bars not yet confirmed in replay mode. Ensure `barstate.isconfirmed` is used.

### TradingView MCP Tools Return "CDP Not Connected"
- Ensure TradingView Desktop is running and the MCP bridge is active. Re-run `tv_health_check()`.
- On Windows, check Task Manager for `TradingView.exe` process.

---

## References

- **Blueprint:** `C:\Users\Softthrone\Claude\Dashboard\PROJECT_MISSION.md` — "Real Market Validation & Optimization Policy"
- **Orchestrator:** `MIDAS_Orchestrator.js` — `validatePineScriptRules()`, `executeAudit()`, `extractBacktestParams()`
- **Vault Schema:** `vault-sync.js` — `createValidationEntry()`
- **MCP Tools:** TradingView MCP server — `tv_launch`, `pine_set_source`, `pine_smart_compile`, `replay_start`, `replay_trade`, `data_get_trades`, `data_get_strategy_results`, `data_get_equity`, `chart_set_symbol`, `chart_set_timeframe`, etc.

