import { TOKENS } from '../../pages/_TerminalShell';
import type { ProtocolRow } from './types';

interface KeyMetricsPanelProps {
  protocol: ProtocolRow;
}

const fmtUsd = (n: number | null | undefined): string => {
  if (n == null || n === 0 || isNaN(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(1) + 'K';
  return sign + '$' + abs.toFixed(0);
};

const fmtMultiple = (val: number, rev: number): string => {
  if (rev <= 0 || val <= 0) return '—';
  const m = val / rev;
  if (!isFinite(m)) return '—';
  if (m < 10) return m.toFixed(2) + '×';
  if (m < 1000) return m.toFixed(1) + '×';
  return '999+×';
};

const fmtFloat = (mcap: number, fdv: number): string => {
  if (mcap <= 0 || fdv <= 0) return '—';
  const pct = (mcap / fdv) * 100;
  if (pct >= 99.5) return '100%';
  return pct.toFixed(0) + '%';
};

export function KeyMetricsPanel({ protocol }: KeyMetricsPanelProps) {
  const rows: Array<{ label: string; value: string }> = [
    { label: '30d Revenue', value: fmtUsd(protocol.total30d) },
    { label: 'Annualized', value: fmtUsd(protocol.annRev) },
    { label: '24h Revenue', value: fmtUsd(protocol.total24h) },
    { label: '1y Revenue', value: fmtUsd(protocol.total1y) },
    { label: 'Market Cap', value: fmtUsd(protocol.mcap) },
    { label: 'FDV', value: fmtUsd(protocol.fdv) },
    { label: 'Float', value: fmtFloat(protocol.mcap, protocol.fdv) },
    { label: 'MC / Rev', value: fmtMultiple(protocol.mcap, protocol.annRev) },
    { label: 'FDV / Rev', value: fmtMultiple(protocol.fdv, protocol.annRev) },
  ];

  return (
    <div>
      <div
        style={{
          color: TOKENS.amber,
          fontSize: 9,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        Key Metrics
      </div>
      <div>
        {rows.map((r) => (
          <div
            key={r.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              padding: '8px 0',
              borderBottom: `1px solid ${TOKENS.border}`,
            }}
          >
            <span
              style={{
                color: TOKENS.textMuted,
                fontSize: 10,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {r.label}
            </span>
            <span
              style={{
                color: TOKENS.text,
                fontSize: 13,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
