import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TOKENS, TERMINAL_GLOBAL_CSS, TopBar, BottomBar } from './_TerminalShell';
import { ProtocolModal } from '../components/cpvf/ProtocolModal';
import type { ProtocolRow, SubEntry } from '../components/cpvf/types';

// ─── types ────────────────────────────────────────────────────────────────

interface DefiLlamaProtocolEntry {
  slug?: string;
  name?: string;
  parentProtocol?: string;
  mcap?: number | string;
  tvl?: number | string;
  gecko_id?: string;
  logo?: string;
  category?: string;
}

interface DefiLlamaFeeEntry {
  slug?: string;
  name?: string;
  displayName?: string;
  parentProtocol?: string;
  category?: string;
  chains?: string[];
  logo?: string;
  total24h?: number | string;
  total7d?: number | string;
  total30d?: number | string;
  total1y?: number | string;
  change_7d?: number | string;
  change_30dover30d?: number | string;
}

interface SlugOverride {
  name: string;
  gecko_id: string;
}

interface ResolvedProtocol {
  name: string;
  slug: string;
  category: string;
  chains: string[];
  logo: string | null;
  mcap: number;
  tvl: number;
  gecko_id: string | null;
  total24h: number;
  total7d: number;
  total30d: number;
  total1y: number;
  change_7d: number | null;
  change_30d: number | null;
  subCount: number;
  subNames: string[];
  subEntries: SubEntry[];
  aggregated: boolean;
  fdv: number;
  mcapSource: 'defillama' | 'coingecko' | 'user-override' | null;
  dexscreener: string | null;
}

interface ScreenerCounts {
  feeEntries: number;
  aggregatedGroups: number;
  protocolsWithMcap: number;
  protocolsWithMcapBackfilled: number;
  protocolsWithFdv: number;
  protocolsWithTvl: number;
  protocolsWithRev: number;
  protocolsWithBoth: number;
}

interface ScreenerData {
  protocols: ResolvedProtocol[];
  counts: ScreenerCounts;
  fdvError: string | null;
}

type ValuationMode = 'mcap' | 'fdv';
type Period = '7d' | '30d';
type SortDir = 'asc' | 'desc';
type SortKey =
  | 'name' | 'category' | 'mcap' | 'fdv' | 'tvl'
  | 'rev24h' | 'rev30d' | 'rev7d' | 'annRev' | 'ps' | 'revTvl'
  | 'change' | 'change30';

// EnrichedProtocol = ResolvedProtocol + computed fields. Equivalent to the
// shared `ProtocolRow` type so the modal can consume it directly.
interface EnrichedProtocol extends ResolvedProtocol, ProtocolRow {
  rev24h: number;
  rev7d: number;
  rev30d: number;
}

type MatchResult =
  | { status: 'match'; id: string; name: string; symbol: string; mcap: number; fdv: number }
  | { status: 'no_mcap'; id: string; name: string; symbol: string }
  | { status: 'not_found' };

// ─── formatting ──────────────────────────────────────────────────────────

