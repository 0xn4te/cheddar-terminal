// /api/home/snapshot — single fan-out endpoint that powers the homepage
// ticker, dashboard cards, and status row. Polled every 60s by the browser.
//
// Architecture: Promise.allSettled across many independent upstreams. Any
// single failure drops only its data point — never the page. Server-side
// cache is 60s on the full snapshot; cards have their own internal 5-minute
// caches because their upstreams (DefiLlama, CryptoQuant) update slower
// than the ticker side.

import { Hono } from 'hono';
import { logActivity } from '../lib/activity.ts';
import { getCachedNgxQuotes } from './ngx.ts';
import { cqFetchMany, type CqFetchSpec } from '../cryptoquant.ts';
import { cgFetchMany, type CgFetchSpec } from '../coinglass.ts';
import { computeAltFlowIndex } from '../../src/lib/compute.ts';
import fundamentalsData from '../../src/data/ngx-fundamentals.json' with { type: 'json' };

// ─── types ────────────────────────────────────────────────────────────────

export interface TickerQuote {
  price: number;
  change24h: number | null;
}

export interface AltFlowCard {
  indexValue: number;
  band: 'RISK-ON' | 'NEUTRAL' | 'RISK-OFF';
  dotColor: string;
  lastUpdatedMs: number;
}

export interface CpvfCard {
  medianPS: number;
  topLeader: { name: string; rev24h: number };
  lastUpdatedMs: number;
}

export interface NgxvCard {
  medianPE: number;
  cheapest: { ticker: string; pbDelta: number };
  lastUpdatedMs: number;
}

export interface HomeSnapshot {
  fetchedAt: number;
  ticker: {
    BTC?: TickerQuote;
    ETH?: TickerQuote;
    SOL?: TickerQuote;
    XAU?: TickerQuote;
    SPX?: TickerQuote;
    USDNGN?: TickerQuote;
    ASI?: TickerQuote;
  };
  cards: {
    altflow?: AltFlowCard;
    cpvf?: CpvfCard;
    ngxv?: NgxvCard;
  };
}

interface FundamentalsStock {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  shares_outstanding: number;
  eps_ttm: number;
  book_value_per_share: number;
  dividend_per_share_ttm: number;
  avd_30d: number;
  last_updated: string;
  chart_symbol?: string;
}

interface FundamentalsFile {
  schema_version: number;
  universe_updated: string;
  fx_note: string;
  stocks: FundamentalsStock[];
}

const FUNDAMENTALS = fundamentalsData as FundamentalsFile;

// ─── caches ───────────────────────────────────────────────────────────────

const SNAPSHOT_TTL_MS = 60 * 1000;
const ALTFLOW_TTL_MS = 5 * 60 * 1000;
const CPVF_TTL_MS = 5 * 60 * 1000;
const ASI_TTL_MS = 60 * 60 * 1000;

let snapshotCache: { fetchedAt: number; data: HomeSnapshot } | null = null;
let altflowCache: { fetchedAt: number; data: AltFlowCard } | null = null;
let cpvfCache: { fetchedAt: number; data: CpvfCard } | null = null;
let asiCache: { fetchedAt: number; data: TickerQuote } | null = null;

const USER_AGENT =
  'Mozilla/5.0 (compatible; CheddarTerminal/0.1; +https://cheddarterminal.xyz)';

