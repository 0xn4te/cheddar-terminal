# CLAUDE.md

Project context for Claude Code. Read this before making changes.

## What this is

A local-first crypto liquidity monitoring dashboard that pulls real on-chain
flow data from CryptoQuant and derivatives sentiment from Coinglass, computes
a composite "Alt Flow Index", and renders a multi-section editorial dashboard.
Architected for eventual deployment to Cloudflare Workers or Vercel, but
currently meant to run locally.

## Architecture

```
┌─────────────────┐    /api/*    ┌──────────────────┐    HTTPS    ┌──────────────────┐
│  Vite/React     │ ───────────▶ │  Hono backend    │ ──────────▶ │  CryptoQuant API │
│  (browser)      │              │  (Node, :8787)   │             │  Coinglass API   │
└─────────────────┘              └──────────────────┘             └──────────────────┘
                                          │ ▲
                                  writes  │ │ reads (long-range charts)
                                          ▼ │
                                  ┌──────────────────┐
                                  │  SQLite (WAL)    │      ← collector populates
                                  │  timeseries_v2   │
                                  └──────────────────┘
```

The frontend NEVER talks to upstream APIs directly. Three reasons:
1. The bearer tokens must not ship to the browser.
2. CORS — neither CryptoQuant nor Coinglass return browser-friendly headers.
3. Pooled rate limiting / caching — one shared cache, not one per tab.

## Project layout

```
liquidity-monitor/
├── server/
│   ├── index.ts            # Hono app, mounts /api/*, serves /dist/web in prod
│   ├── cryptoquant.ts      # Authenticated CQ client + in-memory cache + cqFetchMany
│   ├── coinglass.ts        # Authenticated CG client + in-memory cache + cgFetchMany
│   ├── db.ts               # node:sqlite (built-in), snapshots + timeseries_v2
│   ├── collector.ts        # Background poller (npm run collector [-- --backfill])
│   ├── types.ts            # Shared types — imported by both server AND src
│   └── routes/
│       ├── dashboard.ts    # Bundled GET /api/dashboard
│       ├── history.ts      # GET /api/history?metric=&asset=&since=&until=
│       └── health.ts       # GET /api/health (does NOT call upstream APIs)
├── src/
│   ├── App.tsx             # Top-level orchestration + window-selector state
│   ├── main.tsx            # React mount point
│   ├── styles.css          # All design tokens + global styles
│   ├── components/         # Presentational components
│   │   ├── HeroScore.tsx
│   │   ├── HeroChart.tsx
│   │   ├── NetflowChart.tsx        # signed-bar chart (red=in, green=out)
│   │   ├── ReserveChart.tsx        # area chart for stocks (reserve, supply)
│   │   ├── IndicatorsChart.tsx     # dual-axis SSR + MVRV
│   │   ├── RatioChart.tsx          # sparkline for whale-ratio + long/short
│   │   ├── FundingRateChart.tsx    # line w/ above/below-zero shading
│   │   ├── WindowSelector.tsx      # 90D/6M/1Y/ALL pill control
│   │   ├── Tile.tsx
│   │   └── SourceBar.tsx
│   └── lib/
│       ├── api.ts          # fetch wrappers — /api/dashboard
│       ├── history.ts      # fetch wrappers — /api/history + history→data adapter
│       ├── compute.ts      # PURE functions, no React. Easy to unit test.
│       ├── format.ts       # fmtUSD / fmtPct / fmtNum / fmtDate
│       └── chartSetup.ts   # Chart.js registration + COLORS + defaultChartOptions
├── .env.example            # Template — copy to .env
├── package.json            # `npm run dev` runs both servers concurrently
├── vite.config.ts          # Frontend dev server, proxies /api → :8787
├── tsconfig.json           # Frontend TS config
├── tsconfig.server.json    # Backend TS config (build via `npm run build`)
└── README.md
```

## Running

