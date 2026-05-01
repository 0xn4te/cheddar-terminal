// Shared chrome (TopBar, BottomBar, design tokens, live clock) for the
// Cheddar Terminal pages. Inline-only — these tokens deliberately don't go
// into src/styles.css because the editorial design system there belongs to
// the altcoin monitor and must stay isolated.

import { useEffect, useState } from 'react';

export const TOKENS = {
  bg: '#0a0a0a',
  surface: '#141414',
  surfaceHover: '#1a1a1a',
  border: '#1f1f1f',
  text: '#e8e8e8',
  textMuted: '#888',
  textDim: '#555',
  amber: '#f5a623',
  green: '#3FB950',
  red: '#f04747',
} as const;

export const FONT =
  "'JetBrains Mono', 'IBM Plex Mono', Menlo, Consolas, ui-monospace, monospace";

// Page-scoped reset + animation library. Shared across Home and stubs.
export const TERMINAL_GLOBAL_CSS = `
  .cheddar-page, .cheddar-page * { box-sizing: border-box; }
  .cheddar-page {
    background: ${TOKENS.bg};
    color: ${TOKENS.text};
    font-family: ${FONT};
    min-height: 100vh;
    margin: 0;
  }
  .cheddar-page a { color: inherit; text-decoration: none; }
  @keyframes cheddar-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.25; }
  }
  @keyframes cheddar-blink {
    0%, 49.99%   { opacity: 1; }
    50%, 100%    { opacity: 0; }
  }
  @keyframes cheddar-ticker {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
  .cheddar-pulse-dot {
    display: inline-block;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: ${TOKENS.green};
    animation: cheddar-pulse 1.5s ease-in-out infinite;
    vertical-align: middle;
  }
`;

export function useClock(): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function fmtDate(now: Date): string {
  const wd = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const dd = String(now.getDate()).padStart(2, '0');
  const mo = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  return `${wd} ${dd} ${mo} ${now.getFullYear()}`;
}

function fmtTime(now: Date): string {
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s} WAT`;
}

export function TopBar() {
  const now = useClock();
  return (
    <div
      style={{
        background: TOKENS.amber,
        color: '#000',
        padding: '6px 16px',
        fontSize: 11,
        letterSpacing: '0.08em',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontWeight: 600,
      }}
    >
      <div>CHEDDAR TERMINAL <span style={{ opacity: 0.5 }}>|</span> v0.1.0</div>
      <div style={{ display: 'flex', gap: 16 }}>
        <span>{fmtDate(now)}</span>
        <span>{fmtTime(now)}</span>
        <span>LAGOS</span>
      </div>
    </div>
  );
}

export function BottomBar() {
  return (
    <div
      style={{
        borderTop: `1px solid ${TOKENS.border}`,
        background: TOKENS.bg,
        padding: '6px 16px',
        fontSize: 10,
        color: TOKENS.textDim,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        letterSpacing: '0.06em',
      }}
    >
      <div style={{ display: 'flex', gap: 16 }}>
        <span><span style={{ color: TOKENS.amber }}>F1</span> HELP</span>
        <span><span style={{ color: TOKENS.amber }}>F2</span> NAV</span>
        <span><span style={{ color: TOKENS.amber }}>F3</span> EXPORT</span>
        <span><span style={{ color: TOKENS.amber }}>⌘K</span> SEARCH</span>
        <span><span style={{ color: TOKENS.amber }}>ESC</span> HOME</span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span>BUILD 2026.05.01</span>
        <span>·</span>
        <span>LAGOS</span>
        <span>·</span>
        <span style={{ color: TOKENS.green }}>● ONLINE</span>
      </div>
    </div>
  );
}
