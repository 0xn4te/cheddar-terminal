import type { CQDataPoint, SourceResult, SourceStatus } from './types.ts';

// CryptoQuant v1 response shape per endpoint, as observed on Pro tier.
// Field-name fallback lists live in src/lib/compute.ts; update both places
// if you add an endpoint with a new key shape.
//
//   /btc/exchange-flows/netflow      → { date, netflow_total }              # BTC units; *_usd is Premium-tier
//   /btc/exchange-flows/reserve      → { date, reserve, reserve_usd }       # BTC units
//   /btc/market-indicator/stablecoin-supply-ratio
//                                    → { date, stablecoin_supply_ratio }    # NUMERIC STRING, not number
//   /btc/market-indicator/mvrv       → { date, mvrv }
//   /eth/exchange-flows/netflow      → { date, netflow_total }              # ETH units
//   /stablecoin/network-data/supply  → { date, supply_total, supply_circulating, supply_minted, supply_burned, ... }
//                                       # required: token (usdt_eth | usdc | all_token | dai | ...)
//
// Discover everything: GET /v1/discovery/endpoints?format=json (245 entries
// at last check). Don't guess a path — use discovery, then verify shape with
// `node --import tsx verify-index.mjs` from the project root.

const BASE = 'https://api.cryptoquant.com/v1';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  expiresAt: number;
  value: SourceResult;
}

const cache = new Map<string, CacheEntry>();

export function cacheSize(): number {
  return cache.size;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.CRYPTOQUANT_API_KEY);
}

export interface CqFetchSpec {
  path: string;
  params?: Record<string, string | number>;
}

function buildUrl(spec: CqFetchSpec): string {
  const url = new URL(BASE + (spec.path.startsWith('/') ? spec.path : '/' + spec.path));
  if (spec.params) {
    for (const [k, v] of Object.entries(spec.params)) {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function cqFetch(spec: CqFetchSpec): Promise<SourceResult> {
  const url = buildUrl(spec);
  const now = Date.now();

  const cached = cache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const token = process.env.CRYPTOQUANT_API_KEY;
  if (!token) {
    return { ok: false, error: 'CRYPTOQUANT_API_KEY not set', status: 0 };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
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

  const data = extractData(payload);
  if (!data) {
    return {
      ok: false,
      status: res.status,
      error: 'unrecognized response shape',
    };
  }

  const value: SourceResult = { ok: true, data };
  cache.set(url, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

function extractData(payload: unknown): CQDataPoint[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  // CryptoQuant v1: { status: {...}, result: { data: [...] } }
  const result = obj.result as Record<string, unknown> | undefined;
  if (result && Array.isArray(result.data)) {
    return result.data as CQDataPoint[];
  }
  // Fallback: { data: [...] }
  if (Array.isArray(obj.data)) {
    return obj.data as CQDataPoint[];
  }
  // Some endpoints return the array directly.
  if (Array.isArray(payload)) {
    return payload as CQDataPoint[];
  }
  return null;
}

export async function cqFetchMany<K extends string>(
  specs: Record<K, CqFetchSpec>,
): Promise<{
  results: Record<K, SourceResult>;
  sources: Record<K, SourceStatus>;
}> {
  const keys = Object.keys(specs) as K[];
  const settled = await Promise.all(keys.map((k) => cqFetch(specs[k])));

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
