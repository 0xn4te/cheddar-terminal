import { useEffect, useMemo } from 'react';
import { TOKENS } from '../../pages/_TerminalShell';
import type { GradeEntry } from '../../lib/cpvf-grade';
import gradesData from '../../data/cpvf-grades.json';
import type { ProtocolRow } from './types';
import { PriceChart } from './PriceChart';
import { KeyMetricsPanel } from './KeyMetricsPanel';
import { SubProductsList } from './SubProductsList';
import { ExternalLinks } from './ExternalLinks';
import { GradeBreakdown } from './GradeBreakdown';

const GRADES: GradeEntry[] = gradesData as GradeEntry[];

interface ProtocolModalProps {
  protocol: ProtocolRow;
  onClose: () => void;
}

const MODAL_CSS = `
  .cpvf-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(2px);
    z-index: 1000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 48px 16px;
    overflow-y: auto;
  }
  .cpvf-modal {
    background: ${TOKENS.surface};
    border: 1px solid ${TOKENS.border};
    width: 100%;
    max-width: 960px;
    max-height: calc(100vh - 96px);
    overflow-y: auto;
    color: ${TOKENS.text};
  }
  .cpvf-modal-close {
    background: transparent;
    border: 1px solid ${TOKENS.border};
    color: ${TOKENS.textMuted};
    width: 28px; height: 28px;
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
    transition: color 120ms, border-color 120ms;
  }
  .cpvf-modal-close:hover { color: ${TOKENS.amber}; border-color: ${TOKENS.amber}; }

  .cpvf-modal-body {
    display: grid;
    grid-template-columns: 1fr;
    gap: 24px;
    padding: 24px;
  }
  @media (min-width: 880px) {
    .cpvf-modal-body { grid-template-columns: 60fr 40fr; }
  }

  .cpvf-extlink { transition: background 120ms, color 120ms, border-color 120ms; }
  .cpvf-extlink:hover {
    background: ${TOKENS.surfaceHover};
    border-color: ${TOKENS.amber};
    color: ${TOKENS.amber};
  }
`;

export function ProtocolModal({ protocol, onClose }: ProtocolModalProps) {
  const gradeEntry = useMemo(
    () => GRADES.find((g) => g.slug === protocol.slug) ?? null,
    [protocol.slug],
  );

  // Esc key closes the modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="cpvf-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{MODAL_CSS}</style>
      <div className="cpvf-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: `1px solid ${TOKENS.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          {protocol.logo && (
            <img
              src={protocol.logo}
              alt=""
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: TOKENS.border,
                flexShrink: 0,
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 500,
                letterSpacing: '0.02em',
                color: TOKENS.text,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {protocol.name}
            </div>
            <div
              style={{
                marginTop: 4,
                color: TOKENS.amber,
                fontSize: 9,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
              }}
            >
              {protocol.category}
              {gradeEntry && (
                <>
                  <span style={{ color: TOKENS.textDim, margin: '0 8px' }}>·</span>
                  <span>{gradeEntry.type}</span>
                </>
              )}
              {protocol.aggregated && (
                <>
                  <span style={{ color: TOKENS.textDim, margin: '0 8px' }}>·</span>
                  <span>⊕{protocol.subCount} sub-products</span>
                </>
              )}
            </div>
          </div>
          <button
            className="cpvf-modal-close"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        {/* Body — two columns at desktop */}
        <div className="cpvf-modal-body">
          <div>
            <PriceChart geckoId={protocol.gecko_id} />
            <SubProductsList protocol={protocol} />
          </div>
          <div>
            <KeyMetricsPanel protocol={protocol} />
            <ExternalLinks slug={protocol.slug} geckoId={protocol.gecko_id} />
          </div>
        </div>

        {/* Full-width grade breakdown */}
        <div style={{ padding: '0 24px 24px' }}>
          <GradeBreakdown entry={gradeEntry} />
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px 16px',
            borderTop: `1px solid ${TOKENS.border}`,
            color: TOKENS.textDim,
            fontSize: 9,
            letterSpacing: '0.08em',
            textAlign: 'right',
          }}
        >
          Rubric adapted from{' '}
          <a
            href="https://x.com/0xkyle__"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: TOKENS.textMuted, textDecoration: 'underline' }}
          >
            @0xkyle__
          </a>
          ’s{' '}
          <a
            href="https://defillama-revenue.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: TOKENS.textMuted, textDecoration: 'underline' }}
          >
            Crypto Revenue Leaderboard
          </a>
          .
        </div>
      </div>
    </div>
  );
}
