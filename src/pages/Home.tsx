import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TOKENS, TERMINAL_GLOBAL_CSS, TopBar, BottomBar } from './_TerminalShell';

// ---- Static content ----

interface Ticker { sym: string; px: number; ch: number; }
const TICKERS: Ticker[] = [
  { sym: 'BTC',       px: 94287.15, ch:  1.24 },
  { sym: 'ETH',       px:  3421.82, ch:  0.92 },
  { sym: 'SOL',       px:   187.42, ch: -0.87 },
  { sym: 'TAO',       px:   412.18, ch:  2.41 },
  { sym: 'NGX ASI',   px:203770.45, ch:  0.45 },
  { sym: 'NGX BNK10', px:  1284.17, ch:  0.71 },
  { sym: 'USD/NGN',   px:  1547.20, ch:  0.18 },
  { sym: 'BRENT',     px:    78.42, ch: -0.34 },
  { sym: 'XAU',       px:  2674.10, ch:  0.62 },
  { sym: 'DXY',       px:   104.27, ch: -0.11 },
  { sym: 'ETHFI',     px:     1.42, ch:  4.21 },
  { sym: 'DANGCEM',   px:   482.50, ch:  1.05 },
];

interface Metric { label: string; val: string; color: string; }

interface Card {
  section: string;
  code: string;
  state: 'live' | 'stub';
  href: string;
  comingSoon?: boolean;
  title: string;
  blurb: string;
  sources: string;
  headline: string;
  headlineColor: string;
  headlineLabel: string;
  metrics: Metric[];
}

const CARDS: Card[] = [
  {
    section: 'LIQUIDITY',
    code: 'ALMR',
    state: 'live',
    href: '/altcoin-monitor',
    title: 'ALTCOIN LIQUIDITY MONITOR',
    blurb: 'Composite Alt Flow Index across stablecoin supply, BTC dominance, exchange netflows and top-alt momentum.',
    sources: 'CRYPTOQUANT · DEFILLAMA · COINPAPRIKA',
    headline: '+42.7',
    headlineColor: TOKENS.green,
    headlineLabel: 'FLOW INDEX',
    metrics: [
      { label: 'ALT FLOW',  val: '+42.7',     color: TOKENS.green },
      { label: 'USDT 7D',   val: '+2.1%',     color: TOKENS.green },
      { label: 'BTC.D',     val: '54.8%',     color: TOKENS.red },
      { label: 'SIGNAL',    val: 'ROTATING',  color: TOKENS.amber },
    ],
  },
  {
    section: 'EQUITIES',
    code: 'NGXB',
    state: 'stub',
    href: '/ngx-banks',
    comingSoon: true,
    title: 'NGX BANKS VALUATION',
    blurb: 'P/E, P/B, PEG and dividend yield across NGX banking with peer-discount scoring and live prices.',
    sources: 'NGX · CARDINALSTONE · COMPANY FILINGS',
    headline: '8',
    headlineColor: TOKENS.text,
    headlineLabel: 'NAMES TRACKED',
    metrics: [
      { label: 'ACCESSCORP', val: '2.6×', color: TOKENS.green },
      { label: 'UBA',        val: '3.9×', color: TOKENS.green },
      { label: 'ZENITH',     val: '4.1×', color: TOKENS.green },
      { label: 'GTCO',       val: '4.4×', color: TOKENS.green },
    ],
  },
  {
    section: 'CRYPTO',
    code: 'CPVF',
    state: 'stub',
    href: '/crypto-valuation',
    title: 'PROTOCOL VALUATION',
    blurb: 'Revenue multiples, P/F and P/S benchmarks across DeFi sectors. Sector fair-value bands and live multiples.',
    sources: 'DEFILLAMA · TOKENTERMINAL · ON-CHAIN',
    headline: '14.3×',
    headlineColor: TOKENS.text,
    headlineLabel: 'P/S MEDIAN',
    metrics: [
      { label: 'P/S MED',  val: '14.3×',  color: TOKENS.text },
      { label: 'P/F MED',  val: '22.7×',  color: TOKENS.text },
      { label: 'FAIR',     val: '10–30×', color: TOKENS.amber },
      { label: 'SECTORS',  val: '7',      color: TOKENS.text },
    ],
  },
];

interface ActivityRow { time: string; code: string; msg: string; }
const ACTIVITY: ActivityRow[] = [
  { time: '14:31:42', code: 'ALMR', msg: 'USDT supply +$412M / 24h — dry powder forming' },
  { time: '14:28:15', code: 'NGXB', msg: 'ACCESSCORP P/B drift: 0.42× → 0.43× on volume' },
  { time: '14:24:03', code: 'CPVF', msg: 'DEX sector P/F median compressed to 19.4×' },
  { time: '14:19:28', code: 'ALMR', msg: 'BTC.D crossed 55% → flow regime: NEUTRAL→ROTATING' },
  { time: '14:11:07', code: 'NGXB', msg: 'GTCO Q1 EPS estimate revised +4.2%' },
  { time: '14:02:51', code: 'CPVF', msg: 'Restaking sector added — 4 names, P/F 38.1× med' },
];

