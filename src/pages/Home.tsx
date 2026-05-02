import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TOKENS, TERMINAL_GLOBAL_CSS, TopBar, BottomBar } from './_TerminalShell';

// ─── snapshot types ─────────────────────────────────────────────────────
// Mirror the server's HomeSnapshot shape — kept in sync manually rather
// than re-imported, so the frontend doesn't pull in server-only deps.

interface TickerQuote { price: number; change24h: number | null }
type Band = 'RISK-ON' | 'NEUTRAL' | 'RISK-OFF';

interface AltFlowCard {
  indexValue: number;
  band: Band;
  dotColor: string;
  lastUpdatedMs: number;
}
interface CpvfCard {
  medianPS: number;
  topLeader: { name: string; rev24h: number };
  lastUpdatedMs: number;
}
interface NgxvCard {
  medianPE: number;
  cheapest: { ticker: string; pbDelta: number };
  lastUpdatedMs: number;
}

interface HomeSnapshot {
  fetchedAt: number;
  ticker: Partial<Record<'BTC' | 'ETH' | 'SOL' | 'XAU' | 'SPX' | 'USDNGN' | 'ASI', TickerQuote>>;
  cards: { altflow?: AltFlowCard; cpvf?: CpvfCard; ngxv?: NgxvCard };
}

interface ActivityEvent {
  ts: number;
  module: 'TICKER' | 'ALTFLOW' | 'CPVF' | 'NGXV' | 'HOME' | 'SYSTEM';
  action: 'FETCH' | 'CACHE_HIT' | 'CACHE_REFRESH' | 'PAGE_HIT' | 'ERROR';
  detail: string;
  status: 'OK' | 'FAIL' | 'STALE';
}

// ─── ticker strip ───────────────────────────────────────────────────────

const TICKER_DISPLAY: { key: keyof HomeSnapshot['ticker']; label: string; decimals?: number; unit?: string }[] = [
  { key: 'BTC',    label: 'BTC',     decimals: 0,  unit: '$' },
  { key: 'ETH',    label: 'ETH',     decimals: 0,  unit: '$' },
  { key: 'SOL',    label: 'SOL',     decimals: 2,  unit: '$' },
  { key: 'XAU',    label: 'GOLD',    decimals: 1,  unit: '$' },
  { key: 'SPX',    label: 'SPX',     decimals: 1 },
  { key: 'USDNGN', label: 'USD/NGN', decimals: 2,  unit: '₦' },
  { key: 'ASI',    label: 'NGX ASI', decimals: 2 },
];

