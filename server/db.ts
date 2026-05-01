// Uses Node's built-in node:sqlite (Node 22+). Avoids native compilation —
// no MSVC build tools needed on Windows.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const path = process.env.DB_PATH || './data/liquidity.db';
  mkdirSync(dirname(path), { recursive: true });
  db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  initSchema(db);
  return db;
}

function initSchema(d: DatabaseSync): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taken_at INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_taken_at ON snapshots(taken_at);

    -- Legacy table from the v0 collector. Kept around so any pre-existing
    -- archives aren't silently abandoned. Nothing reads it any more — the
    -- v2 schema below is the live one.
    CREATE TABLE IF NOT EXISTS timeseries (
      source TEXT NOT NULL,
      bucket_date TEXT NOT NULL,
      value REAL,
      payload TEXT,
      PRIMARY KEY (source, bucket_date)
    );

    -- Live timeseries store. Keyed by (metric, asset, ts) so multi-asset
    -- metrics like funding_rate-btc vs funding_rate-eth coexist cleanly.
    -- ts is unix-ms; for daily metrics it's UTC midnight of the bucket date.
    CREATE TABLE IF NOT EXISTS timeseries_v2 (
      metric TEXT NOT NULL,
      asset TEXT NOT NULL,
      ts INTEGER NOT NULL,
      value REAL,
      payload TEXT,
      PRIMARY KEY (metric, asset, ts)
    );
    CREATE INDEX IF NOT EXISTS idx_ts_v2_metric_asset ON timeseries_v2(metric, asset, ts);
  `);
}

export function insertSnapshot(payload: unknown): void {
  const d = getDb();
  d.prepare('INSERT INTO snapshots (taken_at, payload) VALUES (?, ?)').run(
    Date.now(),
    JSON.stringify(payload),
  );
}

export interface SeriesPoint {
  ts: number;            // unix-ms
  value: number;
  payload?: unknown;     // optional original point JSON
}

export function upsertPoints(metric: string, asset: string, rows: SeriesPoint[]): number {
  if (rows.length === 0) return 0;
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO timeseries_v2 (metric, asset, ts, value, payload)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(metric, asset, ts) DO UPDATE SET
      value = excluded.value,
      payload = excluded.payload
  `);
  d.exec('BEGIN');
  try {
    for (const r of rows) {
      stmt.run(metric, asset, r.ts, r.value, r.payload ? JSON.stringify(r.payload) : null);
    }
    d.exec('COMMIT');
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
  return rows.length;
}

export function queryRange(
  metric: string,
  asset: string,
  since: number,
  until: number,
): SeriesPoint[] {
  const d = getDb();
  const rows = d
    .prepare(
      `SELECT ts, value FROM timeseries_v2
       WHERE metric = ? AND asset = ? AND ts BETWEEN ? AND ?
       ORDER BY ts ASC`,
    )
    .all(metric, asset, since, until) as Array<{ ts: number; value: number }>;
  return rows.map((r) => ({ ts: r.ts, value: r.value }));
}

export function metricDepth(metric: string, asset: string): { oldest: number | null; newest: number | null } {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT MIN(ts) as oldest, MAX(ts) as newest FROM timeseries_v2
       WHERE metric = ? AND asset = ?`,
    )
    .get(metric, asset) as { oldest: number | null; newest: number | null } | undefined;
  return {
    oldest: row?.oldest ?? null,
    newest: row?.newest ?? null,
  };
}

// Legacy upsert kept for compatibility with anything still calling it; do
// not use in new code.
export function upsertSeries(
  source: string,
  rows: Array<{ date: string; value: number; payload?: unknown }>,
): void {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO timeseries (source, bucket_date, value, payload)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(source, bucket_date) DO UPDATE SET
      value = excluded.value,
      payload = excluded.payload
  `);
  d.exec('BEGIN');
  try {
    for (const row of rows) {
      stmt.run(source, row.date, row.value, row.payload ? JSON.stringify(row.payload) : null);
    }
    d.exec('COMMIT');
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}
