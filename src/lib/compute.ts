// Pure functions only. All inputs are CryptoQuant arrays in their native
// most-recent-first order — index 0 is today, index N is N days ago.

import type { CQDataPoint } from '../../server/types.ts';
import { parseLooseDate } from './format.ts';

export function pickNumber(point: CQDataPoint | undefined, keys: string[]): number | null {
  if (!point) return null;
  for (const k of keys) {
    const v = point[k];
    if (v === undefined || v === null) continue;
    // CryptoQuant ships several metrics as numeric strings rather than
    // JSON numbers (SSR is the confirmed offender; reserve and MVRV may
    // do the same on some tiers). parseFloat tolerates both shapes and
    // strips trailing whitespace/units gracefully.
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Read a numeric series from the array. Returned in original (recent-first)
// order. Missing/invalid points become null and are filtered.
export function seriesOf(data: CQDataPoint[] | null, keys: string[]): number[] {
  if (!data) return [];
  const out: number[] = [];
  for (const p of data) {
    const v = pickNumber(p, keys);
    if (v !== null) out.push(v);
  }
  return out;
}

export function latestValue(data: CQDataPoint[] | null, keys: string[]): number | null {
  if (!data || data.length === 0) return null;
  return pickNumber(data[0], keys);
}

export function sumLastN(data: CQDataPoint[] | null, keys: string[], n: number): number | null {
  if (!data || data.length === 0) return null;
  const slice = data.slice(0, n);
  let total = 0;
  let counted = 0;
  for (const p of slice) {
    const v = pickNumber(p, keys);
    if (v !== null) {
      total += v;
      counted++;
    }
  }
  return counted > 0 ? total : null;
}

export function meanLastN(data: CQDataPoint[] | null, keys: string[], n: number): number | null {
  const slice = data ? data.slice(0, n) : [];
  let total = 0;
  let counted = 0;
  for (const p of slice) {
    const v = pickNumber(p, keys);
    if (v !== null) {
      total += v;
      counted++;
    }
  }
  return counted > 0 ? total / counted : null;
}

// Percent change between today (index 0) and N days ago (index N).
export function pctChangeNDaysAgo(
  data: CQDataPoint[] | null,
  keys: string[],
  n: number,
): number | null {
  if (!data || data.length <= n) return null;
  const now = pickNumber(data[0], keys);
  const then = pickNumber(data[n], keys);
  if (now === null || then === null || then === 0) return null;
  return (now - then) / then;
}

// Reverse to chart-friendly (oldest-first) order with parsed dates.
export function timelineFor(
  data: CQDataPoint[] | null,
  keys: string[],
  limit?: number,
): { labels: Date[]; values: number[] } {
  if (!data) return { labels: [], values: [] };
  const slice = limit ? data.slice(0, limit) : data;
  const labels: Date[] = [];
  const values: number[] = [];
  for (let i = slice.length - 1; i >= 0; i--) {
    const p = slice[i];
    const dateStr = (p.date ?? p.datetime) as string | undefined;
    const v = pickNumber(p, keys);
    if (!dateStr || v === null) continue;
    const d = parseLooseDate(dateStr);
    if (!d) continue;
    labels.push(d);
    values.push(v);
  }
  return { labels, values };
}

// Sums two recent-first series element-wise on shared dates. Used for
// USDT + USDC combined supply.
export function combineSeriesByDate(
  a: CQDataPoint[] | null,
  b: CQDataPoint[] | null,
  keys: string[],
): CQDataPoint[] {
  if (!a || !b) return a ?? b ?? [];
  const bMap = new Map<string, number>();
  for (const p of b) {
    const d = (p.date ?? p.datetime) as string | undefined;
    const v = pickNumber(p, keys);
    if (d && v !== null) bMap.set(d, v);
  }
  const out: CQDataPoint[] = [];
  for (const p of a) {
    const d = (p.date ?? p.datetime) as string | undefined;
    const av = pickNumber(p, keys);
    if (!d || av === null) continue;
    const bv = bMap.get(d);
    if (bv === undefined) continue;
    out.push({ date: d, total_supply: av + bv });
  }
  return out;
}

// ---------- Alt Flow Index ----------

export const STABLE_SUPPLY_KEYS = ['supply_total', 'supply_circulating', 'total_supply', 'value'];
// netflow_total is in coin units for BTC/ETH; for stablecoin endpoints it's
// already in USD. Same key, different unit per asset — the unit context is
// the caller's responsibility.
export const NETFLOW_KEYS = ['netflow_total_usd', 'netflow_usd', 'netflow_total'];
export const SSR_KEYS = ['stablecoin_supply_ratio', 'ssr', 'value'];
export const MVRV_KEYS = ['mvrv', 'value'];
export const RESERVE_KEYS = ['reserve', 'value'];
export const WHALE_RATIO_KEYS = ['exchange_whale_ratio', 'whale_ratio', 'value'];
// Coinglass funding-rate-history series.
export const FUNDING_RATE_KEYS = ['close', 'fundingRate', 'funding_rate', 'value'];
export const LONG_SHORT_KEYS = ['top_position_long_short_ratio', 'longShortRatio', 'long_short_ratio', 'ratio', 'value'];
// Coinglass aggregated-OI series — `close` is the OI in USD at candle close.
export const OPEN_INTEREST_KEYS = ['close', 'openInterest', 'open_interest', 'value'];

export interface AltFlowInputs {
  stableUsdt: CQDataPoint[] | null;
  stableUsdc: CQDataPoint[] | null;
  btcNetflow: CQDataPoint[] | null;
  ethNetflow: CQDataPoint[] | null;
  ssr: CQDataPoint[] | null;
  btcFunding: CQDataPoint[] | null;
  ethFunding: CQDataPoint[] | null;
}

export interface AltFlowComponent {
  key: string;
  weight: number;
  score: number | null;
  label: string;
  detail: string;
}

export interface AltFlowResult {
  score: number | null;
  components: AltFlowComponent[];
}

function tanh100(x: number): number {
  return Math.tanh(x) * 100;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function computeAltFlowIndex(inputs: AltFlowInputs): AltFlowResult {
  const stableCombined = combineSeriesByDate(
    inputs.stableUsdt,
    inputs.stableUsdc,
    STABLE_SUPPLY_KEYS,
  );
  const stable7dExpansion = pctChangeNDaysAgo(
    stableCombined.length > 0 ? stableCombined : null,
    STABLE_SUPPLY_KEYS,
    7,
  );
  const btc7dNetflow = sumLastN(inputs.btcNetflow, NETFLOW_KEYS, 7);
  const eth7dNetflow = sumLastN(inputs.ethNetflow, NETFLOW_KEYS, 7);
  const ssrNow = latestValue(inputs.ssr, SSR_KEYS);
  const ssrMean30 = meanLastN(inputs.ssr, SSR_KEYS, 30);
  const btcFunding14 = meanLastN(inputs.btcFunding, FUNDING_RATE_KEYS, 14);
  const ethFunding14 = meanLastN(inputs.ethFunding, FUNDING_RATE_KEYS, 14);
  // Average BTC and ETH 14d funding-rate posture. If only one is available,
  // use it alone — partial input still produces a meaningful read.
  const fundingParts = [btcFunding14, ethFunding14].filter(
    (v): v is number => v !== null,
  );
  const fundingPosture =
    fundingParts.length === 0
      ? null
      : fundingParts.reduce((a, b) => a + b, 0) / fundingParts.length;

  // Weights updated 2026-05-01 to incorporate funding-rate posture as a
  // sentiment counterweight to the four flow components. Scores from before
  // this date are NOT directly comparable.
  const components: AltFlowComponent[] = [
    {
      key: 'stable',
      weight: 0.35,
      label: 'Stablecoin supply',
      detail: '7d expansion (USDT+USDC)',
      score:
        stable7dExpansion === null
          ? null
          : clamp(tanh100(stable7dExpansion / 0.01), -100, 100),
    },
    {
      key: 'btc',
      weight: 0.22,
      label: 'BTC exchange netflow',
      detail: '7d sum, BTC (negative = bullish)',
      // ~50,000 BTC over 7d is a strong saturation signal.
      score:
        btc7dNetflow === null
          ? null
          : clamp(tanh100(-btc7dNetflow / 50_000), -100, 100),
    },
    {
      key: 'eth',
      weight: 0.13,
      label: 'ETH exchange netflow',
      detail: '7d sum, ETH (negative = bullish)',
      // ~500,000 ETH over 7d is a strong saturation signal.
      score:
        eth7dNetflow === null
          ? null
          : clamp(tanh100(-eth7dNetflow / 500_000), -100, 100),
    },
    {
      key: 'ssr',
      weight: 0.15,
      label: 'SSR posture',
      detail: 'vs 30d mean (low = bullish)',
      score:
        ssrNow === null || ssrMean30 === null
          ? null
          : clamp(tanh100((ssrMean30 - ssrNow) / 0.5), -100, 100),
    },
    {
      key: 'funding',
      weight: 0.15,
      label: 'Funding posture',
      detail: '14d mean BTC+ETH (high = bearish)',
      // ±0.0003 daily ≈ 0.03% per 8h funding period. Sign inverted: high
      // funding → bearish for risk-on positioning.
      score:
        fundingPosture === null
          ? null
          : clamp(tanh100(-fundingPosture / 0.0003), -100, 100),
    },
  ];

  let totalWeight = 0;
  let weighted = 0;
  for (const c of components) {
    if (c.score === null) continue;
    totalWeight += c.weight;
    weighted += c.weight * c.score;
  }
  const score = totalWeight > 0 ? weighted / totalWeight : null;

  return { score, components };
}

export function describeScore(score: number | null): { label: string; tone: 'pos' | 'neg' | 'neu' } {
  if (score === null) return { label: 'No data', tone: 'neu' };
  if (score > 40) return { label: 'Risk-on for alts', tone: 'pos' };
  if (score > 10) return { label: 'Mildly constructive', tone: 'pos' };
  if (score >= -10) return { label: 'Neutral', tone: 'neu' };
  if (score >= -40) return { label: 'Defensive', tone: 'neg' };
  return { label: 'Risk-off', tone: 'neg' };
}
