const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
});

const usdFull = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const numCompact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

const pct = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 2,
});

const dateShort = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const dateLong = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export function fmtUSD(n: number | null | undefined, full = false): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return full ? usdFull.format(n) : usdCompact.format(n);
}

export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return pct.format(n);
}

export function fmtNum(n: number | null | undefined, opts?: { compact?: boolean }): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (opts?.compact) return numCompact.format(n);
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function fmtDate(input: string | Date | null | undefined, long = false): string {
  if (!input) return '—';
  const d = typeof input === 'string' ? parseLooseDate(input) : input;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return (long ? dateLong : dateShort).format(d);
}

// CryptoQuant returns dates either as "20240105" or "2024-01-05" or
// "2024-01-05 00:00:00". Handle all of them.
export function parseLooseDate(s: string): Date | null {
  const trimmed = s.trim();
  if (/^\d{8}$/.test(trimmed)) {
    const y = trimmed.slice(0, 4);
    const m = trimmed.slice(4, 6);
    const d = trimmed.slice(6, 8);
    return new Date(`${y}-${m}-${d}T00:00:00Z`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00Z`);
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]/.test(trimmed)) {
    return new Date(trimmed.replace(' ', 'T') + (trimmed.endsWith('Z') ? '' : 'Z'));
  }
  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}