function fmtPrice(n: number, decimals: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function TickerStrip({ ticker }: { ticker: HomeSnapshot['ticker'] | null }) {
  // Build a flat list of populated symbols; if nothing yet, render placeholder.
  const items = TICKER_DISPLAY.flatMap((t) => {
    const q = ticker?.[t.key];
    if (!q) return [{ label: t.label, price: '—', change: null as number | null, unit: t.unit }];
    return [{
      label: t.label,
      price: (t.unit || '') + fmtPrice(q.price, t.decimals ?? 2),
      change: q.change24h,
      unit: t.unit,
    }];
  });
  // Duplicate for marquee loop.
  const looped = [...items, ...items];
  return (
    <div
      style={{
        background: TOKENS.surface,
        borderTop: `1px solid ${TOKENS.border}`,
        borderBottom: `1px solid ${TOKENS.border}`,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        padding: '8px 0',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          gap: 28,
          paddingLeft: 16,
          animation: 'cheddar-ticker 90s linear infinite',
          willChange: 'transform',
        }}
      >
        {looped.map((t, i) => (
          <span key={i} style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: TOKENS.textMuted, marginRight: 6 }}>{t.label}</span>
            <span style={{ color: TOKENS.text }}>{t.price}</span>
            {t.change != null && (
              <span
                style={{
                  color: t.change >= 0 ? TOKENS.green : TOKENS.red,
                  marginLeft: 6,
                }}
              >
                {t.change >= 0 ? '▲' : '▼'} {Math.abs(t.change).toFixed(2)}%
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── status row ─────────────────────────────────────────────────────────

function ageMin(ms: number | undefined | null, now: number): string {
  if (ms == null) return '—';
  const min = Math.floor((now - ms) / 60_000);
  if (min < 1) return '<1 MIN';
  if (min >= 60) return Math.floor(min / 60) + ' HR';
  return min + ' MIN';
}

function StatusRow({
  snapshot,
  online,
}: {
  snapshot: HomeSnapshot | null;
  online: 'OK' | 'STALE' | 'FAIL';
}) {
  const sep = <span style={{ color: TOKENS.textDim, margin: '0 10px' }}>·</span>;
  const now = Date.now();
  const dotColor = online === 'OK' ? TOKENS.green : online === 'STALE' ? TOKENS.amber : TOKENS.red;
  const onlineLabel = online === 'OK' ? 'ONLINE' : online === 'STALE' ? 'STALE' : 'OFFLINE';
  const ngxvAge = ageMin(snapshot?.cards.ngxv?.lastUpdatedMs, now);
  const cpvfAge = ageMin(snapshot?.cards.cpvf?.lastUpdatedMs, now);
  const altflowAge = ageMin(snapshot?.cards.altflow?.lastUpdatedMs, now);
  return (
    <div
      style={{
        background: TOKENS.surface,
        borderBottom: `1px solid ${TOKENS.border}`,
        padding: '6px 16px',
        fontSize: 10,
        letterSpacing: '0.08em',
        color: TOKENS.textMuted,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <span className="cheddar-pulse-dot" style={{ marginRight: 6, background: dotColor }} />
      <span style={{ color: dotColor }}>{onlineLabel}</span>
      {sep}
      <span>NGXV {ngxvAge}</span>
      {sep}
      <span>CPVF {cpvfAge}</span>
      {sep}
      <span>ALTFLOW {altflowAge}</span>
      {sep}
      <span>BUILD v0.1.0</span>
    </div>
  );
}

// ─── hero ───────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section style={{ padding: '32px 16px' }}>
      <h1
        style={{
          margin: 0,
          fontSize: 22,
          letterSpacing: '0.04em',
          color: TOKENS.text,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontWeight: 700,
        }}
      >
        CHEDDAR TERMINAL
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 18,
            background: TOKENS.amber,
            animation: 'cheddar-blink 530ms step-end infinite',
            marginLeft: 4,
          }}
        />
      </h1>
      <p
        style={{
          margin: '8px 0 0',
          color: TOKENS.textMuted,
          fontSize: 12,
          maxWidth: 720,
          lineHeight: 1.5,
        }}
      >
        Private market workstation. On-chain liquidity, NGX equities, crypto valuation —
        one workspace, one keystroke away.
      </p>
    </section>
  );
}

// ─── dashboard cards ────────────────────────────────────────────────────

interface CardMeta {
  section: string;
  code: string;
  href: string;
  title: string;
  blurb: string;
  sources: string;
  caption: string;        // small label under the big number
  accent: string;         // module-signature accent (amber for ALMR/CPVF, green for NGXV)
}

const CARDS_META: CardMeta[] = [
  {
    section: 'LIQUIDITY',
    code: 'ALMR',
    href: '/altcoin-monitor',
    title: 'ALTCOIN LIQUIDITY MONITOR',
    blurb:
      'Composite Alt Flow Index across stablecoin supply, BTC/ETH netflows, SSR posture and funding rates.',
    sources: 'CRYPTOQUANT · COINGLASS',
    caption: 'ALT FLOW INDEX',
    accent: TOKENS.amber,
  },
  {
    section: 'CRYPTO',
    code: 'CPVF',
    href: '/crypto-valuation',
    title: 'PROTOCOL VALUATION',
    blurb:
      'Revenue multiples, P/F and P/S benchmarks across DeFi sectors. Sector fair-value bands and live multiples.',
    sources: 'DEFILLAMA · COINGECKO',
    caption: 'MED P/S',
    accent: TOKENS.amber,
  },
  {
    section: 'EQUITIES',
    code: 'NGXV',
    href: '/ngx-valuation',
    title: 'NGX VALUATION',
    blurb:
      'Nigerian equities · cheap vs peers. P/E, P/B and dividend yield with sector-relative P/B Δ.',
    sources: 'AFX.KWAYISI · NGX GROUP · COMPANY FILINGS',
    caption: 'MED P/E',
    accent: TOKENS.green,
  },
];

function fmtFreshness(ms: number | undefined | null, now: number): string {
  if (ms == null) return 'Awaiting refresh';
  const min = Math.floor((now - ms) / 60_000);
  if (min < 1) return 'Updated just now';
  if (min === 1) return 'Updated 1 min ago';
  if (min < 60) return `Updated ${min} min ago`;
  const hr = Math.floor(min / 60);
  return `Updated ${hr} hr ago`;
}

function fmtUsdShort(n: number): string {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

function CardView({
  meta,
  bigNumber,
  signalText,
  signalDotColor,
  freshness,
}: {
  meta: CardMeta;
  bigNumber: string;
  signalText: string;
  signalDotColor: string;
  freshness: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      to={meta.href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block',
        background: hover ? TOKENS.surfaceHover : TOKENS.surface,
        border: `1px solid ${hover ? meta.accent : TOKENS.border}`,
        padding: 16,
        transition: 'border-color 120ms, background 120ms',
        color: TOKENS.text,
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: 10,
          letterSpacing: '0.1em',
          marginBottom: 14,
        }}
      >
        <span style={{ color: TOKENS.textMuted }}>
          {meta.section} <span style={{ color: TOKENS.textDim }}>·</span>{' '}
          <span style={{ color: meta.accent }}>{meta.code}</span>
        </span>
        <span style={{ color: hover ? meta.accent : TOKENS.textDim }}>
          {hover ? 'ENTER →' : '── ──'}
        </span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', marginBottom: 4 }}>
        {meta.title}
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 11, color: TOKENS.textMuted, lineHeight: 1.5 }}>
        {meta.blurb}
      </p>

      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: TOKENS.text,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.01em',
          lineHeight: 1,
          marginBottom: 6,
        }}
      >
        {bigNumber}
      </div>
      <div
        style={{
          fontSize: 9,
          color: TOKENS.textMuted,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          marginBottom: 14,
        }}
      >
        {meta.caption}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: TOKENS.text,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: signalDotColor,
          }}
        />
        <span>{signalText}</span>
      </div>

      <div
        style={{
          fontSize: 9,
          color: TOKENS.textDim,
          fontStyle: 'italic',
          letterSpacing: '0.04em',
          borderTop: `1px solid ${TOKENS.border}`,
          paddingTop: 8,
        }}
      >
        {freshness}
      </div>

      <div
        style={{
          fontSize: 9,
          color: TOKENS.textDim,
          letterSpacing: '0.06em',
          marginTop: 6,
        }}
      >
        {meta.sources}
      </div>
    </Link>
  );
}