const REQ_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url: string, timeoutMs = REQ_TIMEOUT_MS): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json,text/csv,text/html,*/*' },
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─── ticker fan-out ───────────────────────────────────────────────────────

async function fetchCoinGecko(): Promise<{
  BTC?: TickerQuote;
  ETH?: TickerQuote;
  SOL?: TickerQuote;
}> {
  const url =
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true';
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) throw new Error('coingecko HTTP ' + resp.status);
  const j = (await resp.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
  const out: { BTC?: TickerQuote; ETH?: TickerQuote; SOL?: TickerQuote } = {};
  if (j.bitcoin?.usd != null) {
    out.BTC = {
      price: Number(j.bitcoin.usd),
      change24h: j.bitcoin.usd_24h_change != null ? Number(j.bitcoin.usd_24h_change) : null,
    };
  }
  if (j.ethereum?.usd != null) {
    out.ETH = {
      price: Number(j.ethereum.usd),
      change24h: j.ethereum.usd_24h_change != null ? Number(j.ethereum.usd_24h_change) : null,
    };
  }
  if (j.solana?.usd != null) {
    out.SOL = {
      price: Number(j.solana.usd),
      change24h: j.solana.usd_24h_change != null ? Number(j.solana.usd_24h_change) : null,
    };
  }
  return out;
}

// Stooq's free CSV quote endpoint. Format string `sd2t2c` returns
// Symbol, Date, Time, Close. We don't compute % change here (would require
// a second history call); the frontend renders `—` when change is null.
//
// Quirk: comma-separating multiple symbols when one starts with `^` (e.g.
// `xauusd,^spx`) returns a malformed body — Stooq mangles the parser. Hit
// each symbol separately and merge.
async function fetchStooqSymbol(symbol: string): Promise<number | null> {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2c&h&e=csv`;
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) return null;
  const body = await resp.text();
  const lines = body.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const cols = lines[1].split(',');
  if (cols.length < 4) return null;
  const close = parseFloat(cols[cols.length - 1]);
  return isFinite(close) && close > 0 ? close : null;
}

async function fetchStooq(): Promise<{ XAU?: TickerQuote; SPX?: TickerQuote }> {
  const [xau, spx] = await Promise.all([
    fetchStooqSymbol('xauusd').catch(() => null),
    fetchStooqSymbol('^spx').catch(() => null),
  ]);
  const out: { XAU?: TickerQuote; SPX?: TickerQuote } = {};
  if (xau != null) out.XAU = { price: xau, change24h: null };
  if (spx != null) out.SPX = { price: spx, change24h: null };
  if (!out.XAU && !out.SPX) throw new Error('stooq: both symbols failed');
  return out;
}

async function fetchUsdNgn(): Promise<{ USDNGN?: TickerQuote }> {
  const resp = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD');
  if (!resp.ok) throw new Error('er-api HTTP ' + resp.status);
  const j = (await resp.json()) as { rates?: Record<string, number> };
  const rate = j?.rates?.NGN;
  if (rate == null || !isFinite(Number(rate))) throw new Error('er-api: no NGN rate');
  return { USDNGN: { price: Number(rate), change24h: null } };
}

// kwayisi NGX homepage carries a sentence describing the day's ASI move.
// We scrape it once an hour — NGX trades end-of-day so a tighter cadence
// is wasted upstream traffic.
const ASI_RE =
  /\(ASI\)\s+(?:soared|fell|gained|dropped|rose|declined|advanced|retreated|climbed|slipped|plunged)\s+([\d,]+\.?\d*)\s+\((-?[\d.]+)%\)\s+points\s+to\s+close\s+at\s+([\d,]+\.?\d*)/i;
const ASI_NEG_VERBS = /fell|dropped|declined|retreated|slipped|plunged/i;

async function fetchAsi(): Promise<{ ASI?: TickerQuote }> {
  if (asiCache && Date.now() - asiCache.fetchedAt < ASI_TTL_MS) {
    return { ASI: asiCache.data };
  }
  const resp = await fetchWithTimeout('https://afx.kwayisi.org/ngx/');
  if (!resp.ok) throw new Error('kwayisi HTTP ' + resp.status);
  const body = await resp.text();
  const m = body.match(ASI_RE);
  if (!m) throw new Error('kwayisi: ASI sentence not found');
  const pct = parseFloat(m[2]);
  const close = parseFloat(m[3].replace(/,/g, ''));
  if (!isFinite(close) || close <= 0) throw new Error('kwayisi: ASI close NaN');
  const sign = ASI_NEG_VERBS.test(m[0]) ? -1 : 1;
  const quote: TickerQuote = { price: close, change24h: sign * pct };
  asiCache = { fetchedAt: Date.now(), data: quote };
  return { ASI: quote };
}

async function buildTicker(): Promise<HomeSnapshot['ticker']> {
  const merged: HomeSnapshot['ticker'] = {};
  const settled = await Promise.allSettled([
    fetchCoinGecko(),
    fetchStooq(),
    fetchUsdNgn(),
    fetchAsi(),
  ]);
  const labels = ['CoinGecko', 'Stooq', 'er-api USD/NGN', 'kwayisi ASI'];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      Object.assign(merged, r.value);
      logActivity({
        module: 'TICKER',
        action: 'FETCH',
        detail: labels[i],
        status: 'OK',
      });
    } else {
      logActivity({
        module: 'TICKER',
        action: 'FETCH',
        detail: `${labels[i]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
        status: 'FAIL',
      });
    }
  });
  return merged;
}

// ─── card: altflow ────────────────────────────────────────────────────────

const CQ_ALTFLOW_SPECS: Record<string, CqFetchSpec> = {
  btcNetflow: {
    path: '/btc/exchange-flows/netflow',
    params: { window: 'day', exchange: 'all_exchange', limit: 90 },
  },
  ethNetflow: {
    path: '/eth/exchange-flows/netflow',
    params: { window: 'day', exchange: 'all_exchange', limit: 90 },
  },
  stableUsdtSupply: {
    path: '/stablecoin/network-data/supply',
    params: { window: 'day', token: 'usdt_eth', limit: 90 },
  },
  stableUsdcSupply: {
    path: '/stablecoin/network-data/supply',
    params: { window: 'day', token: 'usdc', limit: 90 },
  },
  ssr: {
    path: '/btc/market-indicator/stablecoin-supply-ratio',
    params: { window: 'day', limit: 90 },
  },
};

const CG_ALTFLOW_SPECS: Record<string, CgFetchSpec> = {
  btcFundingRate: {
    path: '/futures/funding-rate/oi-weight-history',
    params: { symbol: 'BTC', interval: '1d', limit: 90 },
  },
  ethFundingRate: {
    path: '/futures/funding-rate/oi-weight-history',
    params: { symbol: 'ETH', interval: '1d', limit: 90 },
  },
};

function bandFor(score: number): {
  band: 'RISK-ON' | 'NEUTRAL' | 'RISK-OFF';
  dotColor: string;
} {
  if (score > 20) return { band: 'RISK-ON', dotColor: '#3FB950' };
  if (score < -20) return { band: 'RISK-OFF', dotColor: '#f04747' };
  return { band: 'NEUTRAL', dotColor: '#f5a623' };
}

async function buildAltflow(): Promise<AltFlowCard | null> {
  if (altflowCache && Date.now() - altflowCache.fetchedAt < ALTFLOW_TTL_MS) {
    logActivity({
      module: 'ALTFLOW',
      action: 'CACHE_HIT',
      detail: 'alt flow index',
      status: 'OK',
    });
    return altflowCache.data;
  }
  try {
    const [cq, cg] = await Promise.all([
      cqFetchMany(CQ_ALTFLOW_SPECS),
      cgFetchMany(CG_ALTFLOW_SPECS),
    ]);
    const result = computeAltFlowIndex({
      stableUsdt:
        cq.results.stableUsdtSupply.ok ? cq.results.stableUsdtSupply.data : null,
      stableUsdc:
        cq.results.stableUsdcSupply.ok ? cq.results.stableUsdcSupply.data : null,
      btcNetflow: cq.results.btcNetflow.ok ? cq.results.btcNetflow.data : null,
      ethNetflow: cq.results.ethNetflow.ok ? cq.results.ethNetflow.data : null,
      ssr: cq.results.ssr.ok ? cq.results.ssr.data : null,
      btcFunding:
        cg.results.btcFundingRate.ok ? cg.results.btcFundingRate.data : null,
      ethFunding:
        cg.results.ethFundingRate.ok ? cg.results.ethFundingRate.data : null,
    });
    if (result.score == null) {
      logActivity({
        module: 'ALTFLOW',
        action: 'CACHE_REFRESH',
        detail: 'no score (all components null)',
        status: 'FAIL',
      });
      return null;
    }
    const indexValue = Math.round(result.score);
    const meta = bandFor(indexValue);
    const card: AltFlowCard = {
      indexValue,
      band: meta.band,
      dotColor: meta.dotColor,
      lastUpdatedMs: Date.now(),
    };
    altflowCache = { fetchedAt: Date.now(), data: card };
    logActivity({
      module: 'ALTFLOW',
      action: 'CACHE_REFRESH',
      detail: `score ${indexValue >= 0 ? '+' : ''}${indexValue}`,
      status: 'OK',
    });
    return card;
  } catch (err) {
    logActivity({
      module: 'ALTFLOW',
      action: 'ERROR',
      detail: err instanceof Error ? err.message : String(err),
      status: 'FAIL',
    });
    return null;
  }
}

// ─── card: cpvf ───────────────────────────────────────────────────────────
// Lighter-weight than the full CPVF page aggregation. We hit DefiLlama's
// fees overview + protocols list once, parent-aggregate revenue by
// `parentProtocol` slug, and join against /protocols mcap. P/S = mcap ÷
// (annualized rev). Median across protocols where both numbers exist.
// `topLeader` is the protocol group with the highest 24h revenue.

interface DllamaFeeProtocol {
  slug?: string;
  name?: string;
  parentProtocol?: string;
  total24h?: number | string;
  total30d?: number | string;
}

interface DllamaProtocolsEntry {
  slug?: string;
  name?: string;
  parentProtocol?: string;
  mcap?: number | string;
}

const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

async function buildCpvf(): Promise<CpvfCard | null> {
  if (cpvfCache && Date.now() - cpvfCache.fetchedAt < CPVF_TTL_MS) {
    logActivity({
      module: 'CPVF',
      action: 'CACHE_HIT',
      detail: 'defillama overview',
      status: 'OK',
    });
    return cpvfCache.data;
  }
  try {
    const [revResp, protResp] = await Promise.all([
      fetchWithTimeout(
        'https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyRevenue',
      ),
      fetchWithTimeout('https://api.llama.fi/protocols'),
    ]);
    if (!revResp.ok) throw new Error('fees HTTP ' + revResp.status);
    if (!protResp.ok) throw new Error('protocols HTTP ' + protResp.status);
    const revData = (await revResp.json()) as { protocols?: DllamaFeeProtocol[] };
    const protData = (await protResp.json()) as DllamaProtocolsEntry[];
    if (!revData?.protocols || !Array.isArray(protData)) throw new Error('shape');

    // Aggregate revenue under parent slug. Standalone protocols use their
    // own slug as the group key.
    interface Group {
      key: string;
      name: string;
      total24h: number;
      total30d: number;
    }
    const groups = new Map<string, Group>();
    for (const p of revData.protocols) {
      const parent = p.parentProtocol
        ? p.parentProtocol.replace(/^parent#/i, '').toLowerCase()
        : (p.slug || p.name || '').toLowerCase();
      if (!parent) continue;
      const g = groups.get(parent) ?? {
        key: parent,
        name: p.name || parent,
        total24h: 0,
        total30d: 0,
      };
      g.total24h += num(p.total24h);
      g.total30d += num(p.total30d);
      groups.set(parent, g);
    }

    // Mcap lookup: prefer rows where `parentProtocol` is empty (the parent
    // entry itself) but fall back to slug match.
    const mcapBySlug = new Map<string, number>();
    const nameBySlug = new Map<string, string>();
    for (const p of protData) {
      const slug = (p.slug || '').toLowerCase();
      if (!slug) continue;
      if (!p.parentProtocol) {
        mcapBySlug.set(slug, num(p.mcap));
        if (p.name) nameBySlug.set(slug, p.name);
      } else {
        const parent = p.parentProtocol.replace(/^parent#/i, '').toLowerCase();
        // Sum sub-protocol mcaps under the parent if the parent itself isn't
        // in /protocols (orphan parent — see CPVF SLUG_OVERRIDES in CryptoValuation.tsx).
        if (!mcapBySlug.has(parent)) {
          mcapBySlug.set(parent, (mcapBySlug.get(parent) ?? 0) + num(p.mcap));
        }
      }
    }

    const psValues: number[] = [];
    let leader: { name: string; rev24h: number } | null = null;
    for (const g of groups.values()) {
      if (g.total24h > (leader?.rev24h ?? 0)) {
        leader = { name: nameBySlug.get(g.key) ?? g.name, rev24h: g.total24h };
      }
      const mcap = mcapBySlug.get(g.key) ?? 0;
      const annRev = g.total30d * 12; // annualize trailing-30d
      if (mcap > 0 && annRev > 0) {
        const ps = mcap / annRev;
        // Filter implausible outliers (>5,000×) to keep the median sane.
        if (ps > 0 && ps < 5_000) psValues.push(ps);
      }
    }

    if (psValues.length === 0 || !leader) {
      logActivity({
        module: 'CPVF',
        action: 'CACHE_REFRESH',
        detail: 'insufficient data',
        status: 'FAIL',
      });
      return null;
    }
    psValues.sort((a, b) => a - b);
    const medianPS = psValues[Math.floor(psValues.length / 2)];
    const card: CpvfCard = {
      medianPS,
      topLeader: leader,
      lastUpdatedMs: Date.now(),
    };
    cpvfCache = { fetchedAt: Date.now(), data: card };
    logActivity({
      module: 'CPVF',
      action: 'CACHE_REFRESH',
      detail: `med P/S ${medianPS.toFixed(1)}x · leader ${leader.name}`,
      status: 'OK',
    });
    return card;
  } catch (err) {
    logActivity({
      module: 'CPVF',
      action: 'ERROR',
      detail: err instanceof Error ? err.message : String(err),
      status: 'FAIL',
    });
    return null;
  }
}

// ─── card: ngxv ───────────────────────────────────────────────────────────

function buildNgxv(): NgxvCard | null {
  const cached = getCachedNgxQuotes();
  const livePrices = cached?.quotes ?? {};

  // Same enrichment shape as the NGXV page: live price overrides JSON when
  // available; P/E suppressed when EPS ≤ 0; P/B Δ vs in-universe sector median.
  const rows = FUNDAMENTALS.stocks.map((s) => {
    const liveKey = (s.chart_symbol || s.ticker).toUpperCase();
    const live = livePrices[liveKey];
    const price = live && live.price > 0 ? live.price : Number(s.price) || 0;
    const pe = s.eps_ttm > 0 && price > 0 ? price / s.eps_ttm : null;
    const pb =
      s.book_value_per_share > 0 && price > 0 ? price / s.book_value_per_share : null;
    return { ticker: s.ticker, sector: s.sector, pe, pb };
  });

  const peValues = rows.map((r) => r.pe).filter((x): x is number => x != null && x > 0);
  if (peValues.length === 0) return null;
  peValues.sort((a, b) => a - b);
  const medianPE = peValues[Math.floor(peValues.length / 2)];

  const sectorPbMedians: Record<string, number> = {};
  const bySector: Record<string, typeof rows> = {};
  rows.forEach((r) => {
    if (!bySector[r.sector]) bySector[r.sector] = [];
    bySector[r.sector].push(r);
  });
  for (const [sec, group] of Object.entries(bySector)) {
    const pbs = group
      .map((r) => r.pb)
      .filter((x): x is number => x != null && x > 0)
      .sort((a, b) => a - b);
    if (pbs.length > 0) sectorPbMedians[sec] = pbs[Math.floor(pbs.length / 2)];
  }

  let cheapest: { ticker: string; pbDelta: number } | null = null;
  for (const r of rows) {
    const med = sectorPbMedians[r.sector];
    if (med == null || r.pb == null) continue;
    const delta = ((r.pb - med) / med) * 100;
    if (cheapest == null || delta < cheapest.pbDelta) {
      cheapest = { ticker: r.ticker, pbDelta: delta };
    }
  }
  if (!cheapest) return null;

  return {
    medianPE,
    cheapest,
    lastUpdatedMs: cached?.fetchedAt ?? Date.now(),
  };
}

// ─── snapshot route ───────────────────────────────────────────────────────

export const homeRoute = new Hono();

homeRoute.get('/snapshot', async (c) => {
  if (snapshotCache && Date.now() - snapshotCache.fetchedAt < SNAPSHOT_TTL_MS) {
    return c.json(snapshotCache.data);
  }

  logActivity({
    module: 'HOME',
    action: 'FETCH',
    detail: 'snapshot fan-out',
    status: 'OK',
  });

  const [ticker, altflow, cpvf] = await Promise.all([
    buildTicker(),
    buildAltflow(),
    buildCpvf(),
  ]);
  const ngxv = buildNgxv();

  const data: HomeSnapshot = {
    fetchedAt: Date.now(),
    ticker,
    cards: {
      ...(altflow ? { altflow } : {}),
      ...(cpvf ? { cpvf } : {}),
      ...(ngxv ? { ngxv } : {}),
    },
  };
  snapshotCache = { fetchedAt: data.fetchedAt, data };
  return c.json(data);
});
