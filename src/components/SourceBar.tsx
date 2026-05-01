import type { DashboardData } from '../lib/api.ts';

interface SourceBarProps {
  sources: DashboardData['sources'];
  generatedAt: string;
}

export function SourceBar({ sources, generatedAt }: SourceBarProps) {
  const entries = Object.entries(sources);
  const okCount = entries.filter(([, v]) => v.ok).length;

  return (
    <div className="sourcebar">
      <div className="sourcebar__summary">
        <span className="sourcebar__count">
          {okCount}/{entries.length} sources live
        </span>
        <span className="sourcebar__time">
          generated {new Date(generatedAt).toLocaleTimeString()}
        </span>
      </div>
      <ul className="sourcebar__list">
        {entries.map(([key, status]) => (
          <li
            key={key}
            className={`sourcebar__item sourcebar__item--${status.ok ? 'ok' : 'err'}`}
            title={status.ok ? 'live' : `${status.status ?? '?'} — ${status.error ?? 'failed'}`}
          >
            <span className="sourcebar__dot" />
            <span className="sourcebar__name">{key}</span>
            {!status.ok && status.status !== undefined && (
              <span className="sourcebar__status">{status.status}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
