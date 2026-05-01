# Alt Flow Monitor

Local-first crypto liquidity dashboard. React + Vite frontend, Hono backend
that proxies CryptoQuant + Coinglass. Composite "Alt Flow Index" with
editorial styling.

See `CLAUDE.md` for the full architectural spec.

## Quick start

```bash
cp .env.example .env       # add CRYPTOQUANT_API_KEY (and optionally COINGLASS_API_KEY)
npm install
npm run dev                # backend :8787, frontend :5173
```

Open http://localhost:5173.

## Scripts

| script                              | what it does                                          |
| ----------------------------------- | ----------------------------------------------------- |
| `npm run dev`                       | Concurrent backend + frontend dev servers             |
| `npm run build`                     | Build both for production                             |
| `npm start`                         | Serve built bundle from a single :8787 process        |
| `npm run collector`                 | Background poller — writes archives to local SQLite   |
| `npm run collector -- --backfill`   | One-shot 90d backfill, then exits                     |
| `npm run typecheck`                 | Type-check both frontend and server                   |

## Collector lifecycle

The dashboard renders the live 90-day window straight from the upstream APIs.
Anything longer (`6M`, `1Y`, `ALL` in the window selector) reads from a local
SQLite archive populated by the collector.

Run it once to seed the archive:

```bash
npm run collector -- --backfill
```

This pulls 90 days per metric and writes to `data/liquidity.db`. Then run the
poller in a second terminal alongside `npm run dev`:

```bash
npm run collector
```

It ticks every 15 minutes, fetching the most recent 7 days per metric and
upserting by `(metric, asset, ts)` so re-runs are idempotent. On Windows it
runs fine in a regular PowerShell window — nothing special required.

If only one of `CRYPTOQUANT_API_KEY` / `COINGLASS_API_KEY` is set, the
collector skips the other group and continues. Tasks for the missing key
just don't run that cycle.

Verify the archive:

```bash
sqlite3 data/liquidity.db "SELECT metric, asset, COUNT(*) FROM timeseries_v2 GROUP BY metric, asset"
```

## Window selector

The header has a `90D / 6M / 1Y / ALL` control. `90D` reuses the data already
loaded from `/api/dashboard` — no refetch. The longer windows pull per-metric
series from `/api/history` and re-render the charts. Tiles always reflect the
most recent value, regardless of window.

When the requested window exceeds the local archive depth, each affected chart
displays an inline note: *"Archive depth: N days. Showing what's available."*
Run the collector backfill to extend the archive.

## Notes

- Frontend never calls upstream APIs directly — all access goes through the
  backend so bearer tokens stay server-side.
- 5-minute in-memory response cache in `server/cryptoquant.ts` and
  `server/coinglass.ts`.
- `/api/dashboard` returns a `sources` map showing which feeds were live vs.
  failed — visible at the bottom of the page for debugging.
- CryptoQuant access starts at Pro tier; some endpoints (whale ratios, ERC20
  stable flows on certain exchanges) need Premium and will surface as failed
  sources in the bar.
- Coinglass access starts at Hobbyist tier ($29/mo). Without a Coinglass key,
  the dashboard still loads — the derivatives section just shows red sources
  and "—" tiles.