function DashboardGrid({ snapshot }: { snapshot: HomeSnapshot | null }) {
  const now = Date.now();
  const altflow = snapshot?.cards.altflow;
  const cpvf = snapshot?.cards.cpvf;
  const ngxv = snapshot?.cards.ngxv;

  const altflowCard = {
    bigNumber: altflow ? (altflow.indexValue >= 0 ? '+' : '') + altflow.indexValue : '—',
    signalText: altflow ? `REGIME: ${altflow.band}` : 'Data unavailable',
    signalDotColor: altflow ? altflow.dotColor : TOKENS.textDim,
    freshness: fmtFreshness(altflow?.lastUpdatedMs, now),
  };
  const cpvfCard = {
    bigNumber: cpvf ? cpvf.medianPS.toFixed(1) + '×' : '—',
    signalText: cpvf
      ? `LEADER: ${cpvf.topLeader.name} · ${fmtUsdShort(cpvf.topLeader.rev24h)} / 24h`
      : 'Data unavailable',
    signalDotColor: cpvf ? TOKENS.amber : TOKENS.textDim,
    freshness: fmtFreshness(cpvf?.lastUpdatedMs, now),
  };
  const ngxvCard = {
    bigNumber: ngxv ? ngxv.medianPE.toFixed(1) + '×' : '—',
    signalText: ngxv
      ? `CHEAPEST: ${ngxv.cheapest.ticker} · ${ngxv.cheapest.pbDelta.toFixed(1)}% vs sector`
      : 'Data unavailable',
    signalDotColor: ngxv ? TOKENS.green : TOKENS.textDim,
    freshness: fmtFreshness(ngxv?.lastUpdatedMs, now),
  };

  const cardData = [altflowCard, cpvfCard, ngxvCard];

  return (
    <section style={{ padding: '0 16px 24px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
        }}
      >
        {CARDS_META.map((meta, i) => (
          <CardView
            key={meta.code}
            meta={meta}
            bigNumber={cardData[i].bigNumber}
            signalText={cardData[i].signalText}
            signalDotColor={cardData[i].signalDotColor}
            freshness={cardData[i].freshness}
          />
        ))}
      </div>
    </section>
  );
}

// ─── activity log ───────────────────────────────────────────────────────

const MODULE_COLOR: Record<ActivityEvent['module'], string> = {
  HOME:    TOKENS.amber,
  ALTFLOW: TOKENS.amber,
  CPVF:    TOKENS.amber,
  NGXV:    TOKENS.green,
  TICKER:  TOKENS.textMuted,
  SYSTEM:  TOKENS.textMuted,
};

