/**
 * signal_store.js — durable storage for inbound TradingView signals.
 *
 * Two backends, chosen at boot:
 *   Postgres  when DATABASE_URL is set (Railway plugin). Survives redeploys.
 *   JSONL     otherwise, at SIGNAL_LOG_PATH or ./signals.jsonl. Fine locally,
 *             but a container filesystem is ephemeral — on Railway this is
 *             wiped on every redeploy, so attach Postgres for anything you
 *             care about keeping.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DDL = `
CREATE TABLE IF NOT EXISTS signals (
  id           BIGSERIAL PRIMARY KEY,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source       TEXT        NOT NULL DEFAULT 'tradingview',
  event        TEXT,
  symbol       TEXT,
  timeframe    TEXT,
  regime_code  INTEGER,
  regime_label TEXT,
  price        DOUBLE PRECISION,
  bar_time     TEXT,
  raw          JSONB       NOT NULL
);
CREATE INDEX IF NOT EXISTS signals_received_idx ON signals (received_at DESC);
CREATE INDEX IF NOT EXISTS signals_symbol_idx   ON signals (symbol, received_at DESC);
`;

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
    console.warn('[signals] DATABASE_URL set but `pg` is not installed — falling back to JSONL');
    return jsonlStore();
  }

  // Railway's internal PG needs no TLS; external URLs generally do.
  const ssl = /\.railway\.app|\.rlwy\.net|sslmode=require/.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined;
  const pool = new Pool({ connectionString, ssl, max: 4 });
  let ready = pool.query(DDL).then(
    () => console.log('[signals] postgres ready'),
    (e) => { console.error('[signals] postgres init failed:', e.message); throw e; }
  );

  return {
    kind: 'postgres',
    async insert(rec) {
      await ready;
      const { rows } = await pool.query(
        `INSERT INTO signals (source, event, symbol, timeframe, regime_code, regime_label, price, bar_time, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, received_at`,
        [rec.source, rec.event, rec.symbol, rec.timeframe, rec.regime_code,
         rec.regime_label, rec.price, rec.bar_time, rec.raw]
      );
      return rows[0];
    },
    async list({ limit = 100, symbol = null, event = null } = {}) {
      await ready;
      const where = [];
      const args = [];
      if (symbol) { args.push(symbol); where.push(`symbol = $${args.length}`); }
      if (event)  { args.push(event);  where.push(`event  = $${args.length}`); }
      args.push(Math.min(limit, 1000));
      const { rows } = await pool.query(
        `SELECT * FROM signals ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY received_at DESC LIMIT $${args.length}`, args);
      return rows;
    },
    async count() {
      await ready;
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM signals');
      return rows[0].n;
    },
  };
}

// ── JSONL fallback ─────────────────────────────────────────────────────────
function jsonlStore() {
  const file = process.env.SIGNAL_LOG_PATH || path.join(__dirname, 'signals.jsonl');
  console.log(`[signals] JSONL store at ${file} (ephemeral on Railway — attach Postgres to persist)`);
  let seq = 0;

  const readAll = () => {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  };

  return {
    kind: 'jsonl',
    async insert(rec) {
      const row = { id: ++seq, received_at: new Date().toISOString(), ...rec };
      fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8');
      return { id: row.id, received_at: row.received_at };
    },
    async list({ limit = 100, symbol = null, event = null } = {}) {
      let rows = readAll().reverse();
      if (symbol) rows = rows.filter((r) => r.symbol === symbol);
      if (event)  rows = rows.filter((r) => r.event === event);
      return rows.slice(0, Math.min(limit, 1000));
    },
    async count() { return readAll().length; },
  };
}

/**
 * TradingView sends whatever you typed in the alert box: JSON if you wrote
 * JSON, otherwise a bare string. Normalise both into one row shape.
 */
function normalise(body, rawText) {
  const j = (body && typeof body === 'object' && !Buffer.isBuffer(body)) ? body : {};
  const num = (v) => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return Number.isFinite(n) ? n : null;
  };
  const code = num(j.regime_code ?? j.regime);
  const LABELS = {
    1: 'TRENDING_EXPANDING', 2: 'TRENDING_QUIET',
    3: 'RANGING_VOLATILE',   4: 'RANGING_QUIET', 0: 'UNCONFIRMED',
  };
  return {
    source: 'tradingview',
    event: j.event || (code != null ? 'regime_change' : 'alert'),
    symbol: j.symbol || j.ticker || null,
    timeframe: j.timeframe || j.tf || null,
    regime_code: code,
    regime_label: j.regime_label || (code != null ? LABELS[code] ?? null : null),
    price: num(j.price ?? j.close),
    bar_time: j.bar_time || j.time || null,
    raw: Object.keys(j).length ? j : { text: rawText ?? String(body ?? '') },
  };
}

module.exports = { createStore, normalise };
