import { Hono } from 'hono';
import { getRecentActivity, logActivity, type ActivityModule } from '../lib/activity.ts';

export const activityRoute = new Hono();

activityRoute.get('/recent', (c) => {
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 20;
  const safe = Number.isFinite(limit) && limit > 0 ? limit : 20;
  return c.json({ events: getRecentActivity(safe) });
});

const ROUTE_TO_MODULE: Record<string, ActivityModule> = {
  '/': 'HOME',
  '/altcoin-monitor': 'ALTFLOW',
  '/crypto-valuation': 'CPVF',
  '/ngx-valuation': 'NGXV',
};

// Lightweight client-side ping. The frontend hits this on each module
// mount so PAGE_HIT events show up uniformly in dev and prod (Hono can't
// intercept SPA route changes, only HTTP requests).
activityRoute.get('/page-hit', (c) => {
  const route = c.req.query('route') || '';
  const module = ROUTE_TO_MODULE[route] ?? 'HOME';
  logActivity({ module, action: 'PAGE_HIT', detail: route || 'unknown', status: 'OK' });
  return c.json({ ok: true });
});
