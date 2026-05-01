import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { dashboardRoute } from './routes/dashboard.ts';
import { healthRoute } from './routes/health.ts';
import { historyRoute } from './routes/history.ts';
import { hasApiKey } from './cryptoquant.ts';
import { hasCoinglassKey } from './coinglass.ts';

const app = new Hono();

app.use('*', logger());

app.route('/api/health', healthRoute);
app.route('/api/dashboard', dashboardRoute);
app.route('/api/history', historyRoute);

if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist/web' }));
  app.get('/*', serveStatic({ path: './dist/web/index.html' }));
}

const port = Number(process.env.PORT) || 8787;

if (!hasApiKey()) {
  console.warn(
    '[liquidity-monitor] CRYPTOQUANT_API_KEY is not set — /api/dashboard will return errors per source until you add it to .env',
  );
}

if (!hasCoinglassKey()) {
  console.warn(
    '[liquidity-monitor] COINGLASS_API_KEY is not set — derivatives section will show red sources until you add it to .env',
  );
}

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[liquidity-monitor] backend listening on http://localhost:${info.port}`);
});
