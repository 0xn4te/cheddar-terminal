import type { CQDataPoint, SourceResult, SourceStatus } from './types.ts';

// Coinglass v4 client. Mirrors server/cryptoquant.ts in shape so the rest of
// the backend treats both the same: SourceResult in, SourceResult out, same
// in-memory cache TTL, same fetch-many helper.
//
// Two things differ from CryptoQuant:
//
//   1. Auth header is `CG-API-KEY: <key>`, NOT `Authorization: Bearer <key>`.
//      Don't reuse cqFetch — the headers are wrong.
//
//   2. Response envelope varies by endpoint family. The aggregated-funding
//      and aggregated-OI endpoints (used here) return:
//          { code: "0", msg: "success", data: [...] }
//      with `data` already sorted oldest-first (opposite of CryptoQuant).
//      We normalize to most-recent-first internally so all the helpers in
//      src/lib/compute.ts work without changes.
//
// Endpoint shapes observed in this project:
//
//   /futures/funding-rate/oi-weight-history
//     params: symbol=BTC|ETH, interval=1d, limit
//     point shape (post-normalize): { datetime: string, close: number|string }
//     `close` is the OI-weighted funding rate at the candle close. We pick
//     it as the canonical value via FUNDING_RATE_KEYS in compute.ts.
//
//   /futures/open-interest/aggregated-history
//     params: symbol=BTC|ETH, interval=1d, limit
//     point shape: { datetime, close, open, high, low }
//     `close` is aggregated OI in USD at candle close.
//
//   /futures/top-long-short-position-ratio/history
//     params: symbol=BTC, interval=1d, limit, exchange=Binance
//     point shape: { datetime, longShortRatio: number|string }

const BASE = 'https://open-api-v4.coinglass.com/api';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  expiresAt: number;
  value: SourceResult;
}

const cache = new Map<string, CacheEntry>();

export function cacheSize(): number {
  return cache.size;
}

export function hasCoinglassKey(): boolean {
  return Boolean(process.env.COINGLASS_API_KEY);
}

export interface CgFetchSpec {
  path: string;
  params?: Record<string, string | number>;
}

function buildUrl(spec: CgFetchSpec): string {
  const url = new URL(BASE + (spec.path.startsWith('/') ? spec.path : '/' + spec.path));
  if (spec.params) {
    for (const [k, v] of Object.entries(spec.params)) {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function cgFetch(spec: CgFetchSpec): Promise<SourceResult> {
  const url = buildUrl(spec);
  const now = Date.now();

  const cached = cache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const token = process.env.COINGLASS_API_KEY;
  if (!token) {
    return { ok: false, error: 'COINGLASS_API_KEY not set', status: 0 };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'CG-API-KEY': token,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'fetch failed',
      status: 0,
    };
  }

  if (!res.ok) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      // ignore
    }
    return {
      ok: false,
      status: res.status,
      error: bodyText.slice(0, 240) || res.statusText || 'request failed',
    };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch (err) {
    return {
      ok: false,
      status: res.status,
      error: err instanceof Error ? err.message : 'invalid json',
    };
  }

  const envelope = inspectEnvelope(payload);
  if (envelope.error) {
    return { ok: false, status: res.status, error: envelope.error };
  }
  const data = envelope.data;
  if (!data) {
    return {
      ok: false,
      status: res.status,
      error: 'unrecognized response shape',
    };
  }

  // Coinglass returns oldest-first. Reverse so internal storage matches the
  // CryptoQuant convention (most-recent-first) and compute.ts helpers work
  // unchanged. Each point gets a `date` field derived from `datetime` /
  // `time` / `t` so timelineFor() can parse it.
  const normalized = normalizePoints(data);

  const value: SourceResult = { ok: true, data: normalized };
  cache.set(url, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

interface Envelope {
  data: CQDataPoint[] | null;
  error: string | null;
}

function inspectEnvelope(payload: unknown): Envelope {
  if (!payload || typeof payload !== 'object') {
    return { data: null, error: null };
  }
  const obj = payload as Record<string, unknown>;

  // Application-level error: { code: "30001", msg: "...", success: false }
  // Coinglass uses code "0" for success.
  if (typeof obj.code === 'string' && obj.code !== '0' && obj.code !== '00000') {
    const msg = typeof obj.msg === 'string' ? obj.msg : `code ${obj.code}`;
    return { data: null, error: msg };
  }
  if (obj.success === false) {
    const msg = typeof obj.msg === 'string' ? obj.msg : 'request failed';
    return { data: null, error: msg };
  }

  if (Array.isArray(obj.data)) {
    return { data: obj.data as CQDataPoint[], error: null };
  }
  // Some endpoints nest one level deeper.
  if (obj.data && typeof obj.data === 'object') {
    const inner = obj.data as Record<string, unknown>;
    if (Array.isArray(inner.list)) {
      return { data: inner.list as CQDataPoint[], error: null };
    }
    if (Array.isArray(inner.data)) {
      return { data: inner.data as CQDataPoint[], error: null };
    }
  }
  if (Array.isArray(payload)) {
    return { data: payload as CQDataPoint[], error: null };
  }
  return { data: null, error: null };
}

function normalizePoints(points: CQDataPoint[]): CQDataPoint[] {
  if (points.length === 0) return points;

  // Detect ordering: compare first vs last timestamp. If first is earlier,
  // reverse to get most-recent-first.
  const firstTs = pointTimestamp(points[0]);
  const lastTs = pointTimestamp(points[points.length - 1]);
  const isOldestFirst = firstTs !== null && lastTs !== null && firstTs < lastTs;

  const ordered = isOldestFirst ? points.slice().reverse() : points.slice();

  // Add a `date` (YYYY-MM-DD) field derived from the timestamp / datetime,
  // so the rest of the pipeline (which keys off `date` or `datetime`) works.
  return ordered.map((p) => {
    const out: CQDataPoint = { ...p };
    if (!out.date && !out.datetime) {
      const ts = pointTimestamp(p);
      if (ts !== null) {
        out.date = new Date(ts).toISOString().slice(0, 10);
      }
    }
    return out;
  });
}

function pointTimestamp(p: CQDataPoint): number | null {
  // Try numeric timestamp fields first.
  for (const k of ['t', 'time', 'timestamp', 'ts', 'createTime']) {
    const v = (p as Record<string, unknown>)[k];
    if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
    }
  }
  // Then string datetime / date.
  for (const k of ['datetime', 'date']) {
    const v = (p as Record<string, unknown>)[k];
    if (typeof v === 'string') {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    }
  }
  return null;
}

export async function cgFetchMany<K extends string>(
  specs: Record<K, CgFetchSpec>,
): Promise<{
  results: Record<K, SourceResult>;
  sources: Record<K, SourceStatus>;
}> {
  const keys = Object.keys(specs) as K[];
  const settled = await Promise.all(keys.map((k) => cgFetch(specs[k])));

  const results = {} as Record<K, SourceResult>;
  const sources = {} as Record<K, SourceStatus>;

  keys.forEach((k, i) => {
    const r = settled[i];
    results[k] = r;
    sources[k] = r.ok
      ? { ok: true }
      : { ok: false, status: r.status, error: r.error };
  });

  return { results, sources };
}

export function clearCache(): void {
  cache.clear();
}
