import { Hono } from 'hono';
import { cacheSize as cqCacheSize, hasApiKey } from '../cryptoquant.ts';
import { cacheSize as cgCacheSize, hasCoinglassKey } from '../coinglass.ts';
import type { HealthResponse } from '../types.ts';

const startedAt = Date.now();

export const healthRoute = new Hono();

healthRoute.get('/', (c) => {
  const body: HealthResponse = {
    ok: true,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    hasApiKey: hasApiKey(),
    hasCoinglassKey: hasCoinglassKey(),
    cacheEntries: cqCacheSize() + cgCacheSize(),
  };
  return c.json(body);
});