// Deterministic sin-based pseudo-random sparkline. Same input → same output.
function sparklinePoints(seed: number, count = 24): string {
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    values.push(
      Math.sin(seed * 0.71 + i * 0.42) +
      Math.sin(seed * 1.31 + i * 0.21) * 0.5,
    );
  }
  let min = Infinity, max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const W = 100, H = 24;
  return values
    .map((v, i) => {
      const x = (i / (count - 1)) * W;
      const y = H - ((v - min) / range) * (H - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

// ---- Sub-components ----

function TickerStrip() {
  // Items duplicated for seamless marquee loop. Translates -50% over 90s,
  // which lands the second copy exactly where the first started.
  const items = [...TICKERS, ...TICKERS];
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
        {items.map((t, i) => (
          <span key={i} style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: TOKENS.textMuted, marginRight: 6 }}>{t.sym}</span>
            <span style={{ color: TOKENS.text }}>{t.px.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            <span
              style={{
                color: t.ch >= 0 ? TOKENS.green : TOKENS.red,
                marginLeft: 6,
              }}
            >
              {t.ch >= 0 ? '▲' : '▼'} {Math.abs(t.ch).toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusRow({ sessionId }: { sessionId: string }) {
  const sep = <span style={{ color: TOKENS.textDim, margin: '0 10px' }}>·</span>;
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
      <span className="cheddar-pulse-dot" style={{ marginRight: 6 }} />
      <span style={{ color: TOKENS.green }}>MARKET LIVE</span>
      {sep}
      <span>{sessionId}</span>
      {sep}
      <span style={{ color: TOKENS.green }}>3 MODULES ACTIVE</span>
      {sep}
      <span style={{ color: TOKENS.green }}>NGX OPEN</span>
      {sep}
      <span style={{ color: TOKENS.amber }}>US EQUITIES PRE-OPEN</span>
    </div>
  );
}

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

function CardView({ card, idx }: { card: Card; idx: number }) {
  const [hover, setHover] = useState(false);
  const points = useMemo(() => sparklinePoints(idx + 1), [idx]);

  return (
    <Link
      to={card.href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block',
        background: hover ? TOKENS.surfaceHover : TOKENS.surface,
        border: `1px solid ${hover ? TOKENS.amber : TOKENS.border}`,
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
          marginBottom: 10,
        }}
      >
        <span style={{ color: TOKENS.textMuted }}>
          {card.section} <span style={{ color: TOKENS.textDim }}>·</span>{' '}
          <span style={{ color: TOKENS.amber }}>{card.code}</span>
          {card.comingSoon && (
            <>
              <span style={{ color: TOKENS.textDim }}> · </span>
              <span style={{ color: TOKENS.amber }}>COMING SOON</span>
            </>
          )}
        </span>
        <span style={{ color: hover ? TOKENS.amber : TOKENS.textDim }}>
          {hover ? 'ENTER →' : '── ──'}
        </span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', marginBottom: 8 }}>
        {card.title}
      </div>

      <p style={{ margin: '0 0 10px', fontSize: 11, color: TOKENS.textMuted, lineHeight: 1.5 }}>
        {card.blurb}
      </p>

      <div style={{ fontSize: 10, color: TOKENS.textDim, letterSpacing: '0.06em', marginBottom: 14 }}>
        {card.sources}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: card.headlineColor,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}
        >
          {card.headline}
        </div>
        <div style={{ fontSize: 10, color: TOKENS.textMuted, letterSpacing: '0.08em', paddingBottom: 4 }}>
          {card.headlineLabel}
        </div>
      </div>

      <svg
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        style={{ display: 'block', width: '100%', height: 32, marginBottom: 12 }}
      >
        <polyline
          points={points}
          fill="none"
          stroke={card.headlineColor}
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10 }}>
        {card.metrics.map((m) => (
          <div
            key={m.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: `1px solid ${TOKENS.border}`,
              paddingTop: 6,
              letterSpacing: '0.06em',
            }}
          >
            <span style={{ color: TOKENS.textMuted }}>{m.label}</span>
            <span style={{ color: m.color, fontVariantNumeric: 'tabular-nums' }}>{m.val}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

function DashboardGrid() {
  return (
    <section style={{ padding: '0 16px 24px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
        }}
      >
        {CARDS.map((card, idx) => (
          <CardView key={card.code} card={card} idx={idx} />
        ))}
      </div>
    </section>
  );
}

function ActivityLog() {
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
          <span style={{ color: TOKENS.amber }}>ACTIVITY LOG · LIVE</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: TOKENS.green }}>
            <span className="cheddar-pulse-dot" />
            STREAMING
          </span>
        </div>
        <div>
          {ACTIVITY.map((row, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '90px 70px 1fr',
                gap: 10,
                fontSize: 11,
                padding: '6px 12px',
                borderBottom: i === ACTIVITY.length - 1 ? 'none' : `1px solid ${TOKENS.border}`,
              }}
            >
              <span style={{ color: TOKENS.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                {row.time}
              </span>
              <span style={{ color: TOKENS.amber, letterSpacing: '0.08em' }}>{row.code}</span>
              <span style={{ color: TOKENS.text }}>{row.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Page ----

export default function Home() {
  const sessionId = useMemo(() => {
    const n = Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0');
    return `S-${n}`;
  }, []);

  return (
    <div className="cheddar-page">
      <style>{TERMINAL_GLOBAL_CSS}</style>
      <TopBar />
      <TickerStrip />
      <StatusRow sessionId={sessionId} />
      <Hero />
      <DashboardGrid />
      <ActivityLog />
      <BottomBar />
    </div>
  );
}