const fmtUsd = (n: number | null | undefined): string => {
  if (n == null || n === 0 || isNaN(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(1) + 'K';
  return sign + '$' + abs.toFixed(0);
};

const fmtPs = (n: number | null | undefined): string => {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  if (n < 1) return n.toFixed(2) + '×';
  if (n < 10) return n.toFixed(1) + '×';
  if (n < 1000) return Math.round(n) + '×';
  return '999+×';
};

const fmtPct = (n: number | null | undefined): string => {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  if (Math.abs(n) >= 1000) return sign + Math.round(n) + '%';
  return sign + n.toFixed(1) + '%';
};

// Rev/TVL is a fractional yield (0.05 = 5%). Distinct from fmtPct (signed Δ).
const fmtYield = (n: number | null | undefined): string => {
  if (n == null || isNaN(n) || !isFinite(n) || n === 0) return '—';
  const pct = n * 100;
  const abs = Math.abs(pct);
  if (abs >= 1000) return '999+%';
  if (abs >= 100) return Math.round(pct) + '%';
  return pct.toFixed(abs >= 1 ? 1 : 2) + '%';
};

const slugify = (s: string | undefined): string =>
  (s || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

const keyify = (s: string | undefined): string => (s || '').toLowerCase().trim();

// ─── color helpers ────────────────────────────────────────────────────────

const psColor = (ps: number | null | undefined): string => {
  if (ps == null) return TOKENS.textDim;
  if (ps < 5) return TOKENS.green;
  if (ps < 15) return TOKENS.text;
  if (ps < 40) return TOKENS.text;
  if (ps < 100) return TOKENS.amber;
  return TOKENS.red;
};

const pctColor = (p: number | null | undefined): string => {
  if (p == null || isNaN(p)) return TOKENS.textMuted;
  if (p > 0) return TOKENS.green;
  if (p < 0) return TOKENS.red;
  return TOKENS.textMuted;
};

// Higher annualized revenue per $ of TVL = more capital-efficient.
// Only exceptional efficiency lights up green; typical DeFi (lending, most
// DEXs) is dim by design so the eye finds the genuine outliers.
const yieldColor = (y: number | null | undefined): string => {
  if (y == null || !isFinite(y)) return TOKENS.textDim;
  if (y > 0.50) return TOKENS.green;
  if (y >= 0.10) return TOKENS.text;
  return TOKENS.textDim;
};

// ─── overrides ───────────────────────────────────────────────────────────
// Manual overrides for protocols where DefiLlama is missing identity data.
// Two cases this fixes:
//   1. Orphan parents: no /protocols entry exists for the parent slug at all
//      (e.g. Hyperliquid — only the Bridge child appears in /protocols).
//   2. Incomplete parents: /protocols has the entry but no gecko_id, so the
//      CoinGecko mcap/FDV backfill never fires (e.g. Collector Crypt).
// Keys are lower-case DefiLlama parent slugs (the thing after "parent#").
const SLUG_OVERRIDES: Record<string, SlugOverride> = {
  hyperliquid:       { name: 'Hyperliquid',     gecko_id: 'hyperliquid' },
  uniswap:           { name: 'Uniswap',         gecko_id: 'uniswap' },
  pancakeswap:       { name: 'PancakeSwap',     gecko_id: 'pancakeswap-token' },
  chainlink:         { name: 'Chainlink',       gecko_id: 'chainlink' },
  maker:             { name: 'Sky',             gecko_id: 'sky' },
  aerodrome:         { name: 'Aerodrome',       gecko_id: 'aerodrome-finance' },
  pump:              { name: 'Pump.fun',        gecko_id: 'pump-fun' },
  edgex:             { name: 'edgeX',           gecko_id: 'edgex' },
  'ether-fi':        { name: 'Ether.fi',        gecko_id: 'ether-fi' },
  lighter:           { name: 'Lighter',         gecko_id: 'lighter' },
  'collector-crypt': { name: 'Collector Crypt', gecko_id: 'collector-crypt' },
  raydium:           { name: 'Raydium',         gecko_id: 'raydium' },
  'maple-finance':   { name: 'Maple Finance',   gecko_id: 'syrup' },
  meteora:           { name: 'Meteora',         gecko_id: 'meteora' },
  bonkfun:           { name: 'BONK.fun',        gecko_id: 'bonk' },
  sosovalue:         { name: 'SoSoValue',       gecko_id: 'sosovalue' },
};

// ─── DexScreener chain map ───────────────────────────────────────────────

const CG_TO_DS_CHAIN: Record<string, string> = {
  'ethereum': 'ethereum',
  'binance-smart-chain': 'bsc',
  'polygon-pos': 'polygon',
  'avalanche': 'avalanche',
  'arbitrum-one': 'arbitrum',
  'optimistic-ethereum': 'optimism',
  'solana': 'solana',
  'base': 'base',
  'blast': 'blast',
  'sei-network': 'sei',
  'sui': 'sui',
  'the-open-network': 'ton',
  'hyperliquid': 'hyperliquid',
  'tron': 'tron',
  'fantom': 'fantom',
  'celo': 'celo',
  'cronos': 'cronos',
  'gnosis': 'gnosis',
  'linea': 'linea',
  'mantle': 'mantle',
  'metis-andromeda': 'metis',
  'moonbeam': 'moonbeam',
  'opbnb': 'opbnb',
  'osmosis': 'osmosis',
  'polygon-zkevm': 'polygonzkevm',
  'scroll': 'scroll',
  'zksync': 'zksync',
  'zora': 'zora',
  'aptos': 'aptos',
  'berachain': 'berachain',
  'sonic': 'sonic',
};

const DS_CHAIN_PRIORITY = [
  'solana', 'ethereum', 'base', 'arbitrum', 'hyperliquid', 'bsc',
  'optimism', 'polygon', 'avalanche', 'blast', 'berachain', 'sui',
  'ton', 'tron', 'sonic', 'aptos',
];

function pickDexScreenerTarget(
  platforms: Record<string, string> | null | undefined,
): { dsChain: string; address: string } | null {
  if (!platforms || typeof platforms !== 'object') return null;
  const candidates: { dsChain: string; address: string }[] = [];
  for (const [cgChain, address] of Object.entries(platforms)) {
    if (!address || typeof address !== 'string' || address.length < 20) continue;
    const dsChain = CG_TO_DS_CHAIN[cgChain];
    if (dsChain) candidates.push({ dsChain, address });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const ai = DS_CHAIN_PRIORITY.indexOf(a.dsChain);
    const bi = DS_CHAIN_PRIORITY.indexOf(b.dsChain);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return candidates[0];
}

// Module-level in-memory cache for /coins/list?include_platform=true.
// The source HTML cached this in localStorage for 24h; per task constraints
// we use module-level state instead (resets on full page reload).
let cgPlatformsCache: Record<string, Record<string, string>> | null = null;
let cgPlatformsCacheAt = 0;
const PLATFORMS_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchCgPlatforms(): Promise<Record<string, Record<string, string>>> {
  if (cgPlatformsCache && Date.now() - cgPlatformsCacheAt < PLATFORMS_TTL_MS) {
    return cgPlatformsCache;
  }
  const resp = await fetch('https://api.coingecko.com/api/v3/coins/list?include_platform=true');
  if (!resp.ok) throw new Error('CG /coins/list HTTP ' + resp.status);
  const list = (await resp.json()) as Array<{ id?: string; platforms?: Record<string, string> }>;
  const lookup: Record<string, Record<string, string>> = {};
  for (const c of list) {
    if (c && c.id && c.platforms) lookup[c.id] = c.platforms;
  }
  cgPlatformsCache = lookup;
  cgPlatformsCacheAt = Date.now();
  return lookup;
}

// ─── data loader ─────────────────────────────────────────────────────────
// Three-way join with parent-protocol aggregation. See source-HTML
// methodology comments — logic preserved verbatim.

async function loadScreenerData(
  extraOverrides: Record<string, SlugOverride>,
): Promise<ScreenerData> {
  const allOverrides: Record<string, SlugOverride> = { ...SLUG_OVERRIDES, ...extraOverrides };
  const [revResp, protResp] = await Promise.all([
    fetch('https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyRevenue'),
    fetch('https://api.llama.fi/protocols'),
  ]);
  if (!revResp.ok) throw new Error('fees endpoint: HTTP ' + revResp.status);
  if (!protResp.ok) throw new Error('protocols endpoint: HTTP ' + protResp.status);

  const revData = (await revResp.json()) as { protocols?: DefiLlamaFeeEntry[] };
  const protData = (await protResp.json()) as DefiLlamaProtocolEntry[];

  if (!revData || !Array.isArray(revData.protocols)) throw new Error('fees response malformed');
  if (!Array.isArray(protData)) throw new Error('protocols response malformed');

  const protBySlug: Record<string, DefiLlamaProtocolEntry> = {};
  const protByName: Record<string, DefiLlamaProtocolEntry> = {};
  const protByParent: Record<string, DefiLlamaProtocolEntry[]> = {};
  protData.forEach((p) => {
    if (p.slug) protBySlug[keyify(p.slug)] = p;
    if (p.name) protByName[keyify(p.name)] = p;
    const parent = p.parentProtocol;
    if (parent && typeof parent === 'string') {
      const k = parent.replace(/^parent#/i, '').toLowerCase();
      (protByParent[k] = protByParent[k] || []).push(p);
    }
  });

  interface FeeGroup {
    groupKey: string;
    total24h: number;
    total7d: number;
    total30d: number;
    total1y: number;
    changeWeightedSum: number;
    changeWeightTotal: number;
    change30dWeightedSum: number;
    change30dWeightTotal: number;
    category: string | null;
    chains: Set<string>;
    logo: string | null;
    subNames: string[];
    subEntries: SubEntry[];
    fallbackName: string | null;
    hasExplicitParent: boolean;
  }

  const groups = new Map<string, FeeGroup>();

  revData.protocols.forEach((p) => {
    const parentRef = p.parentProtocol;
    let groupKey: string;
    let hasExplicitParent = false;

    if (parentRef && typeof parentRef === 'string') {
      groupKey = parentRef.replace(/^parent#/i, '').toLowerCase();
      hasExplicitParent = true;
    } else {
      groupKey = keyify(p.slug || slugify(p.name));
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupKey,
        total24h: 0,
        total7d: 0,
        total30d: 0,
        total1y: 0,
        changeWeightedSum: 0,
        changeWeightTotal: 0,
        change30dWeightedSum: 0,
        change30dWeightTotal: 0,
        category: null,
        chains: new Set<string>(),
        logo: null,
        subNames: [],
        subEntries: [],
        fallbackName: null,
        hasExplicitParent,
      });
    }

    const g = groups.get(groupKey)!;
    const rev24h = Number(p.total24h) || 0;
    const rev30 = Number(p.total30d) || 0;
    const rev7 = Number(p.total7d) || 0;
    const rev1y = Number(p.total1y) || 0;
    const change = Number(p.change_7d);
    const change30 = Number(p.change_30dover30d);

    g.total24h += rev24h;
    g.total7d += rev7;
    g.total30d += rev30;
    g.total1y += rev1y;
    if (!isNaN(change) && rev30 > 0) {
      g.changeWeightedSum += change * rev30;
      g.changeWeightTotal += rev30;
    }
    if (!isNaN(change30) && rev30 > 0) {
      g.change30dWeightedSum += change30 * rev30;
      g.change30dWeightTotal += rev30;
    }
    if (!g.category && p.category) g.category = p.category;
    if (!g.logo && p.logo) g.logo = p.logo;
    (p.chains || []).forEach((c) => g.chains.add(c));
    const subName = p.displayName || p.name || '';
    g.subNames.push(subName);
    g.subEntries.push({ name: subName, total7d: rev7, total30d: rev30 });
    if (!g.fallbackName) g.fallbackName = p.displayName || p.name || null;
  });

  let orphanRollupCount = 0;
  let overrideAppliedCount = 0;
  const resolved: ResolvedProtocol[] = Array.from(groups.values()).map((g) => {
    const prot = protBySlug[g.groupKey] || protByName[g.groupKey];
    const children = !prot ? (protByParent[g.groupKey] || []) : [];
    const override = allOverrides[g.groupKey] || null;
    if (!prot && (children.length || override)) orphanRollupCount++;

    const name = (prot && prot.name) || (override && override.name) || g.fallbackName || g.groupKey;
    const mcap = prot ? Number(prot.mcap) || 0 : 0;
    // Don't sum mcap across children — they share a token, would double-count.
    const tvl = prot
      ? Number(prot.tvl) || 0
      : children.reduce((s, c) => s + (Number(c.tvl) || 0), 0);
    const dlGecko = prot && prot.gecko_id;
    const gecko_id =
      dlGecko ||
      (override && override.gecko_id) ||
      (children.find((c) => c.gecko_id) || {}).gecko_id ||
      null;
    if (!dlGecko && override && override.gecko_id) overrideAppliedCount++;
    const logo =
      (prot && prot.logo) || (children.find((c) => c.logo) || {}).logo || g.logo || null;
    const category =
      (prot && prot.category) ||
      (children.find((c) => c.category) || {}).category ||
      g.category ||
      '—';

    const change_7d =
      g.changeWeightTotal > 0 ? g.changeWeightedSum / g.changeWeightTotal : null;
    const change_30d =
      g.change30dWeightTotal > 0 ? g.change30dWeightedSum / g.change30dWeightTotal : null;

    return {
      name,
      slug: g.groupKey,
      category,
      chains: Array.from(g.chains),
      logo,
      mcap,
      tvl,
      gecko_id,
      total24h: g.total24h,
      total7d: g.total7d,
      total30d: g.total30d,
      total1y: g.total1y,
      change_7d,
      change_30d,
      subCount: g.subNames.length,
      subNames: g.subNames,
      subEntries: g.subEntries,
      aggregated: g.hasExplicitParent && g.subNames.length > 1,
      fdv: 0,
      mcapSource: mcap > 0 ? 'defillama' : null,
      dexscreener: null,
    };
  });

  // Fetch mcap + FDV from CoinGecko (chunked).
  const geckoIds = Array.from(new Set(resolved.map((p) => p.gecko_id).filter((x): x is string => !!x)));
  const chunks: string[][] = [];
  for (let i = 0; i < geckoIds.length; i += 100) chunks.push(geckoIds.slice(i, i + 100));

  const cgLookup: Record<string, { mcap: number; fdv: number }> = {};
  let fdvError: string | null = null;
  try {
    const resps = await Promise.all(
      chunks.map((chunk) => {
        const url =
          'https://api.coingecko.com/api/v3/coins/markets' +
          '?vs_currency=usd&ids=' +
          encodeURIComponent(chunk.join(',')) +
          '&per_page=100&page=1&sparkline=false';
        return fetch(url).then((r) => {
          if (!r.ok) throw new Error('CG HTTP ' + r.status);
          return r.json() as Promise<Array<{
            id?: string;
            market_cap?: number | null;
            fully_diluted_valuation?: number | null;
          }>>;
        });
      }),
    );
    resps.flat().forEach((coin) => {
      if (coin && coin.id) {
        cgLookup[coin.id] = {
          mcap: Number(coin.market_cap) || 0,
          fdv: Number(coin.fully_diluted_valuation) || 0,
        };
      }
    });
  } catch (e) {
    fdvError = e instanceof Error ? e.message : 'coingecko fetch failed';
    console.warn('[screener] CoinGecko fetch failed:', e);
  }

  let cgPlatforms: Record<string, Record<string, string>> = {};
  try {
    cgPlatforms = await fetchCgPlatforms();
  } catch (e) {
    console.warn('[screener] /coins/list?include_platform fetch failed:', e);
  }

  let mcapBackfillCount = 0;
  let dexscreenerDirectCount = 0;
  const withFdv: ResolvedProtocol[] = resolved.map((p) => {
    const cg = p.gecko_id ? cgLookup[p.gecko_id] : null;
    const fdv = cg ? cg.fdv : 0;
    let mcap = p.mcap;
    let mcapSource: ResolvedProtocol['mcapSource'] = mcap > 0 ? 'defillama' : null;
    if ((!mcap || mcap === 0) && cg && cg.mcap > 0) {
      mcap = cg.mcap;
      mcapSource = 'coingecko';
      mcapBackfillCount++;
    }
    let dexscreener: string | null = null;
    if (p.gecko_id) {
      const target = pickDexScreenerTarget(cgPlatforms[p.gecko_id]);
      if (target) {
        dexscreener = `https://dexscreener.com/${target.dsChain}/${target.address}`;
        dexscreenerDirectCount++;
      }
    }
    return { ...p, mcap, fdv, mcapSource, dexscreener };
  });

  console.log(
    '[screener] loaded',
    '| fee entries (pre-agg):', revData.protocols.length,
    '| aggregated groups:', resolved.length,
    '| mcap entries (defillama):', Object.keys(protBySlug).length,
    '| orphan parents resolved:', orphanRollupCount,
    '| gecko_id overrides applied:', overrideAppliedCount,
    '| gecko_ids:', geckoIds.length,
    '| cg entries:', Object.keys(cgLookup).length,
    '| mcap backfilled from cg:', mcapBackfillCount,
    '| cg platforms entries:', Object.keys(cgPlatforms).length,
    '| dexscreener direct links:', dexscreenerDirectCount,
    '| cg error:', fdvError,
  );

  return {
    protocols: withFdv,
    fdvError,
    counts: {
      feeEntries: revData.protocols.length,
      aggregatedGroups: resolved.length,
      protocolsWithMcap: withFdv.filter((p) => p.mcap > 0).length,
      protocolsWithMcapBackfilled: mcapBackfillCount,
      protocolsWithFdv: withFdv.filter((p) => p.fdv > 0).length,
      protocolsWithTvl: withFdv.filter((p) => p.tvl > 0).length,
      protocolsWithRev: withFdv.filter((p) => p.total30d > 0).length,
      protocolsWithBoth: withFdv.filter((p) => p.mcap > 0 && p.total30d > 0).length,
    },
  };
}

// ─── filter bands ────────────────────────────────────────────────────────

interface McapBand { key: string; label: string; min: number; max: number; }
const MCAP_BANDS: McapBand[] = [
  { key: 'all',   label: 'all',        min: 0,    max: Infinity },
  { key: 'micro', label: '<$10M',      min: 0,    max: 1e7 },
  { key: 'small', label: '$10M–100M',  min: 1e7,  max: 1e8 },
  { key: 'mid',   label: '$100M–1B',   min: 1e8,  max: 1e9 },
  { key: 'large', label: '$1B+',       min: 1e9,  max: Infinity },
];

// ─── sort accessor (TS-friendly replacement for `p[sortKey]`) ───────────

function getSortValue(p: EnrichedProtocol, key: SortKey): number | string | null {
  switch (key) {
    case 'name': return p.name;
    case 'category': return p.category;
    case 'mcap': return p.mcap;
    case 'fdv': return p.fdv;
    case 'tvl': return p.tvl;
    case 'rev24h': return p.rev24h;
    case 'rev30d': return p.rev30d;
    case 'rev7d': return p.rev7d;
    case 'annRev': return p.annRev;
    case 'ps': return p.ps;
    case 'revTvl': return p.revTvl;
    case 'change': return p.change;
    case 'change30': return p.change30;
  }
}

// ─── page-scoped CSS ─────────────────────────────────────────────────────

const CPVF_CSS = `
  .cpvf-chip {
    display: inline-flex; align-items: center;
    padding: 6px 12px; font-size: 10px;
    letter-spacing: 0.1em; text-transform: uppercase;
    cursor: pointer; transition: background 120ms, color 120ms, border-color 120ms;
    border: 1px solid ${TOKENS.border};
    color: ${TOKENS.textMuted};
    background: transparent;
    font-family: inherit;
  }
  .cpvf-chip:hover:not(.cpvf-chip--active):not(.cpvf-chip--disabled) {
    background: ${TOKENS.surfaceHover};
    color: ${TOKENS.text};
  }
  .cpvf-chip--active {
    background: ${TOKENS.amber};
    color: #000;
    border-color: ${TOKENS.amber};
  }
  .cpvf-chip--disabled { opacity: 0.4; cursor: not-allowed; }
  .cpvf-chip--small { padding: 2px 7px; font-size: 9px; }

  .cpvf-input, .cpvf-select {
    background: ${TOKENS.surface};
    border: 1px solid ${TOKENS.border};
    color: ${TOKENS.text};
    padding: 8px 12px;
    font-family: inherit;
    font-size: 11px;
    letter-spacing: 0.05em;
    outline: none;
  }
  .cpvf-input::placeholder { color: ${TOKENS.textDim}; }
  .cpvf-input:focus, .cpvf-select:focus { border-color: ${TOKENS.amber}; }
  .cpvf-select option { background: ${TOKENS.surface}; color: ${TOKENS.text}; }

  .cpvf-th {
    cursor: pointer; user-select: none; white-space: nowrap;
    transition: color 120ms;
  }
  .cpvf-th:hover { color: ${TOKENS.amber}; }

  .cpvf-row { transition: background 90ms; }
  .cpvf-row:hover { background: ${TOKENS.surface}; }

  .cpvf-link { color: ${TOKENS.text}; transition: color 120ms; }
  .cpvf-link:hover { color: ${TOKENS.amber}; }

  .cpvf-chart-link { color: ${TOKENS.textMuted}; transition: color 120ms; font-size: 13px; }
  .cpvf-chart-link:hover { color: ${TOKENS.amber}; }

  .cpvf-table { border-collapse: collapse; width: 100%; font-size: 11px; }
  .cpvf-table th, .cpvf-table td { font-variant-numeric: tabular-nums; }

  .cpvf-subcount {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 5px;
    font-size: 9px;
    border: 1px solid ${TOKENS.border};
    color: ${TOKENS.textDim};
    letter-spacing: 0.05em;
  }
`;

// ─── component ───────────────────────────────────────────────────────────

export default function CryptoValuation() {
  const [raw, setRaw] = useState<{ protocols: ResolvedProtocol[] } | null>(null);
  const [counts, setCounts] = useState<ScreenerCounts | null>(null);
  const [fdvError, setFdvError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const [period, setPeriod] = useState<Period>('30d');
  const [valuation, setValuation] = useState<ValuationMode>('mcap');
  const [category, setCategory] = useState<string>('All');
  const [chain, setChain] = useState<string>('All');
  const [mcapBand, setMcapBand] = useState<string>('small');
  const [search, setSearch] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('ps');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [limit, setLimit] = useState<number>(30);
  const [coverageOpen, setCoverageOpen] = useState<boolean>(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  // Session-only userOverrides (no localStorage per task constraints).
  const [userOverrides, setUserOverrides] = useState<Record<string, SlugOverride>>({});
  const [matchResults, setMatchResults] = useState<Record<string, MatchResult>>({});
  const [findingMatches, setFindingMatches] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [addedSnippets, setAddedSnippets] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const result = await loadScreenerData(userOverrides);
      setRaw({ protocols: result.protocols });
      setCounts(result.counts);
      setFdvError(result.fdvError);
      setFetchedAt(new Date());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
    // userOverrides is intentionally not in deps — manual refresh re-applies them
  }, [userOverrides]);

  useEffect(() => {
    loadData();
    // Run once on mount; manual refresh handled by button
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const findMatches = useCallback(async (gaps: ResolvedProtocol[]) => {
    if (!gaps || gaps.length === 0) return;
    setFindingMatches(true);
    setMatchError(null);
    try {
      const slugs = gaps.map((p) => p.slug).filter(Boolean);
      const url =
        'https://api.coingecko.com/api/v3/coins/markets' +
        '?vs_currency=usd&per_page=250&page=1&sparkline=false' +
        '&ids=' +
        encodeURIComponent(slugs.join(','));
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('CG HTTP ' + resp.status);
      const data = (await resp.json()) as Array<{
        id?: string;
        name?: string;
        symbol?: string;
        market_cap?: number | null;
        fully_diluted_valuation?: number | null;
      }>;
      const lookup: Record<string, typeof data[number]> = {};
      data.forEach((c) => { if (c.id) lookup[c.id] = c; });
      const results: Record<string, MatchResult> = {};
      gaps.forEach((p) => {
        const cg = lookup[p.slug];
        if (cg && (Number(cg.market_cap) || 0) > 0) {
          results[p.slug] = {
            status: 'match',
            id: cg.id || p.slug,
            name: cg.name || p.slug,
            symbol: cg.symbol || '',
            mcap: Number(cg.market_cap) || 0,
            fdv: Number(cg.fully_diluted_valuation) || 0,
          };
        } else if (cg) {
          results[p.slug] = {
            status: 'no_mcap',
            id: cg.id || p.slug,
            name: cg.name || p.slug,
            symbol: cg.symbol || '',
          };
        } else {
          results[p.slug] = { status: 'not_found' };
        }
      });
      setMatchResults(results);
    } catch (e) {
      setMatchError(e instanceof Error ? e.message : 'match lookup failed');
      console.warn('[screener] findMatches failed:', e);
    } finally {
      setFindingMatches(false);
    }
  }, []);

  const addOverride = useCallback((slug: string, match: Extract<MatchResult, { status: 'match' }>) => {
    setUserOverrides((prev) => ({ ...prev, [slug]: { name: match.name, gecko_id: match.id } }));
    setRaw((prev) =>
      prev
        ? {
            ...prev,
            protocols: prev.protocols.map((p) =>
              p.slug === slug
                ? {
                    ...p,
                    mcap: match.mcap,
                    fdv: match.fdv || p.fdv,
                    gecko_id: match.id,
                    name: match.name,
                    mcapSource: 'user-override',
                  }
                : p,
            ),
          }
        : prev,
    );
    const escName = match.name.replace(/'/g, "\\'");
    const escSlug = slug.replace(/'/g, "\\'");
    const line = "  '" + escSlug + "': { name: '" + escName + "', gecko_id: '" + match.id + "' },";
    setAddedSnippets((prev) => (prev.includes(line) ? prev : [...prev, line]));
  }, []);

  // enrichedAll: every protocol after computing period-derived fields, no
  // filters applied. Used for modal lookup so a click on a row still resolves
  // even if the user later changes filters that would hide it.
  const enrichedAll: EnrichedProtocol[] = useMemo(() => {
    if (!raw || !raw.protocols) return [];
    return raw.protocols.map<EnrichedProtocol>((p) => {
      const rev24h = p.total24h || 0;
      const rev7d = p.total7d || 0;
      const rev30d = p.total30d || 0;
      const annRev = period === '30d' ? (rev30d * 365) / 30 : (rev7d * 365) / 7;
      const mcap = p.mcap || 0;
      const fdv = p.fdv || 0;
      const tvl = p.tvl || 0;
      const valuationVal = valuation === 'fdv' ? fdv : mcap;
      const periodRev = period === '30d' ? rev30d : rev7d;
      const ps = valuationVal > 0 && annRev > 0 ? valuationVal / annRev : null;
      const revTvl = tvl > 0 && annRev > 0 ? annRev / tvl : null;
      return {
        ...p,
        rev24h,
        rev7d,
        rev30d,
        periodRev,
        annRev,
        ps,
        revTvl,
        tvl,
        change: p.change_7d,
        change30: p.change_30d,
      };
    });
  }, [raw, period, valuation]);

  const enriched: EnrichedProtocol[] = useMemo(() => {
    return enrichedAll
      .filter((p) => {
        const band = MCAP_BANDS.find((b) => b.key === mcapBand) || MCAP_BANDS[0];
        return p.mcap >= band.min && p.mcap < band.max && p.ps != null && p.ps > 0 && p.periodRev > 0;
      })
      .filter((p) => category === 'All' || p.category === category)
      .filter((p) => chain === 'All' || p.chains.includes(chain))
      .filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()));
  }, [enrichedAll, category, chain, mcapBand, search]);

  const selectedRow = useMemo<EnrichedProtocol | null>(() => {
    if (!selectedSlug) return null;
    return enrichedAll.find((p) => p.slug === selectedSlug) ?? null;
  }, [selectedSlug, enrichedAll]);

  const sorted = useMemo(() => {
    const arr = [...enriched];
    arr.sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = av as number;
      const bn = bv as number;
      return sortDir === 'asc' ? an - bn : bn - an;
    });
    return arr;
  }, [enriched, sortKey, sortDir]);

  const displayed = sorted.slice(0, limit);

  const categories = useMemo(() => {
    if (!raw || !raw.protocols) return ['All'];
    const s = new Set<string>();
    raw.protocols.forEach((p) => p.category && s.add(p.category));
    return ['All', ...Array.from(s).sort()];
  }, [raw]);

  const chainsList = useMemo(() => {
    if (!raw || !raw.protocols) return ['All'];
    const s = new Set<string>();
    raw.protocols.forEach((p) => (p.chains || []).forEach((c) => s.add(c)));
    return ['All', ...Array.from(s).sort()];
  }, [raw]);

  // Coverage gaps: high-revenue protocols (>$1M / 30d) that have no mcap after
  // the CG backfill. Without this panel they'd vanish silently from the table.
  const coverageGaps = useMemo(() => {
    if (!raw || !raw.protocols) return [];
    const REV_THRESHOLD = 1_000_000;
    return raw.protocols
      .filter((p) => p.total30d >= REV_THRESHOLD && (!p.mcap || p.mcap === 0))
      .sort((a, b) => b.total30d - a.total30d);
  }, [raw]);

  const stats = useMemo(() => {
    if (sorted.length === 0) return null;
    const psValues = sorted
      .map((p) => p.ps)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    const median = psValues.length > 0 ? psValues[Math.floor(psValues.length / 2)] : null;
    const totalVal = sorted.reduce((s, p) => s + (valuation === 'fdv' ? p.fdv : p.mcap), 0);
    const totalAnnRev = sorted.reduce((s, p) => s + p.annRev, 0);
    return {
      count: sorted.length,
      median,
      aggregatePs: totalAnnRev > 0 ? totalVal / totalAnnRev : null,
      totalAnnRev,
    };
  }, [sorted, valuation]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'ps' || key === 'name' || key === 'category' ? 'asc' : 'desc');
    }
  };

  const sortArrow = (k: SortKey) =>
    sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const showDiag = !loading && !err && raw && raw.protocols.length > 0 && sorted.length === 0;
  const fdvAvailable = !fdvError && counts != null && counts.protocolsWithFdv > 0;

  // ─── render ──────────────────────────────────────────────────────────

  const sourceBreadcrumb = counts
    ? `DEFILLAMA${fdvAvailable ? ' · COINGECKO' : ''} · ${counts.aggregatedGroups} GROUPS · ${counts.feeEntries} RAW`
    : 'DEFILLAMA · COINGECKO';

  const refreshTimeStr = fetchedAt
    ? fetchedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="cheddar-page">
      <style>{TERMINAL_GLOBAL_CSS}</style>
      <style>{CPVF_CSS}</style>
      <TopBar />

      <div className="module-bar">
        <div className="module-bar__left">
          <span className="module-bar__code">MODULE CPVF</span>
          <span className="module-bar__title">PROTOCOL VALUATION</span>
        </div>
        <Link to="/" className="module-bar__back">← BACK TO TERMINAL</Link>
      </div>

      <div className="toolbar">
        <span>
          <span style={{ color: err ? TOKENS.red : TOKENS.green, marginRight: 8 }}>
            ● {err ? 'OFFLINE' : 'LIVE'}
          </span>
          {sourceBreadcrumb} · UPDATED {refreshTimeStr}
        </span>
        <button
          onClick={loadData}
          className="cpvf-chip"
          disabled={loading}
        >
          {loading ? '↻ LOADING…' : '↻ REFRESH'}
        </button>
      </div>

      <main className="page" style={{ paddingTop: 24, paddingBottom: 48 }}>
        <p
          style={{
            color: TOKENS.textMuted,
            fontSize: 12,
            lineHeight: 1.65,
            maxWidth: 760,
            margin: '0 0 28px',
          }}
        >
          Protocols ranked by {valuation === 'fdv' ? 'fully-diluted valuation' : 'market cap'}{' '}
          relative to annualized on-chain revenue. Sub-protocols are aggregated under their parent
          — a Hyperliquid row sums Perps, Spot and HLP. Cheapest names are either misunderstood,
          decaying, or inflating. Your job is to tell which.
        </p>

        {/* ── stats panel ─────────────────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 28,
          }}
        >
          {[
            { label: 'MATCHES', value: stats ? String(stats.count) : '—' },
            { label: 'MEDIAN P/S', value: stats ? fmtPs(stats.median) : '—' },
            { label: 'AGG. REV', value: stats ? fmtUsd(stats.totalAnnRev) : '—' },
          ].map((tile) => (
            <div
              key={tile.label}
              style={{
                background: TOKENS.surface,
                border: `1px solid ${TOKENS.border}`,
                padding: '14px 18px',
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: TOKENS.amber,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                {tile.label}
              </div>
              <div
                style={{
                  fontSize: 24,
                  color: TOKENS.text,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '0.02em',
                  lineHeight: 1,
                }}
              >
                {tile.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── filter row ──────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            padding: '14px 0',
            borderTop: `1px solid ${TOKENS.border}`,
            borderBottom: `1px solid ${TOKENS.border}`,
            marginBottom: 20,
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search…"
            className="cpvf-input"
            style={{ width: 160 }}
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="cpvf-select"
          >
            {categories.map((c) => (
              <option key={c} value={c}>cat · {c}</option>
            ))}
          </select>
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            className="cpvf-select"
          >
            {chainsList.slice(0, 200).map((c) => (
              <option key={c} value={c}>chain · {c}</option>
            ))}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                color: TOKENS.textDim,
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginRight: 4,
              }}
            >
              mcap
            </span>
            {MCAP_BANDS.map((b) => (
              <button
                key={b.key}
                onClick={() => setMcapBand(b.key)}
                className={'cpvf-chip ' + (mcapBand === b.key ? 'cpvf-chip--active' : '')}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                color: TOKENS.textDim,
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginRight: 4,
              }}
            >
              val
            </span>
            <button
              onClick={() => setValuation('mcap')}
              className={'cpvf-chip ' + (valuation === 'mcap' ? 'cpvf-chip--active' : '')}
            >
              Mcap
            </button>
            <button
              onClick={() => fdvAvailable && setValuation('fdv')}
              className={
                'cpvf-chip ' +
                (valuation === 'fdv' ? 'cpvf-chip--active' : '') +
                (fdvAvailable ? '' : ' cpvf-chip--disabled')
              }
              title={fdvAvailable ? 'use fully-diluted valuation for P/S' : 'FDV unavailable'}
            >
              FDV
            </button>
            {!fdvAvailable && (
              <span
                style={{
                  fontSize: 9,
                  color: TOKENS.textDim,
                  marginLeft: 6,
                  fontStyle: 'italic',
                }}
              >
                (offline)
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <span
              style={{
                color: TOKENS.textDim,
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginRight: 4,
              }}
            >
              period
            </span>
            <button
              onClick={() => setPeriod('7d')}
              className={'cpvf-chip ' + (period === '7d' ? 'cpvf-chip--active' : '')}
            >
              7d
            </button>
            <button
              onClick={() => setPeriod('30d')}
              className={'cpvf-chip ' + (period === '30d' ? 'cpvf-chip--active' : '')}
            >
              30d
            </button>
          </div>
        </div>

        {/* ── coverage gaps callout ───────────────────────────────────── */}
        {!loading && !err && coverageGaps.length > 0 && (
          <div
            style={{
              background: TOKENS.surface,
              borderLeft: `2px solid ${TOKENS.amber}`,
              marginBottom: 16,
              fontSize: 11,
            }}
          >
            <button
              onClick={() => setCoverageOpen((o) => !o)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                padding: '10px 14px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: TOKENS.text,
              }}
              title="High-revenue protocols with no resolvable mcap — they'd be silently filtered from the table"
            >
              <span style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                <span style={{ color: TOKENS.amber, marginRight: 8 }}>⚠</span>
                <span>
                  {coverageGaps.length} HIGH-REV PROTOCOL{coverageGaps.length === 1 ? '' : 'S'}{' '}
                  MISSING FROM SCREEN
                </span>
              </span>
              <span style={{ color: TOKENS.amber, fontSize: 11 }}>
                {coverageOpen ? '▴ HIDE' : '▾ SHOW'}
              </span>
            </button>

            {coverageOpen && (
              <div style={{ padding: '0 14px 12px', borderTop: `1px solid ${TOKENS.border}` }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 0 6px',
                  }}
                >
                  <div
                    style={{
                      color: TOKENS.textDim,
                      fontSize: 9,
                      display: 'flex',
                      gap: 12,
                      flex: 1,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                    }}
                  >
                    <span style={{ minWidth: 160 }}>slug</span>
                    <span style={{ minWidth: 80, textAlign: 'right' }}>30d rev</span>
                    <span style={{ flex: 1 }}>match / sub-protocols</span>
                  </div>
                  <button
                    onClick={() => findMatches(coverageGaps.slice(0, 20))}
                    disabled={findingMatches}
                    className="cpvf-chip"
                    title="Query CoinGecko using each slug as an exact gecko_id. No fuzzy /search, so wrong matches are unlikely."
                  >
                    {findingMatches ? 'searching cg…' : '⌕ find cg matches'}
                  </button>
                </div>

                {matchError && (
                  <div style={{ color: TOKENS.red, fontSize: 10, paddingBottom: 8 }}>
                    match lookup failed: {matchError}
                  </div>
                )}

                {coverageGaps.slice(0, 20).map((p) => {
                  const m = matchResults[p.slug];
                  const added = !!userOverrides[p.slug];
                  return (
                    <div
                      key={p.slug}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '5px 0',
                        borderTop: `1px solid ${TOKENS.border}`,
                        fontSize: 11,
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ color: TOKENS.text, minWidth: 160 }}>{p.slug}</span>
                      <span
                        style={{
                          color: TOKENS.textMuted,
                          minWidth: 80,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {fmtUsd(p.total30d)}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          fontSize: 10,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        {added && (
                          <span style={{ color: TOKENS.green }}>
                            ✓ added —{' '}
                            <code style={{ color: TOKENS.textMuted }}>
                              {userOverrides[p.slug].gecko_id}
                            </code>
                          </span>
                        )}
                        {!added && !m && (
                          <span style={{ color: TOKENS.textDim }}>
                            {(p.subNames || []).join(' · ')}
                          </span>
                        )}
                        {!added && m && m.status === 'match' && (
                          <>
                            <span style={{ color: TOKENS.green }}>✓</span>
                            <span style={{ color: TOKENS.text }}>
                              {m.name} ({m.symbol.toUpperCase()})
                            </span>
                            <span
                              style={{
                                color: TOKENS.textMuted,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {fmtUsd(m.mcap)}
                            </span>
                            <button
                              onClick={() => addOverride(p.slug, m)}
                              className="cpvf-chip cpvf-chip--small"
                            >
                              + add
                            </button>
                          </>
                        )}
                        {!added && m && m.status === 'no_mcap' && (
                          <span style={{ color: TOKENS.textDim }}>
                            ✗ <code>{m.id}</code> exists but no mcap
                          </span>
                        )}
                        {!added && m && m.status === 'not_found' && (
                          <span style={{ color: TOKENS.textDim }}>
                            — no CG entry for this slug (likely tokenless)
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}

                {coverageGaps.length > 20 && (
                  <div
                    style={{
                      color: TOKENS.textDim,
                      fontSize: 10,
                      paddingTop: 8,
                      fontStyle: 'italic',
                    }}
                  >
                    +{coverageGaps.length - 20} more below the top 20
                  </div>
                )}

                {addedSnippets.length > 0 && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 10,
                      border: `1px solid ${TOKENS.border}`,
                      background: TOKENS.bg,
                    }}
                  >
                    <div
                      style={{
                        color: TOKENS.textDim,
                        fontSize: 9,
                        marginBottom: 6,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                      }}
                    >
                      <span>
                        added this session — paste into <code>SLUG_OVERRIDES</code> to persist
                      </span>
                      <button
                        onClick={() => {
                          try {
                            navigator.clipboard.writeText(addedSnippets.join('\n'));
                          } catch {
                            /* noop */
                          }
                        }}
                        className="cpvf-chip cpvf-chip--small"
                      >
                        copy
                      </button>
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        fontSize: 10,
                        color: TOKENS.text,
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'inherit',
                      }}
                    >
                      {addedSnippets.join('\n')}
                    </pre>
                  </div>
                )}

                <div
                  style={{
                    color: TOKENS.textDim,
                    fontSize: 10,
                    paddingTop: 12,
                    marginTop: 8,
                    borderTop: `1px solid ${TOKENS.border}`,
                    lineHeight: 1.6,
                  }}
                >
                  <code>⌕ find cg matches</code> queries each slug as an exact gecko_id (no
                  /search). Green ✓ is a viable hit — click <code>+ add</code> to inject it into
                  the current view. Tokenless protocols (Polymarket, Phantom, MetaMask, etc.)
                  can't be fixed without a separate revenue-only view.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── loading / error / diagnostic ────────────────────────────── */}
        {loading && (
          <div
            style={{
              textAlign: 'center',
              padding: '80px 0',
              fontSize: 11,
              color: TOKENS.textMuted,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            fetching llama · coingecko data…
          </div>
        )}

        {err && !loading && (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <div
              style={{
                color: TOKENS.red,
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              couldn't reach the api
            </div>
            <div
              style={{
                color: TOKENS.textMuted,
                fontSize: 11,
                maxWidth: 480,
                margin: '0 auto 20px',
                lineHeight: 1.6,
              }}
            >
              {err}
            </div>
            <button onClick={loadData} className="cpvf-chip">↻ try again</button>
          </div>
        )}

        {showDiag && (
          <div
            style={{
              margin: '24px 0',
              padding: 20,
              border: `1px solid ${TOKENS.border}`,
              fontSize: 11,
              lineHeight: 1.7,
              color: TOKENS.textMuted,
            }}
          >
            <div
              style={{
                color: TOKENS.red,
                marginBottom: 10,
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              diagnostic · zero matches
            </div>
            <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: `2px solid ${TOKENS.border}` }}>
              · <code>{counts?.feeEntries ?? 0}</code> raw fee entries<br/>
              · <code>{counts?.aggregatedGroups ?? 0}</code> aggregated groups after parent-rollup<br/>
              · <code>{counts?.protocolsWithMcap ?? 0}</code> have mcap (incl.{' '}
              <code>{counts?.protocolsWithMcapBackfilled ?? 0}</code> backfilled from CoinGecko)<br/>
              · <code>{counts?.protocolsWithFdv ?? 0}</code> have FDV<br/>
              · <code>{counts?.protocolsWithTvl ?? 0}</code> have TVL<br/>
              · <code>{counts?.protocolsWithRev ?? 0}</code> have 30d revenue &gt; 0<br/>
              · <code>{counts?.protocolsWithBoth ?? 0}</code> have both mcap + rev<br/>
            </div>
            {fdvError && (
              <div style={{ marginTop: 12, color: TOKENS.red, fontSize: 10 }}>
                FDV fetch: {fdvError}
              </div>
            )}
          </div>
        )}

        {/* ── table ───────────────────────────────────────────────────── */}
        {!loading && !err && !showDiag && (
          <div style={{ overflowX: 'auto' }}>
            <table className="cpvf-table">
              <thead>
                <tr
                  style={{
                    color: TOKENS.amber,
                    fontSize: 9,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    borderBottom: `1px solid ${TOKENS.border}`,
                  }}
                >
                  <th style={{ textAlign: 'left', padding: '10px 10px 10px 0', width: 28 }}>#</th>
                  <th
                    className="cpvf-th"
                    onClick={() => toggleSort('name')}
                    style={{ textAlign: 'left', padding: '10px 10px 10px 0' }}
                  >
                    Protocol{sortArrow('name')}
                  </th>
                  <th
                    className="cpvf-th"
                    onClick={() => toggleSort('category')}
                    style={{ textAlign: 'left', padding: '10px 10px 10px 0' }}
                  >
                    Category{sortArrow('category')}
                  </th>
                  <th
                    className="cpvf-th"
                    onClick={() => toggleSort('mcap')}
                    style={{ textAlign: 'right', padding: '10px 10px 10px 0' }}
                  >
                    Mcap{sortArrow('mcap')}
                  </th>
                  <th
                    className="cpvf-th"
                    onClick={() => toggleSort('fdv')}
                    style={{ textAlign: 'right', padding: '10px 10px 10px 0' }}
                  >
                    FDV{sortArrow('fdv')}
                  </th>
                  <th
                    className="cpvf-th"
                    onClick={() => toggleSort('tvl')}
                    style={{ textAlign: 'right', padding: '10px 10px 10px 0' }}
                  >
                    TVL{sortArrow('tvl')}
                  </th>
                  <th
                    className="cpvf-th"
                    onClick={() => toggleSort('rev24h')}
                    style={{ textAlign: 'right', padding: '10px 10px 10px 0' }}
                  >
                    24h Rev{sortArrow('rev24h')}
                  </th>
                  <th
                    className="cpvf-th"
                    onClick={() => toggleSort('rev7d')}
                    style={{ textAlign: 'right', padding: '10px 10px 10px 0' }}
                  >
                    Rev 7d{sortArrow('rev7d')}
                  </th>
                  <th
                    className="cpvf-th"
                    onClick={() => toggleSort('rev30d')}
                    style={{ textAlign: 'right', padding: '10px 10px 10px 0' }}
                  >
                    Rev 30d{sortArrow('rev30d')}
                  </th>
                  <th
                    className="cpvf-th"
                    onClick={() => toggleSort('annRev')}
                    style={{ textAlign: 'right', padding: '10px 10px 10px 0' }}
                    title="Annualized revenue (period × 365/N) — denominator of P/S"
                  >
                    Ann Rev{sortArrow('annRev')}
                  </th>
                  <th
                    className="cpvf-th"
                    onClick={() => toggleSort('ps')}
                    style={{ textAlign: 'right', padding: '10px 10px 10px 0' }}
                  >
                    P/S ({valuation === 'fdv' ? 'F' : 'M'}){sortArrow('ps')}
                  </th>
                  <th
                    className="cpvf-th"
                    onClick={() => toggleSort('revTvl')}
                    style={{ textAlign: 'right', padding: '10px 10px 10px 0' }}
                    title="Annualized revenue ÷ TVL — capital efficiency"
                  >
                    Rev/TVL{sortArrow('revTvl')}
                  </th>
                  <th
                    className="cpvf-th"
                    onClick={() => toggleSort('change')}
                    style={{ textAlign: 'right', padding: '10px 10px 10px 0' }}
                  >
                    Δ 7d{sortArrow('change')}
                  </th>
                  <th
                    className="cpvf-th"
                    onClick={() => toggleSort('change30')}
                    style={{ textAlign: 'right', padding: '10px 10px 10px 0' }}
                    title="Revenue change vs prior 30d"
                  >
                    Δ 30d{sortArrow('change30')}
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px 0 10px 8px' }}>Chain</th>
                  <th
                    style={{ textAlign: 'center', padding: '10px 0 10px 8px' }}
                    title="Open the token on DexScreener (DEX pair charts) in a new tab"
                  >
                    Chart
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((p, i) => (
                  <tr
                    key={p.slug + i}
                    className="cpvf-row"
                    onClick={() => setSelectedSlug(p.slug)}
                    style={{
                      borderBottom: `1px solid ${TOKENS.border}`,
                      color: TOKENS.text,
                      cursor: 'pointer',
                    }}
                  >
                    <td style={{ padding: '10px 10px 10px 0', color: TOKENS.textDim }}>
                      {String(i + 1).padStart(2, '0')}
                    </td>
                    <td style={{ padding: '10px 10px 10px 0' }}>
                      <div
                        className="cpvf-link"
                        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        {p.logo && (
                          <img
                            src={p.logo}
                            alt=""
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              background: TOKENS.border,
                              flexShrink: 0,
                            }}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                            }}
                          />
                        )}
                        <span style={{ whiteSpace: 'nowrap' }}>{p.name}</span>
                        {p.aggregated && (
                          <span
                            className="cpvf-subcount"
                            title={'Aggregates: ' + p.subNames.join(' · ')}
                          >
                            ⊕{p.subCount}
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: '10px 10px 10px 0',
                        color: TOKENS.textMuted,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.category}
                    </td>
                    <td style={{ padding: '10px 10px 10px 0', textAlign: 'right' }}>
                      {fmtUsd(p.mcap)}
                    </td>
                    <td
                      style={{
                        padding: '10px 10px 10px 0',
                        textAlign: 'right',
                        color: p.fdv > 0 ? TOKENS.text : TOKENS.textDim,
                      }}
                    >
                      {fmtUsd(p.fdv)}
                    </td>
                    <td
                      style={{
                        padding: '10px 10px 10px 0',
                        textAlign: 'right',
                        color: p.tvl > 0 ? TOKENS.text : TOKENS.textDim,
                      }}
                    >
                      {fmtUsd(p.tvl)}
                    </td>
                    <td
                      style={{
                        padding: '10px 10px 10px 0',
                        textAlign: 'right',
                        color: p.rev24h < 0 ? TOKENS.red : TOKENS.textMuted,
                      }}
                      title={
                        p.rev24h < 0
                          ? 'DefiLlama-reported revenue. Negative values reflect refunds, buyback expenses, or corrections in the underlying methodology.'
                          : undefined
                      }
                    >
                      {fmtUsd(p.rev24h)}
                    </td>
                    <td
                      style={{
                        padding: '10px 10px 10px 0',
                        textAlign: 'right',
                        color: TOKENS.textMuted,
                      }}
                    >
                      {fmtUsd(p.rev7d)}
                    </td>
                    <td
                      style={{
                        padding: '10px 10px 10px 0',
                        textAlign: 'right',
                        color: TOKENS.textMuted,
                      }}
                    >
                      {fmtUsd(p.rev30d)}
                    </td>
                    <td
                      style={{
                        padding: '10px 10px 10px 0',
                        textAlign: 'right',
                        color: TOKENS.text,
                      }}
                    >
                      {fmtUsd(p.annRev)}
                    </td>
                    <td
                      style={{
                        padding: '10px 10px 10px 0',
                        textAlign: 'right',
                        fontWeight: 500,
                        color: psColor(p.ps),
                      }}
                    >
                      {fmtPs(p.ps)}
                    </td>
                    <td
                      style={{
                        padding: '10px 10px 10px 0',
                        textAlign: 'right',
                        color: yieldColor(p.revTvl),
                      }}
                    >
                      {fmtYield(p.revTvl)}
                    </td>
                    <td
                      style={{
                        padding: '10px 10px 10px 0',
                        textAlign: 'right',
                        color: pctColor(p.change),
                      }}
                    >
                      {fmtPct(p.change)}
                    </td>
                    <td
                      style={{
                        padding: '10px 10px 10px 0',
                        textAlign: 'right',
                        color: pctColor(p.change30),
                      }}
                    >
                      {fmtPct(p.change30)}
                    </td>
                    <td
                      style={{
                        padding: '10px 0 10px 8px',
                        color: TOKENS.textMuted,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.chains.slice(0, 2).join(', ')}
                      {p.chains.length > 2 && ` +${p.chains.length - 2}`}
                    </td>
                    <td style={{ padding: '10px 0 10px 8px', textAlign: 'center' }}>
                      {p.dexscreener || p.gecko_id ? (
                        <a
                          href={
                            p.dexscreener ||
                            `https://dexscreener.com/?q=${encodeURIComponent(p.gecko_id || '')}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title={
                            p.dexscreener
                              ? `Open ${p.name} pair on DexScreener`
                              : `Search ${p.name} on DexScreener`
                          }
                          className="cpvf-chart-link"
                        >
                          ↗
                        </a>
                      ) : (
                        <span style={{ color: TOKENS.textDim }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {displayed.length === 0 && sorted.length === 0 && raw && raw.protocols.length > 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '48px 0',
                  fontSize: 11,
                  color: TOKENS.textDim,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                no matches · loosen filters
              </div>
            )}

            {sorted.length > limit && (
              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <button onClick={() => setLimit((l) => l + 30)} className="cpvf-chip">
                  load {Math.min(30, sorted.length - limit)} more →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── methodology ─────────────────────────────────────────────── */}
        <div
          style={{
            borderTop: `1px solid ${TOKENS.border}`,
            color: TOKENS.textMuted,
            maxWidth: 640,
            marginTop: 48,
            paddingTop: 20,
            fontSize: 11,
            lineHeight: 1.7,
          }}
        >
          <div
            style={{
              color: TOKENS.amber,
              marginBottom: 10,
              fontSize: 9,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            methodology
          </div>
          <p style={{ margin: '0 0 8px' }}>
            <strong style={{ color: TOKENS.text }}>Aggregation:</strong> Fee entries sharing a{' '}
            <code>parentProtocol</code> (e.g. Hyperliquid Perps + Spot + HLP → Hyperliquid) are
            summed. Δ 7d is revenue-weighted. Rows with multiple children show a{' '}
            <code>⊕N</code> badge — hover for the list.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <strong style={{ color: TOKENS.text }}>P/S:</strong> Valuation ÷ Annualized Revenue.
            Mcap (circulating) or FDV (fully-diluted) — gap reveals supply overhang. 30d × 12 or
            7d × 52.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <strong style={{ color: TOKENS.text }}>Rev/TVL:</strong> Annualized revenue ÷ TVL —
            capital efficiency, read as a yield on locked capital. &gt;50% green (exceptional,
            typically orderbook venues where TVL is just collateral), 10–50% neutral, &lt;10%
            dim. Tracks the same period toggle as P/S; protocols with no TVL show "—".
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <strong style={{ color: TOKENS.text }}>Joins:</strong> DefiLlama{' '}
            <code>/overview/fees</code> → <code>/protocols</code> (by parent slug, source of mcap
            + TVL) → CoinGecko <code>gecko_id</code> for FDV and as a mcap fallback when DefiLlama
            doesn't track the token (e.g. HYPE). A low multiple is not a buy signal — often
            reflects decaying revenue or heavy emissions.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: TOKENS.text }}>Token Grade:</strong> Composite 0-10 score
            across Mechanism (value accrual), Inflation (supply pressure), Multiple (valuation
            cheapness), and PMF (product-market fit). Final grade applies caps for
            low-mechanism and extreme overvaluation. Rubric adapted from{' '}
            <a
              href="https://x.com/0xkyle__"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: TOKENS.amber, textDecoration: 'underline' }}
            >
              @0xkyle__
            </a>
            ’s{' '}
            <a
              href="https://defillama-revenue.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: TOKENS.amber, textDecoration: 'underline' }}
            >
              Crypto Revenue Leaderboard
            </a>
            . Classifications manually curated; protocols without an authored grade show{' '}
            <code>—</code>.
          </p>
        </div>
      </main>

      {selectedRow && (
        <ProtocolModal protocol={selectedRow} onClose={() => setSelectedSlug(null)} />
      )}

      <BottomBar />
    </div>
  );
}
