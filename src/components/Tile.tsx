interface TileProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'pos' | 'neg' | 'neu';
}

export function Tile({ label, value, hint, tone = 'neu' }: TileProps) {
  return (
    <div className="tile">
      <div className="tile__label">{label}</div>
      <div className={`tile__value tile__value--${tone}`}>{value}</div>
      {hint && <div className="tile__hint">{hint}</div>}
    </div>
  );
}
