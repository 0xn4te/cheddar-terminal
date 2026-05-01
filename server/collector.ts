// Background poller. Run via:
//   npm run collector              -- normal incremental cycles
//   npm run collector -- --backfill-- one-time 90d backfill, then exits
//
// Persists every dashboard-visible metric into the timeseries_v2 table so
// the /api/history route can serve long-range views. Uses INSERT OR REPLACE
// keyed by (metric, asset, ts) so re-runs and overlapping fetches are safe.
//
// Missing-key tolerance: if COINGLASS_API_KEY is unset, Coinglass tasks are
// skipped entirely and a single notice is logged. CryptoQuant tasks continue
// to run.

import { cqFetch, type CqFetchSpec } from './cryptoquant.ts';
import { cgFetch, type CgFetchSpec, hasCoinglassKey } from './coinglass.ts';
import { hasApiKey as hasCqKey } from './cryptoquant.ts';
import {
  insertSnapshot,
  upsertPoints,
  type SeriesPoint,
} from './db.ts';
import type { CQDataPoint, SourceResult } from './types.ts';

const POLL_INTERVAL_MS = 15 * 60 * 1000;
const INCREMENTAL_LIMIT = 7;
const BACKFILL_LIMIT = 90;
const BACKFILL_THROTTLE_MS = 250;

interface Task {
  source: 'cq' | 'cg';
  metric: string;
  asset: string;
  path: string;
  params: Record<string, string | number>;
  valueKeys: string[];
}

const TASKS: Task[] = [
  // CryptoQuant
  { source: 'cq', metric: 'netflow', asset: 'btc', path: '/btc/exchange-flows/netflow',
    params: { window: 'day', exchange: 'all_exchange' },
    valueKeys: ['netflow_total_usd', 'netflow_total'] },
  { source: 'cq', metric: 'netflow', asset: 'eth', path: '/eth/exchange-flows/netflow',
    params: { window: 'day', exchange: 'all_exchange' },
    valueKeys: ['netflow_total_usd', 'netflow_total'] },
  { source: 'cq', metric: 'netflow', asset: 'usdt', path: '/stablecoin/exchange-flows/netflow',
    params: { window: 'day', exchange: 'all_exchange', token: 'usdt_eth' },
    valueKeys: ['netflow_total'] },
  { source: 'cq', metric: 'netflow', asset: 'usdc', path: '/stablecoin/exchange-flows/netflow',
    params: { window: 'day', exchange: 'all_exchange', token: 'usdc' },
    valueKeys: ['netflow_total'] },
  { source: 'cq', metric: 'miner_netflow', asset: 'btc', path: '/btc/miner-flows/netflow',
    params: { window: 'day', miner: 'all_miner' },
    valueKeys: ['netflow_total'] },
  { source: 'cq', metric: 'reserve', asset: 'btc', path: '/btc/exchange-flows/reserve',
    params: { window: 'day', exchange: 'all_exchange' },
    valueKeys: ['reserve', 'value'] },
  { source: 'cq', metric: 'stable_supply', asset: 'usdt', path: '/stablecoin/network-data/supply',
    params: { window: 'day', token: 'usdt_eth' },
    valueKeys: ['supply_total', 'supply_circulating'] },
  { source: 'cq', metric: 'stable_supply', asset: 'usdc', path: '/stablecoin/network-data/supply',
    params: { window: 'day', token: 'usdc' },
    valueKeys: ['supply_total', 'supply_circulating'] },
  { source: 'cq', metric: 'ssr', asset: 'btc', path: '/btc/market-indicator/stablecoin-supply-ratio',
    params: { window: 'day' },
    valueKeys: ['stablecoin_supply_ratio', 'ssr', 'value'] },
  { source: 'cq', metric: 'mvrv', asset: 'btc', path: '/btc/market-indicator/mvrv',
    params: { window: 'day' },
    valueKeys: ['mvrv', 'value'] },
  { source: 'cq', metric: 'whale_ratio', asset: 'btc', path: '/btc/flow-indicator/exchange-whale-ratio',
    params: { window: 'day', exchange: 'all_exchange' },
    valueKeys: ['exchange_whale_ratio'] },

  // Coinglass
  { source: 'cg', metric: 'funding_rate', asset: 'btc', path: '/futures/funding-rate/oi-weight-history',
    params: { symbol: 'BTC', interval: '1d' },
    valueKeys: ['close', 'fundingRate'] },
  { source: 'cg', metric: 'funding_rate', asset: 'eth', path: '/futures/funding-rate/oi-weight-history',
    params: { symbol: 'ETH', interval: '1d' },
    valueKeys: ['close', 'fundingRate'] },
  { source: 'cg', metric: 'long_short_ratio', asset: 'btc', path: '/futures/top-long-short-position-ratio/history',
    params: { symbol: 'BTCUSDT', exchange: 'Binance', interval: '1d' },
    valueKeys: ['top_position_long_short_ratio'] },
  { source: 'cg', metric: 'open_interest', asset: 'btc', path: '/futures/open-interest/aggregated-history',
    params: { symbol: 'BTC', interval: '1d' },
    valueKeys: ['close', 'openInterest'] },
  { source: 'cg', metric: 'open_interest', asset: 'eth', path: '/futures/open-interest/aggregated-history',
    params: { symbol: 'ETH', interval: '1d' },
    valueKeys: ['close', 'openInterest'] },
];