```bash
cp .env.example .env       # fill in CRYPTOQUANT_API_KEY
npm install
npm run dev                # starts backend (8787) + frontend (5173) concurrently
```

For production: `npm run build` produces `dist/web/` (frontend) and
`dist/server/` (compiled backend). Then `npm start` serves both from :8787.

## Critical conventions

### CryptoQuant data ordering
Series come back **most-recent-first** — index 0 is today, index N is N days
ago. All compute helpers in `src/lib/compute.ts` respect this. If you write
new code that touches a CQ array, double-check whether you need to reverse
for charting (which expects left-to-right time). The `timelineFor()` helper
handles the reversal cleanly.

### Source-result shape
Every CryptoQuant endpoint returns either:
```ts
{ ok: true, data: CQDataPoint[] }
// OR
{ ok: false, error: string, status: number }
```
Frontend uses `dataOf()` from `src/lib/api.ts` to safely extract the array.
NEVER assume `ok: true` — partial failures are normal and the UI handles them.

### Adding a new CryptoQuant endpoint
1. **Discover the path first** — don't guess. `GET /v1/discovery/endpoints?format=json`
   (with your bearer) returns all 245 endpoints with their required params.
   The shape map at the top of `server/cryptoquant.ts` lists what's already
   wired up.
2. Add it to the `cqFetchMany` call in `server/routes/dashboard.ts`.
3. Add the field to `DashboardData` in `server/types.ts`.
4. Add the value-key to the relevant fallback list in `src/lib/compute.ts`
   (e.g. `STABLE_SUPPLY_KEYS`, `NETFLOW_KEYS`, `SSR_KEYS`). Component code
   reads via `pickNumber(point, keys)` — it won't find your value otherwise.
5. Use `dataOf(data.flows.yourNew)` in components.
6. **Don't** add a separate fetch from a component — bundle through `/api/dashboard`.
7. Verify end-to-end with `node --import tsx verify-index.mjs` (project root)
   before declaring done.

### Response shape gotchas (per-endpoint)
CryptoQuant's v1 schema is inconsistent in two ways that bit us during the
initial build. **Treat every new endpoint as guilty until proven innocent**
and verify field names + types against a live response, not docs.

- **Numeric strings.** Some metrics return values as JSON strings rather
  than numbers — confirmed for `stablecoin_supply_ratio` ("11.38051390"),
  suspected on a few other indicators. `pickNumber()` uses `parseFloat`
  on non-number values, so it tolerates both shapes — **never** read raw
  point values directly with `point.x as number`. Always go through
  `pickNumber` / `seriesOf` / `latestValue`.
- **Field names diverge from the metric name.** SSR comes back under
  `stablecoin_supply_ratio`, NOT `ssr`. Stablecoin total supply is
  `supply_total`, not `total_supply`. The fallback key arrays in
  `compute.ts` exist precisely to absorb these surprises — when adding
  an endpoint, list every plausible key (the live one first, legacy
  guesses after) so a future shape change doesn't silently break the index.
- **Coin units, not USD, on Pro tier.** `/btc/exchange-flows/netflow`
  returns `netflow_total` denominated in BTC; the `_usd` variant is
  Premium-only. Same for ETH. The Alt Flow Index normalization in
  `computeAltFlowIndex()` is calibrated for coin units (50k BTC / 500k
  ETH saturation refs). If you upgrade tier and want to switch to USD,
  re-tune the divisors — don't just add `_usd` to the key list.
- **Stablecoin path lives under `/stablecoin/`, not `/erc20/`.** Correct
  path: `/v1/stablecoin/network-data/supply` with required `token` param
  (`usdt_eth`, `usdc`, `dai`, `all_token`, etc.). The `/erc20/network-data/total-supply`
  guess from early scaffolding 404s.
- **Stablecoin exchange netflow returns USD, not stablecoin units.**
  `/stablecoin/exchange-flows/netflow` with `token=usdt_eth|usdc` and
  `exchange=all_exchange` returns `netflow_total` in USD (e.g. ~-1.9B).
  Tile rendering for these uses `fmtUSD`, not coin units.
