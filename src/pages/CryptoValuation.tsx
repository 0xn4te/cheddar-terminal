import { Link } from 'react-router-dom';
import { TOKENS, TERMINAL_GLOBAL_CSS, TopBar, BottomBar } from './_TerminalShell';

export default function CryptoValuation() {
  return (
    <div className="cheddar-page">
      <style>{TERMINAL_GLOBAL_CSS}</style>
      <TopBar />

      <main
        style={{
          minHeight: 'calc(100vh - 110px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 16px',
        }}
      >
        <div style={{ maxWidth: 560, width: '100%' }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.1em',
              color: TOKENS.textMuted,
              marginBottom: 8,
            }}
          >
            CRYPTO <span style={{ color: TOKENS.textDim }}>·</span>{' '}
            <span style={{ color: TOKENS.amber }}>CPVF</span>
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: TOKENS.text,
            }}
          >
            MODULE CPVF <span style={{ color: TOKENS.amber }}>· COMING SOON</span>
          </h1>

          <p
            style={{
              margin: '14px 0 0',
              color: TOKENS.textMuted,
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            Protocol-level valuation across DeFi sectors. Revenue multiples, P/F and P/S
            benchmarks, and sector fair-value bands powered by DeFiLlama, Token Terminal
            and direct on-chain reads. Seven sectors at launch (DEX, lending, restaking,
            perps, LSTs, RWA, stablecoins) with live multiples and median compression
            tracking.
          </p>

          <div
            style={{
              marginTop: 32,
              display: 'flex',
              gap: 12,
              fontSize: 11,
              letterSpacing: '0.08em',
            }}
          >
            <Link
              to="/"
              style={{
                color: TOKENS.amber,
                border: `1px solid ${TOKENS.border}`,
                padding: '8px 14px',
                background: TOKENS.surface,
              }}
            >
              ← BACK TO TERMINAL
            </Link>
          </div>
        </div>
      </main>

      <BottomBar />
    </div>
  );
}
