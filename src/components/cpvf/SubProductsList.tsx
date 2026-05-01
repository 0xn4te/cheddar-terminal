import { TOKENS } from '../../pages/_TerminalShell';
import type { ProtocolRow } from './types';

interface SubProductsListProps {
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

export function SubProductsList({ protocol }: SubProductsListProps) {
  if (!protocol.aggregated || protocol.subEntries.length <= 1) return null;

  const sorted = [...protocol.subEntries].sort((a, b) => b.total30d - a.total30d);

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          color: TOKENS.amber,
          fontSize: 9,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        Sub-products · 30d revenue
      </div>
      <div>
        {sorted.map((entry, i) => (
          <div
            key={entry.name + i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              padding: '8px 0',
              borderBottom: `1px solid ${TOKENS.border}`,
            }}
          >
            <span style={{ color: TOKENS.text, fontSize: 11 }}>{entry.name}</span>
            <span
              style={{
                color: TOKENS.textMuted,
                fontSize: 11,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {fmtUsd(entry.total30d)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