- **Whale ratio path is `/btc/flow-indicator/exchange-whale-ratio`.**
  NOT `/btc/exchange-flows/exchange-whale-ratio` (that 404s). Field
  name is `exchange_whale_ratio` and the value is a number (not a
  numeric string). Available on Pro tier.
- **BTC miner netflow** lives at `/btc/miner-flows/netflow` with
  required param `miner=all_miner`. Field is `netflow_total` in BTC.

### Adding a new chart type
- Reusable charts go in `src/components/` and accept `CQDataPoint[] | null`
  plus a `valueKey` prop. See `NetflowChart.tsx` and `ReserveChart.tsx`.
- One-off charts (like `HeroChart`, `IndicatorsChart`) take their own typed
  props. Don't try to over-generalize.
- Always import from `chartSetup.ts` for `COLORS` and `defaultChartOptions()`.
  Don't hardcode hex values — they're design tokens.

### Design system
Tokens live in `src/styles.css` `:root`. The aesthetic is deliberate:
editorial newspaper (cream text on near-black, JetBrains Mono for numbers,
Instrument Serif italic for headings). Don't introduce border-radius — the
boxy panels are intentional. Don't introduce new colors without adding them
to the token list first.

### Cache TTL
CryptoQuant updates daily/hourly, so the 5-minute in-memory cache in
`server/cryptoquant.ts` is conservative enough. If you add hourly endpoints
later, drop CACHE_TTL to 60s. Don't bypass the cache without good reason —
rate limit budget on Pro tier is finite.

### Coinglass conventions

Coinglass v4 lives behind `server/coinglass.ts`. It mirrors the CryptoQuant
client's surface (cache TTL, source-result shape, fetch-many helper) but
with several differences worth remembering — every one of which cost time
to discover the first time:

- **Base URL is `https://open-api-v4.coinglass.com/api`,** NOT
  `open-api.coinglass.com/api`. The latter responds (so it looks alive)
  but 404s every endpoint. Don't change `BASE` without re-probing.
- **Auth header is `CG-API-KEY: <key>`,** not `Authorization: Bearer`.
  Don't reuse `cqFetch` — the headers are wrong. `cgFetch` handles it.
- **Response envelope.** Successful responses are `{ code: "0", msg: "success", data: [...] }`.
  Error responses use a non-zero `code` (e.g. `"401"` with `msg: "Upgrade plan"`)
  inside an HTTP 200. The adapter checks `code` and surfaces app-level
  errors as `SourceResult { ok: false, error: msg }` so the source bar
  shows them like any CQ failure.
- **Ordering is oldest-first.** Coinglass returns daily candles with the
  earliest timestamp at index 0. The adapter detects this and reverses
  internally so storage / `compute.ts` helpers stay on the
  most-recent-first convention. Each point also gets a synthetic `date`
  field derived from `time` (ms epoch) so `timelineFor()` works without
  per-source date parsing.
- **Numeric strings.** Like CryptoQuant, Coinglass ships values as JSON
  strings on most endpoints (e.g. `close: "-0.002094"`). `pickNumber`'s
  `parseFloat` fallback handles this — never read raw fields directly.
- **Pair vs base-asset confusion in `symbol`.** Different endpoint families
  expect different things in `symbol`:
  - Funding rate + OI history: `symbol=BTC` (base asset).
  - Long/short ratio history: `symbol=BTCUSDT` (full pair). Passing `BTC`
    here returns `code=400 "The requested pair does not exist on the exchange"`.

Endpoint shapes confirmed in production:

- `/futures/funding-rate/oi-weight-history?symbol=BTC|ETH&interval=1d&limit=N`
  → `{ time, open, high, low, close }`. `close` = OI-weighted funding rate
  at candle close, expressed as a fraction (0.0001 = 0.01% per 8h period).
