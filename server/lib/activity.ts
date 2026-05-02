// In-memory ring buffer of recent backend events. Resets on deploy —
// intentional. The homepage activity log polls /api/activity/recent every
// 10s and renders this as a live story of what the terminal is doing.
//
// Don't promote this to disk / SQLite. The buffer is meant to be ephemeral.

export type ActivityModule =
  | 'TICKER'
  | 'ALTFLOW'
  | 'CPVF'
  | 'NGXV'
  | 'HOME'
  | 'SYSTEM';

export type ActivityAction =
  | 'FETCH'
  | 'CACHE_HIT'
  | 'CACHE_REFRESH'
  | 'PAGE_HIT'
  | 'ERROR';

export type ActivityStatus = 'OK' | 'FAIL' | 'STALE';

export interface ActivityEvent {
  ts: number;
  module: ActivityModule;
  action: ActivityAction;
  detail: string;
  status: ActivityStatus;
}

const BUFFER_SIZE = 50;
const buffer: ActivityEvent[] = [];

export function logActivity(event: Omit<ActivityEvent, 'ts'>): void {
  buffer.unshift({ ts: Date.now(), ...event });
  if (buffer.length > BUFFER_SIZE) buffer.pop();
}

export function getRecentActivity(n = 20): ActivityEvent[] {
  const limit = Math.max(1, Math.min(BUFFER_SIZE, n));
  return buffer.slice(0, limit);
}
