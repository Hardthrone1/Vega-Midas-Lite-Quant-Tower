/**
 * market_data.js — provider-agnostic market data layer. Alpha Vantage is the
 * first (and, for now, only) provider, registered the same way the LLM
 * `PROVIDERS` map in Vega_Gateway_Server.js registers a model backend. A
 * futures data vendor can be added later as a second entry without touching
 * anything downstream of `normalise*` — nothing here assumes Alpha Vantage's
 * response shape past this file.
 *
 * Why this exists: Alpha Vantage has no futures coverage (no MGC1!) and gates
 * intraday bars behind a paid tier, so it cannot back the dashboard's MGC
 * series. What it does add for free: real daily gold spot (GOLD_SILVER_*),
 * daily RSI/ATR/ADX as a third opinion against the Pine/Python parity check,
 * and macro series (yields, CPI, Fed funds, FX) the tower otherwise has zero
 * visibility into.
 *
 * Hard constraint verified against a live key, not assumed from docs: 25
 * requests/day, ~5/min. Alpha Vantage answers HTTP 200 with an `Information`
 * or `Note` body when it throttles or tier-gates — that is a failure, not a
 * result, and is treated as one here. A caller that doesn't check for it will
 * cache the throttle message as if it were data.
 */
'use strict';

const BASE_URL = 'https://www.alphavantage.co/query';

class MarketDataError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.name = 'MarketDataError';
    this.retryable = retryable;
  }
}