- `/futures/open-interest/aggregated-history?symbol=BTC|ETH&interval=1d&limit=N`
  → `{ time, open, high, low, close }`. `close` is aggregated OI in USD.
- `/futures/top-long-short-position-ratio/history?symbol=BTCUSDT&exchange=Binance&interval=1d&limit=N`
  → `{ time, top_position_long_percent, top_position_short_percent, top_position_long_short_ratio }`.
  Use `top_position_long_short_ratio` as the canonical value.

Coinglass tiering: Hobbyist ($29/mo) covers everything used here with
margin. Free tier returns `code=401 msg="Upgrade plan"` on every
endpoint — a valid key on Free is functionally indistinguishable from
no key at all. Rate limit on Hobbyist is 30 req/min; the 15-min collector
cycle uses 5 reqs and the backfill throttles to ~4 req/sec, well inside.

### Collector lifecycle

`server/collector.ts` is the durable archive populator. Runs in two modes:

- **Backfill** (`npm run collector -- --backfill`): one-shot, pulls 90 days
  per metric, writes to `timeseries_v2`, exits. Run this once after first
  setup so the window selector has data to show for `6M` / `1Y` / `ALL`.
- **Incremental** (`npm run collector`): polls every 15 min, fetches the
  most recent 7 days per metric, upserts by `(metric, asset, ts)`. Idempotent
  — safe to run continuously alongside `npm run dev` in a separate terminal.

Missing-key tolerance: if either `CRYPTOQUANT_API_KEY` or `COINGLASS_API_KEY`
is absent, the collector logs a one-line notice and skips the corresponding
group of tasks. CQ tasks continue even if the CG key is missing.

The `TASKS` array is the single source of truth for what gets archived.
Adding a new dashboard metric? Add it to `TASKS` AND to `dashboard.ts`'s
spec map, OR the long-window view will be empty for that metric.

### History endpoint contract

`GET /api/history?metric=<name>&asset=<asset>&since=<ms>&until=<ms>`

- `metric` and `asset` are **whitelisted** in `server/routes/history.ts::ALLOWED`.
  Anything else returns 400. Add new metric/asset pairs to the whitelist
  when adding new collector tasks.
- `since` defaults to 1 year ago, `until` to now. Both are unix-ms numbers;
  malformed input returns 400.
- Response: `{ metric, asset, points: [{ts, value}, ...], archiveDepthDays }`.
  Points are oldest-first (the inverse of CQ ordering — chart code is
  left-to-right time). `archiveDepthDays` is days between oldest archived
  point and now, used by the frontend to render "Archive depth: X days"
  hints when the requested window exceeds available data.
- Reads from `timeseries_v2`. The legacy `timeseries` table is left in
  place for any pre-existing archives but is no longer read or written by
  live code paths.

### Window selector behavior (frontend)

App.tsx owns `viewWindow` state (`90d` | `6m` | `1y` | `all`) and a
`historyMap` keyed by `${metric}:${asset}`. The data-routing rule:

- `90d`: charts read from the live `/api/dashboard` payload. **No refetch
  on window change** — the data is already loaded.
- `6m` / `1y` / `all`: a `useEffect` fires N parallel `/api/history` calls
  (one per chart-bound metric/asset) with `since = now - days * day_ms`.
  Results are passed as a synthesized `CQDataPoint[]` (`historyToData()`
  reverses to most-recent-first and adds the canonical field) so the
  existing chart components don't need history-specific code.
- Tiles **always** use the dashboard endpoint (most-recent values only).
- When `archiveDepthDays < requestedDays`, charts render an inline note:
  *"Archive depth: N days. Showing what's available."*

No localStorage. The selection resets to `90d` on reload — that's the
"open it and read today" mode.

## CryptoQuant tier notes

API access starts at Professional. Some endpoints (whale ratio variants,
some miner endpoints, ERC20 stablecoin flows on certain exchanges) require
Premium. The `sources` object on every dashboard response shows which
endpoints failed and why — check there if data goes missing after edits.

