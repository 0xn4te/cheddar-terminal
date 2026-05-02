import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TERMINAL_GLOBAL_CSS, TopBar, BottomBar } from './_TerminalShell';
import fundamentalsData from '../data/ngx-fundamentals.json';

// ─── page-scoped tokens ───────────────────────────────────────────────────
// NGXV signature: green editorial accent on the Bloomberg dark base.
// CPVF uses amber; the colour shift is the only at-a-glance "which module
// am I in" cue, so don't hoist these into the global stylesheet.

const NGXV_TOKENS = {
  bg: '#0a0a0a',
  surface: '#141414',
  surfaceHover: '#1a1a1a',
  border: '#1f1f1f',
  text: '#e8e8e8',
  textMuted: '#888',
  textDim: '#555',
  accent: '#3FB950',
  accentDim: '#2a7a3f',
  green: '#3FB950',
  red: '#f04747',
  warn: '#d4a544',
} as const;

// ─── data shapes ──────────────────────────────────────────────────────────

interface RawStock {
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
  price_updated: string;
  source_url: string;
  notes?: string;
  chart_symbol?: string;
}

interface FundamentalsFile {
  schema_version: number;
  universe_updated: string;
  fx_note: string;
  stocks: RawStock[];
}

interface NgxQuote {
  ticker: string;
  price: number;
  asof: string;
  source: 'kwayisi' | 'ngxgroup';
}

interface NgxPricesResponse {
  fetchedAt: number;
  stale: boolean;
  quotes: Record<string, NgxQuote>;
  error?: string;
  fallback?: boolean;
}

type PriceMode = 'live' | 'stale' | 'offline';
type Currency = 'ngn' | 'usd';
type SortDir = 'asc' | 'desc';
type SortKey =
  | 'ticker' | 'sector' | 'price' | 'mcap_ngn' | 'eps_ttm' | 'pe'
  | 'book_value_per_share' | 'pb' | 'pbVsMedian' | 'dividend_per_share_ttm'
  | 'divYield' | 'avd_30d' | 'days';

interface EnrichedRow extends RawStock {
  mcap_ngn: number;
  pe: number | null;
  pb: number | null;
  divYield: number | null;
  pbVsMedian: number | null;
  days: number;
  isStale: boolean;
  isThin: boolean;
  priceFromLive: boolean;
  asof: string | null;
}

const FUNDAMENTALS = fundamentalsData as FundamentalsFile;

// ─── formatters ───────────────────────────────────────────────────────────

const toDisplay = (
  valueNgn: number | null,
  currency: Currency,
  fxRate: number | null,
): number | null => {
  if (valueNgn == null || isNaN(valueNgn)) return null;
  if (currency === 'usd' && fxRate && fxRate > 0) return valueNgn / fxRate;
  return valueNgn;
};

const symbolFor = (currency: Currency): string => (currency === 'usd' ? '$' : '₦');

