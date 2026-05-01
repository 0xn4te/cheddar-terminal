import type {
  CQDataPoint,
  DashboardData,
  HealthResponse,
  SourceResult,
} from '../../server/types.ts';

export type { DashboardData, HealthResponse, SourceResult, CQDataPoint };

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function getDashboard(): Promise<DashboardData> {
  return getJson<DashboardData>('/api/dashboard');
}

export function getHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>('/api/health');
}

// Safely extract the data array from a SourceResult. Returns null if the
// source failed or the array is empty — callers should branch on this.
export function dataOf(result: SourceResult | undefined): CQDataPoint[] | null {
  if (!result || !result.ok) return null;
  if (!result.data || result.data.length === 0) return null;
  return result.data;
}
