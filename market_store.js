/**
 * market_store.js — durable cache for fetched market data (bars + macro/indicator
 * series) and the daily-quota counter that guards the upstream provider's rate cap.
 *
 * Same dual-backend shape as signal_store.js: Postgres when DATABASE_URL is set,
 * JSONL otherwise. A separate store from signals — that table is the TradingView
 * alert log, and mixing cached OHLCV into it would muddy both.
 *
 * Bars and macro/indicator readings are upserted keyed on their natural identity,
 * so re-running a refresh never duplicates rows — a stopped-and-restarted refresh
 * picks up exactly where it left off.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DDL = `
CREATE TABLE IF NOT EXISTS market_bars (
  id         BIGSERIAL PRIMARY KEY,
  symbol     TEXT NOT NULL,
  timeframe  TEXT NOT NULL,
  bar_time   TIMESTAMPTZ NOT NULL,
  open       DOUBLE PRECISION,
  high       DOUBLE PRECISION,
  low        DOUBLE PRECISION,
  close      DOUBLE PRECISION NOT NULL,
  volume     DOUBLE PRECISION,
  source     TEXT NOT NULL DEFAULT 'alphavantage',
  UNIQUE (symbol, timeframe, bar_time, source)
);
CREATE INDEX IF NOT EXISTS market_bars_lookup_idx ON market_bars (symbol, timeframe, bar_time DESC);

CREATE TABLE IF NOT EXISTS macro_series (
  id           BIGSERIAL PRIMARY KEY,
  series       TEXT NOT NULL,
  observed_at  DATE NOT NULL,
  value        DOUBLE PRECISION NOT NULL,
  unit         TEXT,
  source       TEXT NOT NULL DEFAULT 'alphavantage',
  UNIQUE (series, observed_at, source)
);
CREATE INDEX IF NOT EXISTS macro_series_lookup_idx ON macro_series (series, observed_at DESC);

CREATE TABLE IF NOT EXISTS market_quota (
  provider        TEXT PRIMARY KEY,
  quota_date      DATE NOT NULL,
  used            INTEGER NOT NULL DEFAULT 0,
  last_refresh_at TIMESTAMPTZ
);
`;

const todayUTC = () => new Date().toISOString().slice(0, 10);

function createStore() {
  const url = process.env.DATABASE_URL;
  return url ? postgresStore(url) : jsonlStore();
}

// ── Postgres ───────────────────────────────────────────────────────────────
function postgresStore(connectionString) {
  let Pool;
  try {
    ({ Pool } = require('pg'));
  } catch {
    console.warn('[market] DATABASE_URL set but `pg` is not installed — falling back to JSONL');
    return jsonlStore();
  }

  const ssl = /\.railway\.app|\.rlwy\.net|sslmode=require/.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined;
  const pool = new Pool({ connectionString, ssl, max: 4 });
  let ready = pool.query(DDL).then(
    () => console.log('[market] postgres ready'),
    (e) => { console.error('[market] postgres init failed:', e.message); throw e; }
  );

  return {
    kind: 'postgres',

    async upsertBars(rows) {
      await ready;
      for (const r of rows) {
        await pool.query(
          `INSERT INTO market_bars (symbol, timeframe, bar_time, open, high, low, close, volume, source)
           VALUES ($1,$2,to_timestamp($3/1000.0),$4,$5,$6,$7,$8,$9)
           ON CONFLICT (symbol, timeframe, bar_time, source) DO UPDATE SET
             open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
             close = EXCLUDED.close, volume = EXCLUDED.volume`,
          [r.symbol, r.timeframe, r.time, r.open ?? null, r.high ?? null, r.low ?? null,
           r.close, r.volume ?? null, r.source || 'alphavantage']
        );
      }
      return rows.length;
    },

    async listBars({ symbol, timeframe, limit = 500 } = {}) {
      await ready;
      const { rows } = await pool.query(
        `SELECT symbol, timeframe, EXTRACT(EPOCH FROM bar_time)::bigint * 1000 AS time,
                open, high, low, close, volume, source
         FROM market_bars WHERE symbol = $1 AND timeframe = $2
         ORDER BY bar_time DESC LIMIT $3`,
        [symbol, timeframe, Math.min(limit, 2000)]
      );
      return rows.reverse();
    },

    async upsertMacro(rows) {
      await ready;
      for (const r of rows) {
        await pool.query(
          `INSERT INTO macro_series (series, observed_at, value, unit, source)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (series, observed_at, source) DO UPDATE SET value = EXCLUDED.value`,
          [r.series, r.observedAt, r.value, r.unit || null, r.source || 'alphavantage']
        );
      }
      return rows.length;
    },

    async listMacro({ series, limit = 200 } = {}) {
      await ready;
      const { rows } = await pool.query(
        `SELECT series, observed_at AS "observedAt", value, unit, source
         FROM macro_series WHERE series = $1 ORDER BY observed_at DESC LIMIT $2`,
        [series, Math.min(limit, 2000)]
      );
      return rows.reverse();
    },

    async getQuota(provider) {
      await ready;
      const { rows } = await pool.query('SELECT * FROM market_quota WHERE provider = $1', [provider]);
      const row = rows[0];
      const today = todayUTC();
      if (!row || row.quota_date.toISOString().slice(0, 10) !== today) {
        return { provider, date: today, used: 0, lastRefreshAt: row?.last_refresh_at ?? null };
      }
      return { provider, date: today, used: row.used, lastRefreshAt: row.last_refresh_at };
    },

    async incrementQuota(provider, by = 1) {
      await ready;
      const today = todayUTC();
      const { rows } = await pool.query(
        `INSERT INTO market_quota (provider, quota_date, used) VALUES ($1, $2, $3)
         ON CONFLICT (provider) DO UPDATE SET
           used = CASE WHEN market_quota.quota_date = $2 THEN market_quota.used + $3 ELSE $3 END,
           quota_date = $2
         RETURNING used`,
        [provider, today, by]
      );
      return rows[0].used;
    },

    async setLastRefresh(provider, iso) {
      await ready;
      await pool.query(
        `UPDATE market_quota SET last_refresh_at = $2 WHERE provider = $1`,
        [provider, iso]
      );
    },

    async count() {
      await ready;
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM market_bars');
      return rows[0].n;
    },
  };
}

// ── JSONL fallback ─────────────────────────────────────────────────────────
function jsonlStore() {
  const barsFile = process.env.MARKET_BARS_LOG_PATH || path.join(__dirname, 'market_bars.jsonl');
  const macroFile = process.env.MACRO_LOG_PATH || path.join(__dirname, 'macro_series.jsonl');
  const quotaFile = process.env.MARKET_QUOTA_PATH || path.join(__dirname, 'market_quota.json');
  console.log(`[market] JSONL store at ${barsFile} / ${macroFile} (ephemeral on Railway — attach Postgres to persist)`);

  const readAll = (file) => {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  };

  const readQuota = () => {
    if (!fs.existsSync(quotaFile)) return {};
    try { return JSON.parse(fs.readFileSync(quotaFile, 'utf8')); } catch { return {}; }
  };
  const writeQuota = (state) => fs.writeFileSync(quotaFile, JSON.stringify(state, null, 2), 'utf8');

  // Rewrite-in-place upsert: JSONL has no index, so dedupe by reading, merging
  // in memory, and rewriting. Fine at this scale (a handful of symbols/day).
  const upsert = (file, rows, keyFn) => {
    const existing = readAll(file);
    const byKey = new Map(existing.map((r) => [keyFn(r), r]));
    for (const r of rows) byKey.set(keyFn(r), r);
    const merged = [...byKey.values()];
    fs.writeFileSync(file, merged.map((r) => JSON.stringify(r)).join('\n') + (merged.length ? '\n' : ''), 'utf8');
    return rows.length;
  };

  return {
    kind: 'jsonl',

    async upsertBars(rows) {
      return upsert(barsFile, rows, (r) => `${r.symbol}|${r.timeframe}|${r.time}|${r.source || 'alphavantage'}`);
    },

    async listBars({ symbol, timeframe, limit = 500 } = {}) {
      const rows = readAll(barsFile)
        .filter((r) => r.symbol === symbol && r.timeframe === timeframe)
        .sort((a, b) => a.time - b.time);
      return rows.slice(-Math.min(limit, 2000));
    },

    async upsertMacro(rows) {
      return upsert(macroFile, rows, (r) => `${r.series}|${r.observedAt}|${r.source || 'alphavantage'}`);
    },

    async listMacro({ series, limit = 200 } = {}) {
      const rows = readAll(macroFile)
        .filter((r) => r.series === series)
        .sort((a, b) => (a.observedAt < b.observedAt ? -1 : 1));
      return rows.slice(-Math.min(limit, 2000));
    },

    async getQuota(provider) {
      const state = readQuota();
      const entry = state[provider];
      const today = todayUTC();
      if (!entry || entry.date !== today) {
        return { provider, date: today, used: 0, lastRefreshAt: entry?.lastRefreshAt ?? null };
      }
      return { provider, date: today, used: entry.used, lastRefreshAt: entry.lastRefreshAt ?? null };
    },

    async incrementQuota(provider, by = 1) {
      const state = readQuota();
      const today = todayUTC();
      const entry = state[provider];
      const used = (entry && entry.date === today ? entry.used : 0) + by;
      state[provider] = { date: today, used, lastRefreshAt: entry?.lastRefreshAt ?? null };
      writeQuota(state);
      return used;
    },

    async setLastRefresh(provider, iso) {
      const state = readQuota();
      const today = todayUTC();
      const entry = state[provider] || { date: today, used: 0 };
      state[provider] = { ...entry, lastRefreshAt: iso };
      writeQuota(state);
    },

    async count() {
      return readAll(barsFile).length;
    },
  };
}

module.exports = { createStore };