Keys must be Bearer tokens, sent as `Authorization: Bearer <token>`. The
client handles this in `cqFetch()` — never reimplement.

## Composite score (Alt Flow Index)

Lives in `src/lib/compute.ts::computeAltFlowIndex()`. Composition (current):

- **35%** — Stablecoin supply 7d expansion (USDT + USDC date-aligned + summed
  via `combineSeriesByDate`, then `pctChangeNDaysAgo` over the combined series)
- **22%** — BTC exchange netflow 7d sum, **in BTC** (negative = bullish)
- **13%** — ETH exchange netflow 7d sum, **in ETH** (negative = bullish)
- **15%** — SSR posture vs 30d mean (current below mean = bullish for alts)
- **15%** — Funding posture: 14d mean of (BTC + ETH OI-weighted aggregated
  funding rate), sign inverted (high funding = crowded long = bearish)

Each component is normalized through `tanh` so extremes saturate at ±100.
The divisors encode the saturation reference for each input:

- Stablecoin: 0.01 (1% 7d expansion → ~76)
- BTC netflow: 50,000 BTC (7d net move of that size → ~76)
- ETH netflow: 500,000 ETH
- SSR: 0.5 (deviation from 30d mean)
- Funding: 0.0003 (~0.03% per 8h funding period, the threshold above which
  funding is meaningfully crowded; sign inverted before tanh)

Score is bounded [-100, +100]. Degrades gracefully — partial inputs still
produce a score over the inputs that ARE available, with weights re-normalized.
If you change the weighting OR the saturation divisors, also update the
methodology paragraph in `App.tsx::DashboardView` so the on-page explanation
matches the math.

**Weights changed on 2026-05-01** when the funding-rate component was added.
Prior formula was 40/25/15/20 across stable/BTC/ETH/SSR with no funding term;
historical scores from before that date are NOT directly comparable to the
current formula.

## Future expansion paths

When picking up new work, these are the natural next moves:

1. **Alerts** — netflow spike detection, SSR threshold crosses, whale ratio
   anomalies, funding-rate squeezes. Push to Telegram/email/webhook. Logic
   lives in collector.ts (it already runs every 15 min); alert delivery in
   a new `server/alerts.ts`.

2. **Solana memecoin extension** — Birdeye / Jupiter / Dexscreener adapters
   live in `server/sources/` (create the dir). Same `cqFetchMany`-shaped
   pattern. `/api/solana` becomes a new route.

3. **Composite backtest** — once the archive has a few months of data, write
   a small offline script that computes `computeAltFlowIndex` per-day from
   `timeseries_v2` and joins against BTC/ETH/total-alt prices to evaluate
   forward-return correlations. Useful for tuning the saturation divisors.

4. **Deployment** — for Cloudflare Workers, replace `@hono/node-server` with
   the Workers adapter, swap `node:sqlite` for D1 or Durable Objects, move
   secrets to Workers env vars. Hono itself is portable.

## What NOT to do

- Don't put API keys anywhere except `.env` and `process.env`.
- Don't commit the `.env` file (it's gitignored — keep it that way).
- Don't add upstream-API fetches from frontend code. All CryptoQuant access
  goes through `server/cryptoquant.ts`; all Coinglass access through
  `server/coinglass.ts`.
- Don't add `localStorage` calls — there's nothing browser-state-persistent
  in this app, and the backend (+ SQLite) is the source of truth.
- Don't change ordering assumptions (most-recent-first) without updating
  every consumer in `lib/compute.ts`. Coinglass is reversed in the adapter
  precisely so this invariant holds.
- Don't read or write the legacy `timeseries` table. Use `timeseries_v2`
  (`upsertPoints` / `queryRange` / `metricDepth` in `server/db.ts`).
- Don't bypass the `/api/history` whitelist — the metric/asset enum in
  `server/routes/history.ts::ALLOWED` is deliberate. Add to it when
  adding new collector tasks; don't remove it.
