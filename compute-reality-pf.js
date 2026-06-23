/**
 * compute-reality-pf.js
 * --------------------------------------------------------------------------
 * Reality Injector — slippage/commission-adjusted Profit Factor.
 *
 * The Pine-side Reality Injector (regex) already forces slippage+commission
 * INTO the strategy script, and TradingView re-runs the math. This module is
 * the JS-side fallback/automation for when we have a raw trade list or a
 * performance summary and want to compute the adjusted PF deterministically
 * outside TradingView (e.g. dashboard CSV import, API payload, post-mortem).
 *
 * Formula (per user spec):
 *   injectedSlippage   = nTrades * slippagePerTrade
 *   injectedCommission = nTrades * commissionPerRoundTurn
 *   adjGrossProfit     = grossProfit - injectedSlippage - injectedCommission
 *   adjGrossLoss       = grossLoss   + injectedSlippage + injectedCommission
 *   + each trapCheck-flagged ambiguous trade is reclassified as a full loss
 *     (its positive P&L is removed from profit and its magnitude added to loss)
 *   adjustedPF = adjGrossProfit / adjGrossLoss
 *
 * Fails safe: missing/empty inputs return { adjusted_pf: null } (never throws,
 * never fabricates a number). A fully-zero-loss book returns adjusted_pf: null
 * too (division undefined) rather than Infinity.
 * --------------------------------------------------------------------------
 */
'use strict';

// Per-contract execution cost assumptions. EDIT THESE to your broker's reality.
// slippage = $ per trade (one fill); commission = $ per round turn.
const COST_TABLE = {
  MNQ:    { slippage: 0.50, commission: 0.74 },   // Micro Nasdaq
  MGC:    { slippage: 0.50, commission: 0.74 },   // Micro Gold (COMEX)
  XAUUSD: { slippage: 0.20, commission: 0.00 },   // Gold spot (spread-based, no commission)
  NAS100: { slippage: 0.50, commission: 0.00 },
  US30:   { slippage: 1.00, commission: 0.00 },
  USOIL:  { slippage: 0.03, commission: 0.00 },
  DEFAULT:{ slippage: 0.50, commission: 0.74 }
};

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function resolveCosts(symbol) {
  if (!symbol) return COST_TABLE.DEFAULT;
  const key = String(symbol).toUpperCase();
  // Loose match: 'MGC1!' -> MGC, 'MNQ1!' -> MNQ, etc.
  for (const k of Object.keys(COST_TABLE)) {
    if (k !== 'DEFAULT' && key.includes(k)) return COST_TABLE[k];
  }
  return COST_TABLE.DEFAULT;
}

/**
 * @param {Object} input
 * @param {number} [input.grossProfit]   raw gross profit ($) from backtest summary
 * @param {number} [input.grossLoss]     raw gross loss ($, positive magnitude)
 * @param {number} [input.totalTrades]   trade count (round turns)
 * @param {string} [input.symbol]        e.g. 'MGC1!', 'MNQ', 'XAUUSD'
 * @param {Object} [input.trapCheck]     from validatePineScriptRules; if it carries
 *                                       trapTrades:[{pnl}] those are reclassified to loss
 * @param {Array}  [input.trades]        OPTIONAL raw trade list [{pnl, isTrap}] — if given,
 *                                       grossProfit/grossLoss/totalTrades are derived from it
 * @param {number} [input.slippagePerTrade]   override cost-table slippage
 * @param {number} [input.commissionPerRoundTurn] override cost-table commission
 * @returns {{adjusted_pf:number|null, original_pf:number|null, ambiguous_traps:number,
 *            injectedSlippage:number, injectedCommission:number, basis:string}}
 */
function computeRealityPF(input = {}) {
  const costs = resolveCosts(input.symbol);
  const slipPer = num(input.slippagePerTrade) ?? costs.slippage;
  const commPer = num(input.commissionPerRoundTurn) ?? costs.commission;

  let grossProfit, grossLoss, nTrades, ambiguousTraps = 0;

  // ---- Path 1: raw trade list provided -> derive everything from it ----
  if (Array.isArray(input.trades) && input.trades.length) {
    grossProfit = 0; grossLoss = 0; nTrades = input.trades.length;
    for (const t of input.trades) {
      const pnl = num(t.pnl) ?? 0;
      const isTrap = !!t.isTrap;
      if (isTrap) {
        // trap: reclassify as full loss regardless of recorded sign
        ambiguousTraps++;
        grossLoss += Math.abs(pnl) || 0;
      } else if (pnl >= 0) {
        grossProfit += pnl;
      } else {
        grossLoss += Math.abs(pnl);
      }
    }
  } else {
    // ---- Path 2: summary metrics provided ----
    grossProfit = num(input.grossProfit);
    grossLoss   = num(input.grossLoss);
    nTrades     = num(input.totalTrades);

    // trap reclassification from trapCheck.trapTrades (each carries its pnl)
    const trapTrades = input.trapCheck && Array.isArray(input.trapCheck.trapTrades)
      ? input.trapCheck.trapTrades : [];
    for (const tt of trapTrades) {
      const pnl = num(tt.pnl) ?? 0;
      ambiguousTraps++;
      if (pnl > 0 && grossProfit !== null) {
        grossProfit -= pnl;                 // pull the phantom win out of profit
        grossLoss = (grossLoss ?? 0) + pnl;  // and book it as a loss
      }
    }
  }

  // Not enough to compute -> honest null, never a fabricated number.
  if (grossProfit === null || grossLoss === null || nTrades === null) {
    return {
      adjusted_pf: null, original_pf: null, ambiguous_traps: ambiguousTraps,
      injectedSlippage: 0, injectedCommission: 0, basis: 'insufficient-data'
    };
  }

  const original_pf = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(4) : null;

  const injectedSlippage   = nTrades * slipPer;
  const injectedCommission = nTrades * commPer;

  const adjGrossProfit = grossProfit - injectedSlippage - injectedCommission;
  const adjGrossLoss   = grossLoss   + injectedSlippage + injectedCommission;

  // adjGrossLoss is always > 0 here once any trades exist (costs are additive),
  // but guard anyway so we return null rather than Infinity on a degenerate book.
  const adjusted_pf = adjGrossLoss > 0
    ? +(Math.max(0, adjGrossProfit) / adjGrossLoss).toFixed(4)
    : null;

  return {
    adjusted_pf,
    original_pf,
    ambiguous_traps: ambiguousTraps,
    injectedSlippage: +injectedSlippage.toFixed(2),
    injectedCommission: +injectedCommission.toFixed(2),
    adjGrossProfit: +adjGrossProfit.toFixed(2),
    adjGrossLoss: +adjGrossLoss.toFixed(2),
    basis: Array.isArray(input.trades) && input.trades.length ? 'trade-list' : 'summary'
  };
}

module.exports = { computeRealityPF, COST_TABLE };