const STATUS_COLOR: Record<ActivityEvent['status'], string> = {
  OK:    TOKENS.green,
  FAIL:  TOKENS.red,
  STALE: TOKENS.amber,
};

function fmtClock(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function ActivityLog({ events }: { events: ActivityEvent[] }) {
  const visible = events.slice(0, 12);
  return (
    <section style={{ padding: '0 16px 24px' }}>
      <div
        style={{
          background: TOKENS.surface,
          border: `1px solid ${TOKENS.border}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            borderBottom: `1px solid ${TOKENS.border}`,
            fontSize: 10,
            letterSpacing: '0.1em',
          }}
        >
          <span style={{ color: TOKENS.amber }}>EVENT LOG · LIVE</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: TOKENS.green }}>
            <span className="cheddar-pulse-dot" />
            STREAMING
          </span>
        </div>
        {visible.length === 0 ? (
          <div
            style={{
              padding: '14px 12px',
              fontSize: 10,
              color: TOKENS.textDim,
              fontStyle: 'italic',
            }}
          >
            Awaiting activity…
          </div>
        ) : (
          <div>
            {visible.map((row, i) => (
              <div
                key={`${row.ts}-${i}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 80px 110px 1fr 50px',
                  gap: 10,
                  fontSize: 10,
                  lineHeight: 1.4,
                  padding: '5px 12px',
                  borderBottom: i === visible.length - 1 ? 'none' : `1px solid ${TOKENS.border}`,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                <span style={{ color: TOKENS.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtClock(row.ts)}
                </span>
                <span style={{ color: MODULE_COLOR[row.module], letterSpacing: '0.08em' }}>
                  {row.module}
                </span>
                <span style={{ color: TOKENS.textMuted, letterSpacing: '0.05em' }}>
                  {row.action}
                </span>
                <span
                  style={{
                    color: TOKENS.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {row.detail}
                </span>
                <span style={{ color: STATUS_COLOR[row.status], textAlign: 'right' }}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── page ───────────────────────────────────────────────────────────────

export default function Home() {
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [snapshotErr, setSnapshotErr] = useState<string | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  // Snapshot poll: every 60s. Server-side cache is also 60s, so this is
  // calibrated — most polls land on warm cache.
  useEffect(() => {
    let cancelled = false;
    const fetchSnap = async () => {
      try {
        const resp = await fetch('/api/home/snapshot');
        if (!resp.ok) throw new Error('snapshot HTTP ' + resp.status);
        const j = (await resp.json()) as HomeSnapshot;
        if (!cancelled) {
          setSnapshot(j);
          setSnapshotErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setSnapshotErr(e instanceof Error ? e.message : 'snapshot failed');
        }
      }
    };
    fetchSnap();
    const id = setInterval(fetchSnap, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Activity poll: every 10s.
  useEffect(() => {
    let cancelled = false;
    const fetchEvents = async () => {
      try {
        const resp = await fetch('/api/activity/recent?limit=20');
        if (!resp.ok) return;
        const j = (await resp.json()) as { events: ActivityEvent[] };
        if (!cancelled) setEvents(j.events || []);
      } catch {
        /* swallow — non-critical */
      }
    };
    fetchEvents();
    const id = setInterval(fetchEvents, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Page-hit ping so the activity log shows navigation events uniformly
  // in dev (Vite proxy) and prod (single-origin Hono).
  useEffect(() => {
    fetch('/api/activity/page-hit?route=/').catch(() => {});
  }, []);

  const onlineState: 'OK' | 'STALE' | 'FAIL' = useMemo(() => {
    if (snapshotErr && !snapshot) return 'FAIL';
    if (!snapshot) return 'STALE';
    const now = Date.now();
    const ages = [
      snapshot.cards.altflow?.lastUpdatedMs,
      snapshot.cards.cpvf?.lastUpdatedMs,
      snapshot.cards.ngxv?.lastUpdatedMs,
    ];
    const anyStale = ages.some((ms) => ms != null && now - ms > 30 * 60_000);
    return anyStale ? 'STALE' : 'OK';
  }, [snapshot, snapshotErr]);

  return (
    <div className="cheddar-page">
      <style>{TERMINAL_GLOBAL_CSS}</style>
      <TopBar />
      <TickerStrip ticker={snapshot?.ticker ?? null} />
      <StatusRow snapshot={snapshot} online={onlineState} />
      <Hero />
      <DashboardGrid snapshot={snapshot} />
      <ActivityLog events={events} />
      <BottomBar />
    </div>
  );
}
