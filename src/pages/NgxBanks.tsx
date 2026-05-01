import { Link } from 'react-router-dom';
import { TOKENS, TERMINAL_GLOBAL_CSS, TopBar, BottomBar } from './_TerminalShell';

export default function NgxBanks() {
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
            EQUITIES <span style={{ color: TOKENS.textDim }}>·</span>{' '}
            <span style={{ color: TOKENS.amber }}>NGXB</span>
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
            MODULE NGXB <span style={{ color: TOKENS.amber }}>· COMING SOON</span>
          </h1>

          <p
            style={{
              margin: '14px 0 0',
              color: TOKENS.textMuted,
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            Valuation workstation for NGX-listed banks. P/E, P/B, PEG and dividend yield
            with peer-discount scoring, live prices from NGX, and fundamentals from
            CardinalStone and direct company filings. Eight names tracked at launch:
            ACCESSCORP, UBA, ZENITH, GTCO, FBNH, FCMB, STERLING, FIDELITY.
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
