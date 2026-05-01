import { TOKENS } from '../../pages/_TerminalShell';
import {
  computeGrade,
  type DimensionScore,
  type GradeEntry,
} from '../../lib/cpvf-grade';

interface GradeBreakdownProps {
  entry: GradeEntry | null;
}

const FORMULA_TEXT =
  'Formula: round(0.35·Mech + 0.30·Mult + 0.20·PMF + 0.15·Infl). ' +
  'Caps: Mech ≤ 3 → final ≤ Mech; Mech ≤ 5 → final ≤ Mech+1; ' +
  'Mult ≤ 1 (>200x FDV/Rev) → final ≤ 5; Mech = 0 → final = 0.';

const bandColor = (score: number): string => {
  if (score >= 8) return TOKENS.green;
  if (score >= 5) return TOKENS.amber;
  return TOKENS.red;
};

interface DimRow {
  key: 'mechanism' | 'inflation' | 'multiple' | 'pmf';
  label: string;
}

const DIMENSIONS: DimRow[] = [
  { key: 'mechanism', label: 'Mechanism' },
  { key: 'multiple',  label: 'Multiple'  },
  { key: 'pmf',       label: 'PMF'       },
  { key: 'inflation', label: 'Inflation' },
];

function ProgressBar({ score }: { score: number }) {
  const width = Math.max(0, Math.min(10, score)) * 10;
  return (
    <div
      style={{
        height: 6,
        background: TOKENS.surfaceHover,
        position: 'relative',
        marginTop: 6,
      }}
    >
      <div
        style={{
          width: width + '%',
          height: '100%',
          background: bandColor(score),
          transition: 'width 200ms',
        }}
      />
    </div>
  );
}

function DimensionRow({
  label,
  data,
}: {
  label: string;
  data: DimensionScore;
}) {
  if (!data) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span
          style={{
            color: TOKENS.textMuted,
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <span
          style={{
            color: TOKENS.text,
            fontSize: 11,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {data.score} / 10
        </span>
      </div>
      <ProgressBar score={data.score} />
      <div
        style={{
          color: TOKENS.textMuted,
          fontSize: 11,
          marginTop: 8,
          lineHeight: 1.6,
        }}
      >
        {data.rationale}
      </div>
    </div>
  );
}

function FormulaFooter() {
  return (
    <div
      style={{
        marginTop: 24,
        padding: '10px 12px',
        border: `1px solid ${TOKENS.border}`,
        color: TOKENS.textDim,
        fontSize: 9,
        letterSpacing: '0.04em',
        lineHeight: 1.6,
      }}
    >
      {FORMULA_TEXT}
    </div>
  );
}

export function GradeBreakdown({ entry }: GradeBreakdownProps) {
  const result = entry
    ? computeGrade({
        mechanism: entry.mechanism,
        inflation: entry.inflation,
        multiple: entry.multiple,
        pmf: entry.pmf,
      })
    : { status: 'ungraded' as const, reason: 'no-entry' as const };

  const isGraded = result.status === 'graded';
  const numberColor = isGraded ? bandColor(result.final) : TOKENS.textDim;

  return (
    <div style={{ marginTop: 32 }}>
      <div
        style={{
          color: TOKENS.amber,
          fontSize: 9,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          marginBottom: 16,
        }}
      >
        Token Grade Breakdown
      </div>

      {/* big number row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 14,
          flexWrap: 'wrap',
          marginBottom: 24,
        }}
      >
        <span
          style={{
            fontSize: 56,
            fontVariantNumeric: 'tabular-nums',
            color: numberColor,
            lineHeight: 1,
            letterSpacing: '0.02em',
          }}
        >
          {isGraded ? result.final : '—'}
        </span>
        <span style={{ color: TOKENS.textMuted, fontSize: 13 }}>/ 10 grade</span>

        {entry && (
          <span
            style={{
              marginLeft: 'auto',
              padding: '4px 8px',
              fontSize: 9,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: TOKENS.amber,
              border: `1px solid ${TOKENS.border}`,
            }}
          >
            {entry.type}
          </span>
        )}
      </div>

      {!isGraded && (
        <div
          style={{
            color: TOKENS.textDim,
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          {entry ? 'Ungraded · Pending Analyst Review' : 'Ungraded · Not Yet Reviewed'}
        </div>
      )}

      {isGraded && entry && (
        <>
          {DIMENSIONS.map((d) => (
            <DimensionRow key={d.key} label={d.label} data={entry[d.key]} />
          ))}
          {result.capApplied && (
            <div
              style={{
                color: TOKENS.amber,
                fontSize: 10,
                letterSpacing: '0.1em',
                marginTop: 8,
              }}
            >
              cap applied · {result.capApplied} (raw {result.raw} → final {result.final})
            </div>
          )}
        </>
      )}

      {entry && entry.note && entry.note !== 'Pending analyst review' && (
        <div
          style={{
            color: TOKENS.textMuted,
            fontSize: 11,
            fontStyle: 'italic',
            marginTop: 16,
            lineHeight: 1.6,
          }}
        >
          Note: {entry.note}
        </div>
      )}

      {!entry && (
        <div
          style={{
            color: TOKENS.textDim,
            fontSize: 11,
            marginTop: 12,
            lineHeight: 1.6,
          }}
        >
          Author a grade for this protocol in <code>src/data/cpvf-grades.json</code>.
        </div>
      )}

      <FormulaFooter />
    </div>
  );
}
