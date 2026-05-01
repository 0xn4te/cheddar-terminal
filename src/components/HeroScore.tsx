import type { AltFlowResult } from '../lib/compute.ts';
import { describeScore } from '../lib/compute.ts';
import { fmtNum } from '../lib/format.ts';

interface HeroScoreProps {
  result: AltFlowResult;
}

export function HeroScore({ result }: HeroScoreProps) {
  const { score, components } = result;
  const { label, tone } = describeScore(score);
  const display = score === null ? '—' : fmtNum(Math.round(score));

  return (
    <div className="hero-score">
      <div className="hero-score__label">Alt Flow Index</div>
      <div className={`hero-score__value hero-score__value--${tone}`}>{display}</div>
      <div className="hero-score__caption">{label}</div>
      <ul className="hero-score__components">
        {components.map((c) => (
          <li key={c.key} className="hero-score__component">
            <span className="hero-score__component-label">{c.label}</span>
            <span className="hero-score__component-weight">
              {Math.round(c.weight * 100)}%
            </span>
            <span
              className={`hero-score__component-value ${
                c.score === null
                  ? 'hero-score__component-value--missing'
                  : c.score > 0
                    ? 'hero-score__component-value--pos'
                    : c.score < 0
                      ? 'hero-score__component-value--neg'
                      : ''
              }`}
            >
              {c.score === null ? 'no data' : fmtNum(Math.round(c.score))}
            </span>
            <span className="hero-score__component-detail">{c.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
