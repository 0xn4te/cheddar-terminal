// Shared types — imported by both server and src.
// Keep this file dependency-free so the frontend can import it cleanly.

export interface CQDataPoint {
  date?: string;
  datetime?: string;
  [key: string]: string | number | undefined;
}

export type SourceResult =
  | { ok: true; data: CQDataPoint[] }
  | { ok: false; error: string; status: number };

export interface SourceStatus {
  ok: boolean;
  status?: number;
  error?: string;
  cached?: boolean;
}

export interface DashboardData {
  generatedAt: string;
  flows: {
    btcNetflow: SourceResult;
    ethNetflow: SourceResult;
    usdtNetflow: SourceResult;
    usdcNetflow: SourceResult;
    stableUsdtSupply: SourceResult;
    stableUsdcSupply: SourceResult;
    btcMinerNetflow: SourceResult;
  };
  stocks: {
    btcReserve: SourceResult;
    btcOpenInterest: SourceResult;
    ethOpenInterest: SourceResult;
  };
  indicators: {
    ssr: SourceResult;
    mvrv: SourceResult;
    btcWhaleRatio: SourceResult;
  };
  derivatives: {
    btcFundingRate: SourceResult;
    ethFundingRate: SourceResult;
    btcLongShortRatio: SourceResult;
  };
  sources: Record<string, SourceStatus>;
}

export interface HistoryPoint {
  ts: number;
  value: number;
}

export interface HistoryResponse {
  metric: string;
  asset: string;
  points: HistoryPoint[];
  archiveDepthDays: number;
}

export interface HealthResponse {
  ok: true;
  uptimeSec: number;
  hasApiKey: boolean;
  hasCoinglassKey: boolean;
  cacheEntries: number;
}