function pickValue(point: CQDataPoint, keys: string[]): number | null {
  for (const k of keys) {
    const v = point[k];
    if (v === undefined || v === null) continue;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickTimestamp(point: CQDataPoint): number | null {
  // Numeric epoch fields first.
  for (const k of ['t', 'time', 'timestamp', 'ts', 'createTime']) {
    const v = (point as Record<string, unknown>)[k];
    if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
    }
  }
  // Then date strings.
  const dateStr = point.date ?? point.datetime;
  if (typeof dateStr === 'string') {
    const trimmed = dateStr.trim();
    let iso = trimmed;
    if (/^\d{8}$/.test(trimmed)) {
      iso = `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}T00:00:00Z`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      iso = `${trimmed}T00:00:00Z`;
    } else if (/^\d{4}-\d{2}-\d{2}[ T]/.test(trimmed)) {
      iso = trimmed.replace(' ', 'T') + (trimmed.endsWith('Z') ? '' : 'Z');
    }
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

function rowsFromResult(result: SourceResult, valueKeys: string[]): SeriesPoint[] {
  if (!result.ok) return [];
  const out: SeriesPoint[] = [];
  for (const p of result.data) {
    const ts = pickTimestamp(p);
    const v = pickValue(p, valueKeys);
    if (ts === null || v === null) continue;
    out.push({ ts, value: v, payload: p });
  }
  return out;
}

async function runTask(task: Task, limit: number): Promise<{ ok: boolean; count: number; error?: string }> {
  const params = { ...task.params, limit };
  const result: SourceResult =
    task.source === 'cq'
      ? await cqFetch({ path: task.path, params } as CqFetchSpec)
      : await cgFetch({ path: task.path, params } as CgFetchSpec);

  if (!result.ok) {
    return { ok: false, count: 0, error: `${result.status} ${result.error}` };
  }
  const rows = rowsFromResult(result, task.valueKeys);
  upsertPoints(task.metric, task.asset, rows);
  return { ok: true, count: rows.length };
}

function eligibleTasks(): Task[] {
  const out: Task[] = [];
  for (const t of TASKS) {
    if (t.source === 'cq' && !hasCqKey()) continue;
    if (t.source === 'cg' && !hasCoinglassKey()) continue;
    out.push(t);
  }
  return out;
}

async function tick(): Promise<void> {
  const startedAt = Date.now();
  const tasks = eligibleTasks();
  console.log(`[collector] cycle start: ${tasks.length} tasks (limit=${INCREMENTAL_LIMIT})`);

  const summary: Record<string, string> = {};
  for (const t of tasks) {
    const taskStart = Date.now();
    const label = `${t.metric}/${t.asset}`;
    try {
      const r = await runTask(t, INCREMENTAL_LIMIT);
      const ms = Date.now() - taskStart;
      if (r.ok) {
        summary[label] = `ok(${r.count}, ${ms}ms)`;
        console.log(`[collector]   ok    ${label.padEnd(24)} ${r.count} pts in ${ms}ms`);
      } else {
        summary[label] = `err(${r.error})`;
        console.log(`[collector]   err   ${label.padEnd(24)} ${r.error} in ${ms}ms`);
      }
    } catch (err) {
      const ms = Date.now() - taskStart;
      const msg = err instanceof Error ? err.message : 'unknown';
      summary[label] = `throw(${msg})`;
      console.log(`[collector]   throw ${label.padEnd(24)} ${msg} in ${ms}ms`);
    }
  }

  insertSnapshot({ takenAt: startedAt, summary });
  const elapsed = Date.now() - startedAt;
  console.log(`[collector] cycle done in ${elapsed}ms`);
}

async function backfill(): Promise<void> {
  const tasks = eligibleTasks();
  console.log(`[collector] backfill start: ${tasks.length} tasks (limit=${BACKFILL_LIMIT})`);
  const startedAt = Date.now();

  for (const t of tasks) {
    const taskStart = Date.now();
    const label = `${t.metric}/${t.asset}`;
    try {
      const r = await runTask(t, BACKFILL_LIMIT);
      const ms = Date.now() - taskStart;
      if (r.ok) {
        console.log(`[collector]   ok    ${label.padEnd(24)} ${r.count} pts in ${ms}ms`);
      } else {
        console.log(`[collector]   err   ${label.padEnd(24)} ${r.error} in ${ms}ms`);
      }
    } catch (err) {
      const ms = Date.now() - taskStart;
      const msg = err instanceof Error ? err.message : 'unknown';
      console.log(`[collector]   throw ${label.padEnd(24)} ${msg} in ${ms}ms`);
    }
    // Throttle so we stay well within Coinglass's 30 req/min ceiling.
    await new Promise((r) => setTimeout(r, BACKFILL_THROTTLE_MS));
  }

  const elapsed = Date.now() - startedAt;
  console.log(`[collector] backfill done in ${elapsed}ms`);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));

  if (!hasCqKey()) {
    console.log('[collector] CRYPTOQUANT_API_KEY not set — CryptoQuant tasks will be skipped');
  }
  if (!hasCoinglassKey()) {
    console.log('[collector] COINGLASS_API_KEY not set — Coinglass tasks will be skipped');
  }

  if (args.has('--backfill')) {
    await backfill();
    process.exit(0);
  }

  console.log(`[collector] starting, poll interval ${POLL_INTERVAL_MS}ms`);
  await tick();
  setInterval(() => {
    tick().catch((err) => console.error('[collector] tick failed:', err));
  }, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error('[collector] fatal:', err);
  process.exit(1);
});
