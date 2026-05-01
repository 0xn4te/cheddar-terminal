import { Hono } from 'hono';
import { metricDepth, queryRange } from '../db.ts';
import type { HistoryResponse } from '../types.ts';

export const historyRoute = new Hono();

// Whitelist of valid (metric, asset) pairs. Anything not listed here returns
// 400 — keeps callers from probing arbitrary table contents.
const ALLOWED: Record<string, Set<string>> = {
  netflow: new Set(['btc', 'eth', 'usdt', 'usdc']),
  miner_netflow: new Set(['btc']),
  reserve: new Set(['btc']),
  stable_supply: new Set(['usdt', 'usdc']),
  ssr: new Set(['btc']),
  mvrv: new Set(['btc']),
  whale_ratio: new Set(['btc']),
  funding_rate: new Set(['btc', 'eth']),
  long_short_ratio: new Set(['btc']),
  open_interest: new Set(['btc', 'eth']),
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseTs(raw: string | undefined, fallback: number): number | null {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

historyRoute.get('/', (c) => {
  const metric = c.req.query('metric');
  const asset = c.req.query('asset');

  if (!metric || !asset) {
    return c.json({ error: 'metric and asset are required' }, 400);
  }
  if (!ALLOWED[metric] || !ALLOWED[metric].has(asset)) {
    const valid = Object.entries(ALLOWED)
      .map(([m, set]) => `${m}=[${[...set].join(',')}]`)
      .join('; ');
    return c.json({ error: `unknown metric/asset combination. Valid: ${valid}` }, 400);
  }

  const now = Date.now();
  const since = parseTs(c.req.query('since'), now - 365 * DAY_MS);
  const until = parseTs(c.req.query('until'), now);
  if (since === null || until === null) {
    return c.json({ error: 'since and until must be non-negative unix-ms numbers' }, 400);
  }
  if (since > until) {
    return c.json({ error: 'since must be <= until' }, 400);
  }

  const points = queryRange(metric, asset, since, until);
  const depth = metricDepth(metric, asset);
  const archiveDepthDays =
    depth.oldest === null
      ? 0
      : Math.floor((now - depth.oldest) / DAY_MS);

  const body: HistoryResponse = { metric, asset, points, archiveDepthDays };
  return c.json(body);
});
