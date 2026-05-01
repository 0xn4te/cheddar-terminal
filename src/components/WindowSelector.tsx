export type ViewWindow = '90d' | '6m' | '1y' | 'all';

interface WindowSelectorProps {
  value: ViewWindow;
  onChange: (next: ViewWindow) => void;
  loading?: boolean;
}

const OPTIONS: Array<{ value: ViewWindow; label: string }> = [
  { value: '90d', label: '90D' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'ALL' },
];

export function WindowSelector({ value, onChange, loading }: WindowSelectorProps) {
  return (
    <div className="window-selector" role="tablist" aria-label="Time window">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          className={`window-selector__pill${value === opt.value ? ' window-selector__pill--active' : ''}`}
          onClick={() => onChange(opt.value)}
          disabled={loading}
        >
          {opt.label}
        </button>
      ))}
      {loading && <span className="window-selector__loading">loading…</span>}
    </div>
  );
}

export function windowToDays(w: ViewWindow): number | null {
  switch (w) {
    case '90d': return 90;
    case '6m': return 180;
    case '1y': return 365;
    case 'all': return null;
  }
}
