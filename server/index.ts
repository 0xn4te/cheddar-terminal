import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { readFileSync } from 'node:fs';
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
  // Serve static built assets first. serveStatic calls next() on miss so
  // unknown paths fall through to the SPA handler below.
  app.use('/*', serveStatic({ root: './dist/web' }));

  // SPA fallback: any non-API GET that didn't match a static file gets
  // index.html so React Router takes over on the client. Read the file
  // once at boot rather than per-request — it's immutable for the life of
  // the process.
  const indexHtml = readFileSync('./dist/web/index.html', 'utf-8');
  app.get('/*', (c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.notFound();
    }
    return c.html(indexHtml);
  });
}

const port = Number(process.env.PORT) || 8787;

if (!hasApiKey()) {
  console.warn(
    '[cheddar-terminal] CRYPTOQUANT_API_KEY is not set — /api/dashboard will return errors per source until you add it to .env',
  );
}

if (!hasCoinglassKey()) {
  console.warn(
    '[cheddar-terminal] COINGLASS_API_KEY is not set — derivatives section will show red sources until you add it to .env',
  );
}

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[cheddar-terminal] backend listening on http://localhost:${info.port}`);
});