const fmtMcap = (
  valueNgn: number | null,
  currency: Currency,
  fxRate: number | null,
): string => {
  const v = toDisplay(valueNgn, currency, fxRate);
  if (v == null || v === 0) return '—';
  const abs = Math.abs(v);
  const sym = symbolFor(currency);
  if (abs >= 1e12) return sym + (v / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return sym + (v / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return sym + (v / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return sym + (v / 1e3).toFixed(1) + 'K';
  return sym + v.toFixed(0);
};

const fmtMoney = (
  valueNgn: number | null,
  currency: Currency,
  fxRate: number | null,
): string => {
  const v = toDisplay(valueNgn, currency, fxRate);
  if (v == null || isNaN(v)) return '—';
  const sym = symbolFor(currency);
  const abs = Math.abs(v);
  if (currency === 'usd') {
    if (abs >= 1) return sym + v.toFixed(3);
    return sym + v.toFixed(4);
  }
  if (abs >= 100) return sym + v.toFixed(1);
  return sym + v.toFixed(2);
};

const fmtRatio = (n: number | null): string => {
  if (n == null || isNaN(n) || !isFinite(n) || n <= 0) return '—';
  if (n < 1) return n.toFixed(2) + '×';
  if (n < 10) return n.toFixed(1) + '×';
  if (n < 1000) return Math.round(n) + '×';
  return '999+×';
};

const fmtPct = (n: number | null): string => {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  if (Math.abs(n) >= 1000) return sign + Math.round(n) + '%';
  return sign + n.toFixed(1) + '%';
};

const fmtPctPlain = (n: number | null): string => {
  if (n == null || isNaN(n) || !isFinite(n) || n <= 0) return '—';
  if (n >= 100) return n.toFixed(0) + '%';
  if (n >= 10) return n.toFixed(1) + '%';
  return n.toFixed(2) + '%';
};

const fmtDateRel = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (isNaN(days)) return iso;
  if (days < 1) return 'today';
  if (days < 30) return days + 'd ago';
  if (days < 365) return Math.floor(days / 30) + 'mo ago';
  return Math.floor(days / 365) + 'y ago';
};

const daysSince = (iso: string | null | undefined): number => {
  if (!iso) return Infinity;
  const d = new Date(iso);
  return (Date.now() - d.getTime()) / 86400000;
};

// ─── color tiers ──────────────────────────────────────────────────────────

const peColor = (pe: number | null): string => {
  if (pe == null) return NGXV_TOKENS.textDim;
  if (pe < 5) return NGXV_TOKENS.green;
  if (pe < 10) return NGXV_TOKENS.text;
  if (pe < 20) return NGXV_TOKENS.text;
  if (pe < 40) return NGXV_TOKENS.warn;
  return NGXV_TOKENS.red;
};

const pbColor = (pb: number | null): string => {
  if (pb == null) return NGXV_TOKENS.textDim;
  if (pb < 0.5) return NGXV_TOKENS.green;
  if (pb < 1.0) return NGXV_TOKENS.green;
  if (pb < 2.0) return NGXV_TOKENS.text;
  if (pb < 5.0) return NGXV_TOKENS.warn;
  return NGXV_TOKENS.red;
};

const yieldColor = (y: number | null): string => {
  if (y == null || y <= 0) return NGXV_TOKENS.textDim;
  if (y >= 10) return NGXV_TOKENS.green;
  if (y >= 5) return NGXV_TOKENS.text;
  if (y >= 2) return NGXV_TOKENS.textMuted;
  return NGXV_TOKENS.textDim;
};

// P/B Δ vs sector median: discount = green (cheap vs peers), premium = red.
const pbDeltaColor = (delta: number | null): string => {
  if (delta == null || isNaN(delta)) return NGXV_TOKENS.textDim;
  if (delta < -0.15) return NGXV_TOKENS.green;
  if (delta < 0) return NGXV_TOKENS.green;
  if (delta < 0.15) return NGXV_TOKENS.text;
  return NGXV_TOKENS.red;
};

// ─── liquidity thresholds (min NGN/day AVD) ───────────────────────────────

const LIQUIDITY_PRESETS: { label: string; v: number }[] = [
  { label: 'all', v: 0 },
  { label: '₦1M', v: 1e6 },
  { label: '₦10M', v: 1e7 },
  { label: '₦50M', v: 5e7 },
  { label: '₦100M', v: 1e8 },
];

// ─── page CSS ─────────────────────────────────────────────────────────────

const NGXV_CSS = `
  .ngxv-bar {
    background: ${NGXV_TOKENS.surface};
    border-bottom: 1px solid ${NGXV_TOKENS.border};
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .ngxv-bar__left {
    display: flex;
    align-items: baseline;
    gap: 12px;
    letter-spacing: 0.08em;
  }
  .ngxv-bar__code {
    font-size: 11px;
    color: ${NGXV_TOKENS.accent};
  }
  .ngxv-bar__title {
    font-size: 13px;
    color: ${NGXV_TOKENS.text};
    letter-spacing: 0.06em;
  }
  .ngxv-bar__back {
    font-size: 11px;
    letter-spacing: 0.08em;
    color: ${NGXV_TOKENS.textDim};
    transition: color 120ms;
  }
  .ngxv-bar__back:hover {
    color: ${NGXV_TOKENS.accent};
  }

  .ngxv-toolbar {
    background: ${NGXV_TOKENS.bg};
    border-bottom: 1px solid ${NGXV_TOKENS.border};
    padding: 8px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 10px;
    letter-spacing: 0.08em;
    color: ${NGXV_TOKENS.textDim};
  }

  .ngxv-page {
    max-width: 1500px;
    margin: 0 auto;
    padding: 32px 20px 48px;
  }

  .ngxv-chip {
    display: inline-flex; align-items: center;
    padding: 5px 10px; font-size: 10px;
    letter-spacing: 0.1em; text-transform: uppercase;
    cursor: pointer;
    transition: background 120ms, color 120ms, border-color 120ms;
    border: 1px solid ${NGXV_TOKENS.border};
    color: ${NGXV_TOKENS.textMuted};
    background: transparent;
    font-family: inherit;
  }
  .ngxv-chip:hover:not(.ngxv-chip--active):not(.ngxv-chip--disabled) {
    background: ${NGXV_TOKENS.surfaceHover};
    color: ${NGXV_TOKENS.text};
  }
  .ngxv-chip--active {
    background: ${NGXV_TOKENS.accent};
    color: #000;
    border-color: ${NGXV_TOKENS.accent};
  }
  .ngxv-chip--disabled { opacity: 0.4; cursor: not-allowed; }

  .ngxv-input, .ngxv-select {
    background: ${NGXV_TOKENS.surface};
    border: 1px solid ${NGXV_TOKENS.border};
    color: ${NGXV_TOKENS.text};
    padding: 7px 10px;
    font-family: inherit;
    font-size: 11px;
    letter-spacing: 0.05em;
    outline: none;
  }
  .ngxv-input::placeholder { color: ${NGXV_TOKENS.textDim}; }
  .ngxv-input:focus, .ngxv-select:focus { border-color: ${NGXV_TOKENS.accent}; }
  .ngxv-select option { background: ${NGXV_TOKENS.surface}; color: ${NGXV_TOKENS.text}; }

  .ngxv-th {
    cursor: pointer; user-select: none; white-space: nowrap;
    transition: color 120ms;
  }
  .ngxv-th:hover { color: ${NGXV_TOKENS.accent}; }

  .ngxv-row { transition: background 90ms; }
  .ngxv-row:hover { background: ${NGXV_TOKENS.surface}; }

  .ngxv-link { color: ${NGXV_TOKENS.text}; transition: color 120ms; font-weight: 500; }
  .ngxv-link:hover { color: ${NGXV_TOKENS.accent}; }

  .ngxv-table { border-collapse: collapse; width: 100%; font-size: 11px; }
  .ngxv-table th, .ngxv-table td {
    font-variant-numeric: tabular-nums;
    padding: 10px 10px 10px 0;
  }
  .ngxv-table th {
    text-align: left;
    font-size: 9px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: ${NGXV_TOKENS.accent};
    padding: 12px 10px 12px 0;
    border-bottom: 1px solid ${NGXV_TOKENS.border};
    font-weight: 500;
  }
  .ngxv-table td {
    border-bottom: 1px solid ${NGXV_TOKENS.border};
  }
  .ngxv-table .num { text-align: right; }

  .ngxv-badge {
    display: inline-block;
    padding: 1px 5px;
    margin-left: 6px;
    font-size: 9px;
    border: 1px solid ${NGXV_TOKENS.border};
    color: ${NGXV_TOKENS.warn};
    letter-spacing: 0.05em;
  }
  .ngxv-badge--dim {
    color: ${NGXV_TOKENS.textDim};
  }

  .ngxv-eyebrow {
    font-size: 10px;
    color: ${NGXV_TOKENS.accent};
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin-bottom: 12px;
  }

  .ngxv-tile {
    background: ${NGXV_TOKENS.surface};
    border: 1px solid ${NGXV_TOKENS.border};
    padding: 14px 18px;
  }
  .ngxv-tile__label {
    font-size: 9px;
    color: ${NGXV_TOKENS.accent};
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .ngxv-tile__value {
    font-size: 24px;
    color: ${NGXV_TOKENS.text};
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    line-height: 1;
  }

  .ngxv-method {
    border-top: 1px solid ${NGXV_TOKENS.border};
    color: ${NGXV_TOKENS.textMuted};
    max-width: 640px;
    margin-top: 48px;
    padding-top: 20px;
    font-size: 11px;
    line-height: 1.6;
  }
  .ngxv-method__h {
    font-size: 9px;
    color: ${NGXV_TOKENS.accent};
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin-bottom: 12px;
  }
  .ngxv-method strong {
    color: ${NGXV_TOKENS.text};
    font-weight: 500;
  }
  .ngxv-method__attr {
    font-size: 9px;
    color: ${NGXV_TOKENS.textDim};
    margin-top: 16px;
  }

  .ngxv-callout {
    border: 1px solid ${NGXV_TOKENS.border};
    border-left: 2px solid ${NGXV_TOKENS.warn};
    background: ${NGXV_TOKENS.surface};
    padding: 10px 14px;
    margin-bottom: 16px;
    font-size: 11px;
    color: ${NGXV_TOKENS.textMuted};
    line-height: 1.6;
  }
`;

// ─── component ────────────────────────────────────────────────────────────

export default function NGXValuation() {
  const [livePrices, setLivePrices] = useState<Record<string, NgxQuote>>({});
  const [priceMode, setPriceMode] = useState<PriceMode>('offline');
  const [pricesFetchedAt, setPricesFetchedAt] = useState<number | null>(null);
  const [pricesLoading, setPricesLoading] = useState(true);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  const [fxRate, setFxRate] = useState<number | null>(null);
  const [fxError, setFxError] = useState<string | null>(null);

  const [currency, setCurrency] = useState<Currency>('ngn');
  const [sector, setSector] = useState<string>('All');
  const [liquidityMin, setLiquidityMin] = useState<number>(1_000_000);
  const [search, setSearch] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('pe');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Tickers passed to the scraper (use chart_symbol when defined — e.g. FBNH → FIRSTHOLDCO).
  const tickerList = useMemo(
    () =>
      FUNDAMENTALS.stocks.map((s) =>
        (s.chart_symbol || s.ticker).toUpperCase(),
      ),
    [],
  );

  const loadPrices = useCallback(
    async (refresh = false) => {
      setPricesLoading(true);
      setScrapeError(null);
      try {
        const url =
          '/api/ngx/prices?tickers=' +
          encodeURIComponent(tickerList.join(',')) +
          (refresh ? '&refresh=1' : '');
        const resp = await fetch(url);
        if (!resp.ok) {
          const errBody = (await resp.json().catch(() => ({}))) as { error?: string };
          throw new Error(errBody.error || `HTTP ${resp.status}`);
        }
        const body = (await resp.json()) as NgxPricesResponse;
        const got = body.quotes || {};
        setLivePrices(got);
        setPricesFetchedAt(body.fetchedAt);
        if (Object.keys(got).length === 0) {
          setPriceMode('offline');
        } else if (body.stale) {
          setPriceMode('stale');
        } else {
          setPriceMode('live');
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[ngxv] price fetch failed:', msg);
        setScrapeError(msg);
        setPriceMode('offline');
      } finally {
        setPricesLoading(false);
      }
    },
    [tickerList],
  );

  // FX is browser-side: open.er-api.com is CORS-friendly and key-less.
  const loadFx = useCallback(async () => {
    try {
      const resp = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!resp.ok) {
        setFxError('FX HTTP ' + resp.status);
        return;
      }
      const j = (await resp.json()) as { rates?: Record<string, number> };
      const rate = j && j.rates && j.rates.NGN ? Number(j.rates.NGN) : null;
      if (rate && rate > 0) {
        setFxRate(rate);
        setFxError(null);
      } else {
        setFxError('FX rate not in payload');
      }
    } catch (e) {
      setFxError(e instanceof Error ? e.message : 'FX fetch failed');
    }
  }, []);

  useEffect(() => {
    loadPrices(false);
    loadFx();
  }, [loadPrices, loadFx]);

  const enriched: EnrichedRow[] = useMemo(() => {
    return FUNDAMENTALS.stocks.map((s) => {
      const liveKey = (s.chart_symbol || s.ticker).toUpperCase();
      const live = livePrices[liveKey];
      const price = live && live.price > 0 ? live.price : Number(s.price) || 0;
      const avd = Number(s.avd_30d) || 0;
      const mcapNgn = price * (Number(s.shares_outstanding) || 0);
      const pe = s.eps_ttm > 0 && price > 0 ? price / s.eps_ttm : null;
      const pb =
        s.book_value_per_share > 0 && price > 0 ? price / s.book_value_per_share : null;
      const divYield =
        s.dividend_per_share_ttm > 0 && price > 0
          ? (s.dividend_per_share_ttm / price) * 100
          : null;
      const days = daysSince(s.last_updated);
      const isStale = days > 90;
      const isThin = avd < 1_000_000;
      return {
        ...s,
        price,
        avd_30d: avd,
        mcap_ngn: mcapNgn,
        pe,
        pb,
        divYield,
        pbVsMedian: null,
        days,
        isStale,
        isThin,
        priceFromLive: !!live,
        asof: live ? live.asof : null,
      };
    });
  }, [livePrices]);

  // P/B median per sector (computed in-universe — no external benchmark).
  const sectorPbMedians = useMemo(() => {
    const out: Record<string, number> = {};
    const bySector: Record<string, EnrichedRow[]> = {};
    enriched.forEach((s) => {
      if (!bySector[s.sector]) bySector[s.sector] = [];
      bySector[s.sector].push(s);
    });
    for (const [sec, stocks] of Object.entries(bySector)) {
      const pbs = stocks
        .map((s) => s.pb)
        .filter((x): x is number => x != null && x > 0)
        .sort((a, b) => a - b);
      if (pbs.length > 0) {
        out[sec] = pbs[Math.floor(pbs.length / 2)];
      }
    }
    return out;
  }, [enriched]);

  const enrichedWithDelta: EnrichedRow[] = useMemo(() => {
    return enriched.map((s) => {
      const median = sectorPbMedians[s.sector];
      const pbVsMedian = median != null && s.pb != null ? (s.pb - median) / median : null;
      return { ...s, pbVsMedian };
    });
  }, [enriched, sectorPbMedians]);

  const sectors = useMemo(() => {
    const set = new Set<string>();
    FUNDAMENTALS.stocks.forEach((s) => s.sector && set.add(s.sector));
    return ['All', ...Array.from(set).sort()];
  }, []);

  const filtered = useMemo(() => {
    return enrichedWithDelta
      .filter((s) => sector === 'All' || s.sector === sector)
      .filter((s) => (s.avd_30d || 0) >= liquidityMin)
      .filter((s) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (
          s.name.toLowerCase().includes(q) || s.ticker.toLowerCase().includes(q)
        );
      });
  }, [enrichedWithDelta, sector, liquidityMin, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey] as number | string | null;
      const bv = b[sortKey] as number | string | null;
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
  }, [filtered, sortKey, sortDir]);

  const stats = useMemo(() => {
    if (sorted.length === 0) return null;
    const pes = sorted
      .map((s) => s.pe)
      .filter((x): x is number => x != null && x > 0)
      .sort((a, b) => a - b);
    const pbs = sorted
      .map((s) => s.pb)
      .filter((x): x is number => x != null && x > 0)
      .sort((a, b) => a - b);
    const totalMcap = sorted.reduce((sum, s) => sum + (s.mcap_ngn || 0), 0);
    return {
      count: sorted.length,
      medianPe: pes.length ? pes[Math.floor(pes.length / 2)] : null,
      medianPb: pbs.length ? pbs[Math.floor(pbs.length / 2)] : null,
      totalMcap,
    };
  }, [sorted]);

  const trapCount = useMemo(
    () => enrichedWithDelta.filter((s) => s.isStale || s.isThin).length,
    [enrichedWithDelta],
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      const asc = key === 'pe' || key === 'pb' || key === 'ticker' || key === 'sector';
      setSortDir(asc ? 'asc' : 'desc');
    }
  };

  const sortArrow = (k: SortKey) =>
    sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const fxAvailable = !fxError && fxRate != null && fxRate > 0;

  // Status badge label + colour at top-right of the toolbar.
  const badge = (() => {
    if (pricesLoading && !pricesFetchedAt) {
      return { label: 'FETCHING NGX', color: NGXV_TOKENS.textMuted };
    }
    if (priceMode === 'live') {
      return { label: 'LIVE NGX', color: NGXV_TOKENS.green };
    }
    if (priceMode === 'stale' && pricesFetchedAt) {
      const t = new Date(pricesFetchedAt);
      const hh = String(t.getHours()).padStart(2, '0');
      const mm = String(t.getMinutes()).padStart(2, '0');
      return { label: `STALE · LAST ${hh}:${mm}`, color: NGXV_TOKENS.warn };
    }
    return { label: 'OFFLINE · FALLBACK PRICES', color: NGXV_TOKENS.warn };
  })();

  // The on-screen "prices as of" string — we surface the most recent kwayisi
  // close date when available, otherwise the JSON snapshot date.
  const asofLabel = (() => {
    const liveAsofs = Object.values(livePrices)
      .map((q) => q.asof)
      .filter(Boolean) as string[];
    if (liveAsofs.length > 0) {
      const latest = liveAsofs.sort().slice(-1)[0];
      return new Date(latest).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
    return FUNDAMENTALS.universe_updated;
  })();

  return (
    <div className="cheddar-page">
      <style>{TERMINAL_GLOBAL_CSS}</style>
      <style>{NGXV_CSS}</style>
      <TopBar />

      <div className="ngxv-bar">
        <div className="ngxv-bar__left">
          <span className="ngxv-bar__code">MODULE NGXV</span>
          <span className="ngxv-bar__title">NGX VALUATION</span>
        </div>
        <Link to="/" className="ngxv-bar__back">
          ← BACK TO TERMINAL
        </Link>
      </div>

      <div className="ngxv-toolbar">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: badge.color }}>● {badge.label}</span>
          <span style={{ color: NGXV_TOKENS.textDim }}>·</span>
          <span>PRICES AS OF {asofLabel.toUpperCase()}</span>
          {fxAvailable && (
            <>
              <span style={{ color: NGXV_TOKENS.textDim }}>·</span>
              <span style={{ color: NGXV_TOKENS.green }}>
                FX 1 USD = ₦{fxRate!.toFixed(2)}
              </span>
            </>
          )}
          {!fxAvailable && (
            <>
              <span style={{ color: NGXV_TOKENS.textDim }}>·</span>
              <span style={{ color: NGXV_TOKENS.warn }}>FX OFFLINE</span>
            </>
          )}
          <span style={{ color: NGXV_TOKENS.textDim }}>·</span>
          <span>{FUNDAMENTALS.stocks.length} NAMES</span>
        </span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => loadPrices(true)}
            className="ngxv-chip"
            disabled={pricesLoading}
            title="Bust the server-side 1-hour cache and refetch"
          >
            {pricesLoading ? '↻ LOADING…' : '↻ REFRESH'}
          </button>
          <button
            onClick={() => fxAvailable && setCurrency((c) => (c === 'ngn' ? 'usd' : 'ngn'))}
            className={'ngxv-chip ' + (fxAvailable ? '' : 'ngxv-chip--disabled')}
            title={fxAvailable ? 'Toggle NGN ↔ USD' : 'FX unavailable'}
          >
            {currency === 'ngn' ? '₦ NGN' : '$ USD'}
          </button>
        </span>
      </div>

      <main className="ngxv-page">
        <div className="ngxv-eyebrow">── NGX EQUITIES SCREENER</div>
        <p
          style={{
            color: NGXV_TOKENS.textMuted,
            fontSize: 13,
            lineHeight: 1.65,
            maxWidth: '60ch',
            margin: '0 0 32px',
          }}
        >
          Nigerian Exchange listings ranked by P/E, P/B and dividend yield. Bank rows show
          their P/B premium or discount versus the in-universe sector median — the only
          "cheap vs peers" signal that consistently matters for financials. Numbers are
          pasted from filings; source link sits on every ticker. Stale rows (&gt;90 days
          since last filing) are dimmed with a warning badge so you don't operate on rotten
          data.
        </p>

        {/* ── stat tiles ──────────────────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 28,
          }}
        >
          <div className="ngxv-tile">
            <div className="ngxv-tile__label">Matches</div>
            <div className="ngxv-tile__value">{stats ? stats.count : '—'}</div>
          </div>
          <div className="ngxv-tile">
            <div className="ngxv-tile__label">Med P/E</div>
            <div className="ngxv-tile__value">{stats ? fmtRatio(stats.medianPe) : '—'}</div>
          </div>
          <div className="ngxv-tile">
            <div className="ngxv-tile__label">Med P/B</div>
            <div className="ngxv-tile__value">{stats ? fmtRatio(stats.medianPb) : '—'}</div>
          </div>
          <div className="ngxv-tile">
            <div className="ngxv-tile__label">Σ Mcap</div>
            <div className="ngxv-tile__value">
              {stats ? fmtMcap(stats.totalMcap, currency, fxRate) : '—'}
            </div>
          </div>
        </div>

        {/* ── filter row ──────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            padding: '14px 0',
            borderTop: `1px solid ${NGXV_TOKENS.border}`,
            borderBottom: `1px solid ${NGXV_TOKENS.border}`,
            marginBottom: 16,
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search ticker or name…"
            className="ngxv-input"
            style={{ width: 220 }}
          />
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="ngxv-select"
          >
            {sectors.map((s) => (
              <option key={s} value={s}>
                sector · {s}
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                color: NGXV_TOKENS.textDim,
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginRight: 4,
              }}
            >
              liq min
            </span>
            {LIQUIDITY_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setLiquidityMin(p.v)}
                className={
                  'ngxv-chip ' + (liquidityMin === p.v ? 'ngxv-chip--active' : '')
                }
                title="Minimum 30-day average daily value traded"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── trap-flag callout ───────────────────────────────────────── */}
        {trapCount > 0 && (
          <div className="ngxv-callout">
            <strong style={{ color: NGXV_TOKENS.warn, letterSpacing: '0.08em' }}>
              ⚠ {trapCount} TRAP{trapCount === 1 ? '' : 'S'} FLAGGED ·{' '}
            </strong>
            Rows with last-filed fundamentals &gt;90 days old or 30-day AVD &lt;₦1M/day are
            dimmed. Treat them as suspect until you've reconciled against the latest filing
            (click the ticker to open the source).
          </div>
        )}

        {/* ── scrape error notice (non-blocking) ──────────────────────── */}
        {scrapeError && priceMode === 'offline' && (
          <div className="ngxv-callout">
            <strong style={{ color: NGXV_TOKENS.warn }}>SCRAPER UNAVAILABLE · </strong>
            Falling back to {FUNDAMENTALS.universe_updated} JSON snapshot. ({scrapeError})
          </div>
        )}

        {/* ── table ───────────────────────────────────────────────────── */}
        <div style={{ overflowX: 'auto' }}>
          <table className="ngxv-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}>#</th>
                <th className="ngxv-th" onClick={() => toggleSort('ticker')}>
                  Ticker{sortArrow('ticker')}
                </th>
                <th className="ngxv-th" onClick={() => toggleSort('sector')}>
                  Sector{sortArrow('sector')}
                </th>
                <th className="ngxv-th num" onClick={() => toggleSort('price')}>
                  Price{sortArrow('price')}
                </th>
                <th className="ngxv-th num" onClick={() => toggleSort('mcap_ngn')}>
                  Mcap{sortArrow('mcap_ngn')}
                </th>
                <th className="ngxv-th num" onClick={() => toggleSort('eps_ttm')}>
                  EPS{sortArrow('eps_ttm')}
                </th>
                <th className="ngxv-th num" onClick={() => toggleSort('pe')}>
                  P/E{sortArrow('pe')}
                </th>
                <th
                  className="ngxv-th num"
                  onClick={() => toggleSort('book_value_per_share')}
                >
                  BVPS{sortArrow('book_value_per_share')}
                </th>
                <th className="ngxv-th num" onClick={() => toggleSort('pb')}>
                  P/B{sortArrow('pb')}
                </th>
                <th
                  className="ngxv-th num"
                  onClick={() => toggleSort('pbVsMedian')}
                  title="P/B premium (+) or discount (−) vs sector median"
                >
                  P/B Δ{sortArrow('pbVsMedian')}
                </th>
                <th
                  className="ngxv-th num"
                  onClick={() => toggleSort('dividend_per_share_ttm')}
                >
                  DPS{sortArrow('dividend_per_share_ttm')}
                </th>
                <th className="ngxv-th num" onClick={() => toggleSort('divYield')}>
                  Yield{sortArrow('divYield')}
                </th>
                <th
                  className="ngxv-th num"
                  onClick={() => toggleSort('avd_30d')}
                  title="30-day average daily value traded"
                >
                  AVD{sortArrow('avd_30d')}
                </th>
                <th className="ngxv-th num" onClick={() => toggleSort('days')}>
                  Updated{sortArrow('days')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => {
                const dimmed = s.isStale || s.isThin;
                const sectorMed = sectorPbMedians[s.sector];
                return (
                  <tr
                    key={s.ticker}
                    className="ngxv-row"
                    style={{
                      color: dimmed ? NGXV_TOKENS.textDim : NGXV_TOKENS.text,
                      opacity: dimmed ? 0.6 : 1,
                    }}
                  >
                    <td style={{ color: NGXV_TOKENS.textDim }}>
                      {String(i + 1).padStart(2, '0')}
                    </td>
                    <td>
                      <a
                        href={s.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ngxv-link"
                        title={s.notes || `Open ${s.name} filing`}
                      >
                        {s.ticker}
                      </a>
                      {s.isStale && (
                        <span
                          className="ngxv-badge"
                          title={`Last updated ${s.last_updated} (${Math.floor(
                            s.days,
                          )}d ago)`}
                        >
                          STALE
                        </span>
                      )}
                      {s.isThin && !s.isStale && (
                        <span
                          className="ngxv-badge ngxv-badge--dim"
                          title={`AVD only ${fmtMcap(s.avd_30d, 'ngn', null)}/day`}
                        >
                          THIN
                        </span>
                      )}
                      <div
                        style={{
                          color: NGXV_TOKENS.textMuted,
                          fontSize: 10,
                          marginTop: 2,
                        }}
                      >
                        {s.name}
                      </div>
                    </td>
                    <td
                      style={{
                        color: NGXV_TOKENS.textMuted,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.sector}
                    </td>
                    <td className="num">{fmtMoney(s.price, currency, fxRate)}</td>
                    <td className="num">{fmtMcap(s.mcap_ngn, currency, fxRate)}</td>
                    <td className="num" style={{ color: NGXV_TOKENS.textMuted }}>
                      {fmtMoney(s.eps_ttm, currency, fxRate)}
                    </td>
                    <td className="num" style={{ color: peColor(s.pe), fontWeight: 500 }}>
                      {fmtRatio(s.pe)}
                    </td>
                    <td className="num" style={{ color: NGXV_TOKENS.textMuted }}>
                      {fmtMoney(s.book_value_per_share, currency, fxRate)}
                    </td>
                    <td className="num" style={{ color: pbColor(s.pb), fontWeight: 500 }}>
                      {fmtRatio(s.pb)}
                    </td>
                    <td
                      className="num"
                      style={{ color: pbDeltaColor(s.pbVsMedian) }}
                      title={
                        sectorMed != null
                          ? `${s.sector} P/B median: ${fmtRatio(sectorMed)}`
                          : 'no sector median'
                      }
                    >
                      {s.pbVsMedian == null ? '—' : fmtPct(s.pbVsMedian * 100)}
                    </td>
                    <td className="num" style={{ color: NGXV_TOKENS.textMuted }}>
                      {fmtMoney(s.dividend_per_share_ttm, currency, fxRate)}
                    </td>
                    <td className="num" style={{ color: yieldColor(s.divYield) }}>
                      {fmtPctPlain(s.divYield)}
                    </td>
                    <td className="num" style={{ color: NGXV_TOKENS.textMuted }}>
                      {fmtMcap(s.avd_30d, currency, fxRate)}
                    </td>
                    <td
                      className="num"
                      style={{ color: NGXV_TOKENS.textDim, fontSize: 10 }}
                      title={s.last_updated}
                    >
                      {fmtDateRel(s.last_updated)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {sorted.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '48px 0',
                fontSize: 11,
                color: NGXV_TOKENS.textDim,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              no matches · loosen filters
            </div>
          )}
        </div>

        {/* ── methodology ─────────────────────────────────────────────── */}
        <div className="ngxv-method">
          <div className="ngxv-method__h">Methodology</div>
          <p style={{ margin: '0 0 12px' }}>
            <strong>Data:</strong> Fundamentals (EPS, BVPS, DPS, shares) manually pasted
            from quarterly filings into <code>fundamentals.json</code> —{' '}
            <code>last_updated</code> tracks the source filing date. Live prices scraped
            server-side from afx.kwayisi.org per-ticker pages with ngxgroup.com price list
            as fallback, cached one hour. Click a ticker to open the source filing. NGN/USD
            fetched live from open.er-api.com.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            <strong>Ratios:</strong> P/E = price ÷ EPS TTM (suppressed when EPS ≤ 0). P/B =
            price ÷ BVPS. Yield = DPS TTM ÷ price. P/B Δ = (stock P/B − sector median P/B)
            ÷ sector median — this is the "cheap vs peers" signal that matters for
            financials, where absolute P/E often lies due to provisioning cycles.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Trap flags:</strong> rows with <code>last_updated</code> &gt;90 days
            old or AVD &lt;₦1M/day are dimmed (badge for stale). Negative EPS suppresses
            P/E rather than showing a meaningless negative number. Liquidity filter
            excludes (rather than dims) when set above the thin threshold.
          </p>
          <div className="ngxv-method__attr">
            Live prices via afx.kwayisi.org and NGX Group public pages, cached 1 hour.
            End-of-day data.
          </div>
        </div>
      </main>

      <BottomBar />
    </div>
  );
}
