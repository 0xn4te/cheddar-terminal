# Task: Expand signals + collector + history route

## Goal

Take the working baseline dashboard from snapshot tool to durable archive. Add four new flow signals, wire up the collector to persist everything to SQLite, expose a history endpoint for long-range views, and add a window selector to the frontend. By the end of this task, the dashboard should support 90d / 6m / 1y / all-time views — gracefully indicating when the archive isn't yet long enough for the requested window.

## Read first

- `CLAUDE.md` — project conventions (data ordering, source-result shape, no-localStorage rule, design tokens).
- `README.md` — already up to date with current state.
- Run `npm run dev` and verify the baseline still works at <http://localhost:5173> before touching anything. The "Critical conventions" and "Quirks discovered" sections in CLAUDE.md must already reflect reality. If they don't, fix CLAUDE.md first as a prerequisite.

## Plan first, then execute

Before writing any code:

1. Create `tasks/expand-signals-plan.md`. Write out:
   - File-by-file change list (every file you'll create or modify, with one-line rationale)
   - Database schema additions you intend to make in `server/db.ts`
   - New `DashboardData` shape in `server/types.ts` — explicitly diff against current
   - The exact list of CryptoQuant + Coinglass endpoints you'll add, including parameters
   - Composite Alt Flow Index reweighting proposal (see §6 below)
   - Risk areas / open questions
   - Validation steps you'll run at each phase
2. **Stop after writing the plan.** Print it and wait for approval before touching any other file. Do not begin implementation until the plan is approved.

## Scope

### 1. Add Coinglass adapter (new data source)

- Create `server/coinglass.ts` mirroring `server/cryptoquant.ts`'s shape — bearer auth, in-memory cache with same TTL, unified error type, `cgFetchMany` helper.
- Coinglass v4 base URL: `https://open-api.coinglass.com/api`. Auth header is `CG-API-KEY: <key>` (different from CryptoQuant's `Authorization: Bearer`).
- Endpoints to add (verify exact paths against <https://docs.coinglass.com/reference> — these are illustrative):
  - Aggregated funding rate (BTC perp, OI-weighted): historical OHLC, daily resolution, 90 days
  - Aggregated funding rate (ETH perp): same
  - Long/short ratio (BTC, top traders, daily, 90d)
  - Open interest (BTC + ETH aggregate, daily, 90d)
- Add `COINGLASS_API_KEY` to `.env.example` with a brief comment about the Hobbyist tier.
- Update `server/index.ts` startup warning to flag missing Coinglass key the same way it flags missing CryptoQuant key.

### 2. Surface existing-but-hidden signals

These are already fetched in `server/routes/dashboard.ts` but not rendered anywhere on the page:

- BTC exchange whale ratio (`btcWhaleRatio`)
- BTC miner netflow (`btcMinerNet`)
- USDT exchange netflow (`usdtNetflow`)
- USDC exchange netflow (`usdcNetflow`)

For each, add a tile in the existing tile grid AND a chart component in a new "Derivatives & whales" or "Stablecoin flows" section. Reuse `NetflowChart` for the netflow series; reuse `IndicatorTile` patterns for the whale ratio. Don't create new chart primitives unless the data shape genuinely demands one — whale ratio is a 0-1 ratio over time, suitable for a small sparkline.

### 3. New section: derivatives sentiment

Add a new dashboard section (analog to "exchange flows") containing:

- BTC funding rate, 90d (line chart, with shading above/below zero)
- ETH funding rate, 90d (line chart)
- BTC long/short ratio tile + sparkline
- BTC + ETH OI tiles with 7d delta

Section title in the editorial-italic style consistent with existing sections. Place it after stablecoin flows.

### 4. Collector wired up properly

`server/collector.ts` is currently a stub. Make it production-ready:

- Expand the `TASKS` array to cover EVERY metric that ends up in the dashboard — both CryptoQuant and Coinglass. The principle: anything the user can see on the dashboard should also be archived.
- For each task, fetch the last 7 days of data per cycle and `INSERT OR REPLACE` into `timeseries` so re-runs don't create duplicates. Use the natural primary key (`metric, asset, ts`) already defined.
- Add a one-time backfill mode: `npm run collector -- --backfill` fetches 90 days of history per metric and writes it. This populates the archive immediately for the existing 90-day API window. Without it, you start from zero.
- Add structured logging: cycle start, per-task ok/fail with elapsed ms, cycle end with summary. No emojis.
- Graceful handling of missing API keys — collector should log "skipping Coinglass tasks: no key" and continue with CryptoQuant tasks rather than crash.
- Document in README.md how to run it: `npm run collector` in a separate terminal alongside `npm run dev`. Note that on Windows it can run in a regular PowerShell window; nothing special required.

### 5. `/api/history` route

- New file `server/routes/history.ts`.
- `GET /api/history?metric=<name>&asset=<asset>&since=<ms>&until=<ms>` returns `{metric, asset, points: [{ts, value}, ...]}`.
- `since` and `until` optional; default since = 1 year ago, until = now.
- Parameter validation — return 400 with a clear message for unknown metric or malformed timestamps. Whitelist the metric names you support against an enum so people can't query arbitrary table contents.
- Mount in `server/index.ts` at `/api/history`.

### 6. Composite Alt Flow Index — incorporate funding rate

This is the only judgment call in the task. **Document your reasoning in the plan before coding.**

Funding rate is a sentiment signal, not a flow signal. High aggregated funding = crowded long = often precedes squeezes (bearish for risk-on positioning). Low or negative funding = bearish positioning crowded = often precedes rallies.

Two options to choose between in your plan:

- **A) Add as 5th component.** Reweight existing components proportionally so the total stays 100%. Document new weights and update the methodology paragraph in `App.tsx::DashboardView`. Score values become non-comparable to the old formula — note this in CLAUDE.md.
- **B) Surface funding rate as an indicator only, do not add to composite.** Keeps score historically comparable. Funding becomes a separate read-out the user interprets independently.

State your recommendation and rationale in the plan. I'll likely accept (A) but want to see the reasoning.

### 7. Frontend window selector

- Add a window control in the header next to the refresh button: pills for `90D` (default) / `6M` / `1Y` / `ALL`.
- For `90D`: use the existing `/api/dashboard` response — no change to current behavior.
- For `>90D`: charts query `/api/history` per metric. Tiles continue to use the most recent value from the dashboard endpoint.
- When the requested window exceeds available archive depth, render a small inline note on the affected chart: "Archive depth: X days. Showing what's available." Don't show an error — partial data is the expected state for the first weeks after first run.
- The window selection should be a top-level state in `App.tsx` and propagated via props (no global state library — overkill for this).

### 8. Update CLAUDE.md

Add new sections covering:

- Coinglass conventions (auth header difference, endpoint paths, response shapes you discovered)
- Collector lifecycle (backfill on first run, then incremental)
- History endpoint contract
- Window selector behavior — particularly the "use API for 90d, DB for longer" routing
- Updated composite formula (if you choose option A)

Keep the existing structure. Don't rewrite from scratch.

## Acceptance criteria

When you're done, all of these must be true:

1. `npm run typecheck` passes with zero errors.
2. `npm run dev` starts both servers; <http://localhost:5173> loads with a clean dashboard showing all signals — no blank tiles, no broken charts.
3. The source bar shows new entries for Coinglass endpoints. With a valid `COINGLASS_API_KEY` in `.env`, all show green.
4. With Coinglass key MISSING, the dashboard still loads; only the Coinglass-derived tiles show "—" and the source bar shows red entries with `key not configured`. CryptoQuant signals continue working.
5. `npm run collector` runs without errors, prints structured logs, and writes to `data/liquidity.db`. Verify with: `sqlite3 data/liquidity.db "SELECT metric, asset, COUNT(*) FROM timeseries GROUP BY metric, asset"`.
6. `npm run collector -- --backfill` populates ~90 days of data for each metric on first run.
7. `curl http://localhost:8787/api/history?metric=btcNetflow&asset=btc` returns valid JSON with a `points` array.
8. Switching the window selector to `6M` or `1Y` changes the charts. With only post-backfill data, longer windows correctly show "Archive depth: ~90 days. Showing what's available."
9. CLAUDE.md is updated. The "Quirks discovered" section now includes any new field-name or unit oddities you found in Coinglass responses.

## What NOT to do

- Don't add a new charting library. Use the existing Chart.js setup — add new chart components if needed, but don't reach for D3, ApexCharts, or anything else.
- Don't introduce global state management. Component props + a couple of `useState` hooks in App.tsx is sufficient.
- Don't restructure the existing file layout. Add files, don't move existing ones.
- Don't write tests in this round — the project doesn't have a test setup yet, and adding one is its own task. If you find yourself wanting to test a function, extract it to `src/lib/compute.ts` or a server equivalent so it's at least pure and would be testable later.
- Don't add `localStorage` usage. The frontend has no client-side persistence; the backend + SQLite is the source of truth.
- Don't change Cryptoquant query parameters from `window: 'day'` without understanding the consequences for the collector and history backfill.
- Don't make the dashboard refetch data on window change if 90D is selected — the data is already loaded.

## Quirks already discovered (do not re-discover)

These are documented in CLAUDE.md but worth restating since they bit us last session:

- CryptoQuant returns series **most-recent-first** (index 0 = today).
- BTC netflow returns `netflow_total` in **BTC**, not USD. Same for ETH (in ETH).
- SSR field is `stablecoin_supply_ratio`, not `ssr`.
- Reserve and MVRV values come back as **strings** — `parseFloat()` or you'll silently get NaNs.
- Stablecoin supply lives at `/v1/stablecoin/network-data/supply?token=usdt|usdc|all_token`. Field is `supply_total`. The `/v1/erc20/...` paths return 404.
- PowerShell on Windows has an **893-byte command length limit**. Long probe scripts must be saved to a `.ps1` file in `$env:TEMP` and executed, not inlined into a single command.

## Notes on Coinglass

- Coinglass tier limits matter. The Hobbyist plan ($29/mo) gives 80+ endpoints and 30 req/min. The endpoints listed in §1 are conservative — should fit easily within the rate limit even with the collector running every 15min.
- Coinglass response shapes are different from CryptoQuant's. Don't assume `result.data` — verify against actual responses. Probe a couple of endpoints first if you're unsure.
- Some Coinglass endpoints return data oldest-first (opposite of CryptoQuant). Check the timestamps on the first vs last array element and document which way each endpoint orders. Normalize to most-recent-first internally so the existing `lib/compute.ts` helpers work without changes.

## Validation strategy

Phase by phase, not all-at-once:

1. **Phase 1 — Coinglass adapter** working in isolation. Add an endpoint, fetch it via curl through the backend, verify data comes back.
2. **Phase 2 — Surface hidden signals.** Existing data, just plumbing. Verify visually.
3. **Phase 3 — Add new derivatives section.** Coinglass data flowing into the UI.
4. **Phase 4 — Collector.** Run it, check the DB has rows, run backfill.
5. **Phase 5 — History route + window selector.** Wire the long-range path end-to-end.
6. **Phase 6 — CLAUDE.md update + final typecheck.**

Don't merge phases. Each one ends with a working, runnable state. If phase 4 breaks the dashboard, stop and fix before moving to phase 5.