class QuotaExceededError extends MarketDataError {
  constructor(used, quota) {
    super(`daily quota exhausted (${used}/${quota})`);
    this.name = 'QuotaExceededError';
  }
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {object} opts.store        market_store.js instance (quota persistence + cache)
 * @param {number} [opts.dailyQuota]
 * @param {number} [opts.minSpacingMs] minimum gap between outbound calls in this process
 */
function createMarketDataClient({ apiKey, store, dailyQuota = 25, minSpacingMs = 2000 }) {
  const provider = 'alphavantage';
  let lastCallAt = 0;

  async function guardedFetch(params) {
    if (!apiKey) throw new MarketDataError('ALPHAVANTAGE_API_KEY not configured');

    const { used } = await store.getQuota(provider);
    if (used >= dailyQuota) throw new QuotaExceededError(used, dailyQuota);

    const wait = minSpacingMs - (Date.now() - lastCallAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();

    const url = new URL(BASE_URL);
    for (const [k, v] of Object.entries({ ...params, apikey: apiKey })) url.searchParams.set(k, v);

    let json;
    try {
      const res = await fetch(url);
      json = await res.json();
    } catch (e) {
      throw new MarketDataError(`network error: ${e.message}`, { retryable: true });
    }

    // Alpha Vantage logs the hit server-side even when it answers with a
    // throttle/tier notice, so the local counter increments regardless —
    // otherwise a exhausted-quota loop would retry forever thinking it had
    // budget left.
    await store.incrementQuota(provider, 1);

    if (json.Information) throw new MarketDataError(`alphavantage: ${json.Information}`, { retryable: true });
    if (json.Note) throw new MarketDataError(`alphavantage: ${json.Note}`, { retryable: true });
    if (json['Error Message']) throw new MarketDataError(`alphavantage: ${json['Error Message']}`);

    return json;
  }

  // ── Normalisers: Alpha Vantage's key naming -> the tower's bar shape ─────
  // {time: epochMs, open, high, low, close, volume} — identical to
  // replayBars.ts and parity_engine's Bar, so nothing downstream needs a new type.

  function normaliseDailySeries(json, symbol) {
    const series = json['Time Series (Daily)'];
    if (!series) throw new MarketDataError('unexpected TIME_SERIES_DAILY shape');
    return Object.entries(series)
      .map(([date, v]) => ({
        symbol,
        timeframe: '1d',
        time: Date.parse(`${date}T00:00:00Z`),
        open: Number(v['1. open']),
        high: Number(v['2. high']),
        low: Number(v['3. low']),
        close: Number(v['4. close']),
        volume: Number(v['5. volume']),
        source: 'alphavantage',
      }))
      .sort((a, b) => a.time - b.time);
  }

  // GOLD_SILVER_HISTORY returns a spot close only — no open/high/low/volume.
  // Callers relying on a full OHLC bar (e.g. the parity engine) get open ==
  // high == low == close, which is honestly what the data is: a daily print,
  // not a session.
  function normaliseGoldSilverHistory(json, symbol) {
    const rows = json.data;
    if (!Array.isArray(rows)) throw new MarketDataError('unexpected GOLD_SILVER_HISTORY shape');
    return rows
      .map((r) => {
        const price = Number(r.price);
        return {
          symbol,
          timeframe: '1d',
          time: Date.parse(`${r.date}T00:00:00Z`),
          open: price, high: price, low: price, close: price,
          volume: null,
          source: 'alphavantage_spot',
        };
      })
      .sort((a, b) => a.time - b.time);
  }

  function normaliseIndicatorSeries(json, seriesName) {
    const key = Object.keys(json).find((k) => k.startsWith('Technical Analysis'));
    const series = key && json[key];
    if (!series) throw new MarketDataError('unexpected indicator response shape');
    const valueKey = (row) => row.RSI ?? row.ATR ?? row.ADX ?? Object.values(row)[0];
    return Object.entries(series)
      .map(([date, v]) => ({
        series: seriesName,
        observedAt: date,
        value: Number(valueKey(v)),
        unit: null,
        source: 'alphavantage',
      }))
      .sort((a, b) => (a.observedAt < b.observedAt ? -1 : 1));
  }

  function normaliseMacroSeries(json, seriesName) {
    const rows = json.data;
    if (!Array.isArray(rows)) throw new MarketDataError('unexpected macro series shape');
    return rows
      .map((r) => ({ series: seriesName, observedAt: r.date, value: Number(r.value), unit: json.unit || null, source: 'alphavantage' }))
      .sort((a, b) => (a.observedAt < b.observedAt ? -1 : 1));
  }

  // ── Public calls — each fetches, normalises, caches, and returns the rows ─

  async function fetchDailyBars(symbol) {
    const json = await guardedFetch({ function: 'TIME_SERIES_DAILY', symbol, outputsize: 'compact' });
    const rows = normaliseDailySeries(json, symbol);
    await store.upsertBars(rows);
    return rows;
  }

  async function fetchGoldSilverSpot(symbol = 'GOLD') {
    const json = await guardedFetch({ function: 'GOLD_SILVER_SPOT', symbol });
    return { symbol, price: Number(json.price), timestamp: json.timestamp };
  }

  async function fetchGoldSilverHistory(symbol = 'GOLD') {
    const json = await guardedFetch({ function: 'GOLD_SILVER_HISTORY', symbol, interval: 'daily' });
    const rows = normaliseGoldSilverHistory(json, symbol === 'GOLD' ? 'XAUUSD' : 'XAGUSD');
    await store.upsertBars(rows);
    return rows;
  }

  async function fetchIndicator(fn, symbol, { interval = 'daily', time_period = 14, series_type = 'close' } = {}) {
    const params = { function: fn, symbol, interval, time_period };
    if (fn === 'RSI') params.series_type = series_type;
    const json = await guardedFetch(params);
    const seriesName = `${symbol}_${fn}_${time_period}`;
    const rows = normaliseIndicatorSeries(json, seriesName);
    await store.upsertMacro(rows);
    return rows;
  }

  async function fetchMacro(fn, seriesName, { interval = 'monthly' } = {}) {
    const json = await guardedFetch({ function: fn, interval });
    const rows = normaliseMacroSeries(json, seriesName);
    await store.upsertMacro(rows);
    return rows;
  }

  async function fetchFxRate(from, to) {
    const json = await guardedFetch({ function: 'CURRENCY_EXCHANGE_RATE', from_currency: from, to_currency: to });
    const r = json['Realtime Currency Exchange Rate'];
    if (!r) throw new MarketDataError('unexpected CURRENCY_EXCHANGE_RATE shape');
    const rate = Number(r['5. Exchange Rate']);
    const rows = [{ series: `FX_${from}${to}`, observedAt: todayUTC(), value: rate, unit: `${to} per ${from}`, source: 'alphavantage' }];
    await store.upsertMacro(rows);
    return { from, to, rate, timestamp: r['6. Last Refreshed'] };
  }

  function todayUTC() {
    return new Date().toISOString().slice(0, 10);
  }

  return {
    provider,
    fetchDailyBars,
    fetchGoldSilverSpot,
    fetchGoldSilverHistory,
    fetchIndicator,
    fetchMacro,
    fetchFxRate,
  };
}

module.exports = { createMarketDataClient, MarketDataError, QuotaExceededError };
