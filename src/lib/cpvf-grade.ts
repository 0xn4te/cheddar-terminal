// Pure grade computation for CPVF protocol detail. No React.
//
// Rubric: 4 dimensions × 0-10. Final = round(0.35·Mech + 0.30·Mult + 0.20·PMF + 0.15·Infl).
// Caps applied AFTER the weighted sum, in order:
//   1. Mech === 0       → final = 0
//   2. Mech ≤ 3         → final ≤ Mech
//   3. Mech ≤ 5         → final ≤ Mech + 1
//   4. Mult ≤ 1 (>200x) → final ≤ 5
//
// Rubric adapted from @0xkyle__'s Crypto Revenue Leaderboard.

export interface DimensionEntry {
  score: number;
  rationale: string;
}

export type DimensionScore = DimensionEntry | null;

export interface GradeInput {
  mechanism: DimensionScore;
  inflation: DimensionScore;
  multiple: DimensionScore;
  pmf: DimensionScore;
}

export type GradeResult =
  | { status: 'graded'; final: number; raw: number; capApplied: string | null }
  | { status: 'ungraded'; reason: 'no-entry' | 'incomplete' };

export function computeGrade(input: GradeInput): GradeResult {
  const { mechanism, inflation, multiple, pmf } = input;

  if (!mechanism || !inflation || !multiple || !pmf) {
    return { status: 'ungraded', reason: 'incomplete' };
  }

  const raw = Math.round(
    0.35 * mechanism.score +
      0.30 * multiple.score +
      0.20 * pmf.score +
      0.15 * inflation.score,
  );

  if (mechanism.score === 0) {
    return { status: 'graded', final: 0, raw, capApplied: 'Mechanism = 0' };
  }
  if (mechanism.score <= 3) {
    return {
      status: 'graded',
      final: Math.min(raw, mechanism.score),
      raw,
      capApplied: 'Mech ≤ 3',
    };
  }
  if (mechanism.score <= 5) {
    return {
      status: 'graded',
      final: Math.min(raw, mechanism.score + 1),
      raw,
      capApplied: 'Mech ≤ 5',
    };
  }
  if (multiple.score <= 1) {
    return {
      status: 'graded',
      final: Math.min(raw, 5),
      raw,
      capApplied: 'Mult ≤ 1 (>200x FDV/Rev)',
    };
  }

  return { status: 'graded', final: raw, raw, capApplied: null };
}

// JSON shape backing src/data/cpvf-grades.json.
export interface GradeEntry {
  slug: string;
  type: 'Token' | 'Public' | 'Private';
  tokenized: boolean;
  mechanism: DimensionScore;
  inflation: DimensionScore;
  multiple: DimensionScore;
  pmf: DimensionScore;
  note?: string;
  authoredAt: string;
}
