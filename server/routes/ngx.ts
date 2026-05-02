import { Hono } from 'hono';

// Free public sources for NGX prices, no API key.
//
// Primary  : afx.kwayisi.org/ngx/{ticker}.html — per-ticker page.
// Fallback : ngxgroup.com/exchange/data/equities-price-list/ — single page
//            with the full list (used to fill gaps when kwayisi 404s or
//            rate-limits us on too many tickers).
//
// Server-side cache: 1 hour. NGX trades end-of-day, so polling more often
// than that is wasted upstream traffic.

export interface NgxQuote {
  ticker: string;
  price: number;
  asof: string;
  source: 'kwayisi' | 'ngxgroup';
}

interface NgxCacheEntry {
  fetchedAt: number;
  quotes: Record<string, NgxQuote>;
}

let ngxCache: NgxCacheEntry | null = null;
const NGX_CACHE_TTL_MS = 60 * 60 * 1000;

const USER_AGENT =
  'Mozilla/5.0 (compatible; CheddarTerminal/0.1; +https://cheddarterminal.xyz)';

const KWAYISI_BASE = 'https://afx.kwayisi.org/ngx';
const NGXGROUP_URL = 'https://ngxgroup.com/exchange/data/equities-price-list/';

const REQ_TIMEOUT_MS = 10_000;
const KWAYISI_CONCURRENCY = 8;

function filterQuotes(
  quotes: Record<string, NgxQuote>,
  wanted: string[],
): Record<string, NgxQuote> {
  if (wanted.length === 0) return {};
  const out: Record<string, NgxQuote> = {};
  for (const t of wanted) {
    const q = quotes[t];
    if (q) out[t] = q;
  }
  return out;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// Concurrency-capped map. Avoids adding p-limit / p-map dependencies.
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

const KWAYISI_PRICE_RE =
  /current share price of [^(]+\(([A-Z0-9]+)\)\s+is\s+NGN\s+([\d,]+\.?\d*)/i;
const KWAYISI_ASOF_RE = /closed its last trading day \(([^)]+)\)/i;

function parseKwayisi(body: string): { ticker: string; price: number; asof: string } | null {
  const m = body.match(KWAYISI_PRICE_RE);
  if (!m) return null;
  const ticker = m[1].toUpperCase();
  const price = parseFloat(m[2].replace(/,/g, ''));
  if (!isFinite(price) || price <= 0) return null;
  const asofMatch = body.match(KWAYISI_ASOF_RE);
  const parsed = asofMatch ? new Date(asofMatch[1]) : null;
  const asof =
    parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
  return { ticker, price, asof };
}

async function scrapeKwayisi(ticker: string): Promise<NgxQuote | null> {
  const url = `${KWAYISI_BASE}/${ticker.toLowerCase()}.html`;
  try {
    const resp = await fetchWithTimeout(url, REQ_TIMEOUT_MS);
    if (!resp.ok) return null;
    const body = await resp.text();
    const parsed = parseKwayisi(body);
    if (!parsed) return null;
    return { ...parsed, source: 'kwayisi' };
  } catch {
    return null;
  }
}

const NGXGROUP_RE = /([A-Z][A-Z0-9]+)(?:\s\[\w+\])?\s+N([\d,]+\.?\d*)\s+(-?[\d.]+)\s%/g;

function parseNgxGroupList(body: string): Record<string, NgxQuote> {
  const out: Record<string, NgxQuote> = {};
  const asof = new Date().toISOString();
  let m: RegExpExecArray | null;
  NGXGROUP_RE.lastIndex = 0;
  while ((m = NGXGROUP_RE.exec(body)) != null) {
    const ticker = m[1].toUpperCase();
    const price = parseFloat(m[2].replace(/,/g, ''));
    if (!isFinite(price) || price <= 0) continue;
    out[ticker] = { ticker, price, asof, source: 'ngxgroup' };
  }
  return out;
}

async function scrapeNgxGroupList(): Promise<Record<string, NgxQuote>> {
  try {
    const resp = await fetchWithTimeout(NGXGROUP_URL, REQ_TIMEOUT_MS);
    if (!resp.ok) return {};
    const body = await resp.text();
    return parseNgxGroupList(body);
  } catch {
    return {};
  }
}

async function scrapeNgxPrices(tickers: string[]): Promise<Record<string, NgxQuote>> {
  if (tickers.length === 0) return {};

  const primary = await mapWithLimit(tickers, KWAYISI_CONCURRENCY, scrapeKwayisi);
  const merged: Record<string, NgxQuote> = {};
  let kwayisiHits = 0;
  for (let i = 0; i < tickers.length; i++) {
    const q = primary[i];
    if (q) {
      merged[tickers[i]] = q;
      kwayisiHits++;
    }
  }

  // If kwayisi covered <50% of requested tickers, hit ngxgroup once and fill gaps.
  const hitRatio = kwayisiHits / tickers.length;
  if (hitRatio < 0.5) {
    const fallback = await scrapeNgxGroupList();
    for (const t of tickers) {
      if (!merged[t] && fallback[t]) merged[t] = fallback[t];
    }
  }

  return merged;
}

export const ngxRoute = new Hono();

ngxRoute.get('/prices', async (c) => {
  const tickersParam = c.req.query('tickers');
  const refresh = c.req.query('refresh') === '1';
  if (!tickersParam) return c.json({ error: 'tickers param required' }, 400);

  const wanted = tickersParam
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  if (wanted.length === 0) return c.json({ error: 'no valid tickers' }, 400);

  const cacheFresh = ngxCache && Date.now() - ngxCache.fetchedAt < NGX_CACHE_TTL_MS;
  if (!refresh && cacheFresh && ngxCache) {
    return c.json({
      fetchedAt: ngxCache.fetchedAt,
      stale: false,
      quotes: filterQuotes(ngxCache.quotes, wanted),
    });
  }

  try {
    const quotes = await scrapeNgxPrices(wanted);
    if (Object.keys(quotes).length === 0) {
      throw new Error('no quotes returned from any source');
    }
    ngxCache = { fetchedAt: Date.now(), quotes };
    return c.json({
      fetchedAt: ngxCache.fetchedAt,
      stale: false,
      quotes: filterQuotes(quotes, wanted),
    });
  } catch (err) {
    console.error('[ngx-scraper] failed:', err);
    if (ngxCache) {
      return c.json({
        fetchedAt: ngxCache.fetchedAt,
        stale: true,
        quotes: filterQuotes(ngxCache.quotes, wanted),
      });
    }
    return c.json({ error: 'scraper failed, no cache', fallback: true }, 503);
  }
});
