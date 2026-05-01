import type { CQDataPoint, HistoryResponse } from '../../server/types.ts';

export type { HistoryResponse };

export async function getHistory(
  metric: string,
  asset: string,
  since?: number,
  until?: number,
): Promise<HistoryResponse> {
  const params = new URLSearchParams({ metric, asset });
  if (since !== undefined) params.set('since', String(since));
  if (until !== undefined) params.set('until', String(until));
  const res = await fetch(`/api/history?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`/api/history → ${res.status} ${text}`);
  }
  return (await res.json()) as HistoryResponse;
}

// Convert oldest-first history points to most-recent-first CQDataPoint[]
// with a synthetic field so the existing chart components (which read via
// `valueKey`) work without modification.
export function historyToData(h: HistoryResponse, fieldName: string): CQDataPoint[] {
  return [...h.points].reverse().map((p) => ({
    date: new Date(p.ts).toISOString().slice(0, 10),
    [fieldName]: p.value,
  }));
}
