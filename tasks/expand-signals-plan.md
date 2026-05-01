# Plan: Expand signals + collector + history route

Plan written 2026-05-01 against the actual repo state. **Stop here for approval before any code changes.**

## Discrepancies between the task brief and the actual repo (please confirm before I proceed)

These are not show-stoppers, but they change a few of the steps the brief implies are simple plumbing.

1. **§2 "Surface existing-but-hidden signals" is not accurate.** The brief says `btcWhaleRatio`, `btcMinerNet`, `usdtNetflow`, `usdcNetflow` are "already fetched in `server/routes/dashboard.ts` but not rendered". They are not — `dashboard.ts` currently only fetches `btcNetflow`, `ethNetflow`, `stableUsdtSupply`, `stableUsdcSupply`, `btcReserve`, `ssr`, `mvrv`. I'll add the fetches AND the rendering as part of phase 2. Treat phase 2 as "add four CQ endpoints and surface them," not "wire UI to existing data."
2. **DB schema in the brief doesn't match the code.** The brief refers to "`(metric, asset, ts)` already defined" but `server/db.ts` actually defines `timeseries(source TEXT, bucket_date TEXT, value REAL, payload TEXT, PRIMARY KEY(source, bucket_date))`. There is no `metric`, `asset`, or `ts` column. I'll migrate to `(metric, asset, ts, value, payload)` (see §B below) since `(metric, asset, ts)` is the right shape for multi-asset metrics like funding-rate-btc vs funding-rate-eth.
3. **DB driver is `node:sqlite` (Node 22+ built-in), not `better-sqlite3`.** CLAUDE.md mentions `better-sqlite3`; the code uses `DatabaseSync` from `node:sqlite`. I'll keep `node:sqlite` (it's working, and avoids MSVC native-build pain on Windows) and update CLAUDE.md as a small drive-by fix in the final phase.
4. **`/api/health` will need to start reporting Coinglass key presence too** — small update, not called out in the brief but obvious. I'll do it.

If any of these are wrong, tell me and I'll adjust before starting.

---

## A. File-by-file change list

### Created

| Path | Why |
| --- | --- |
| `server/coinglass.ts` | Mirror of `server/cryptoquant.ts`. Bearer-style header `CG-API-KEY`, 5-min in-memory cache, `cgFetchMany`, `hasCoinglassKey()`. |
| `server/routes/history.ts` | `GET /api/history?metric=&asset=&since=&until=`. Whitelisted metric enum, returns `{metric, asset, points: [{ts, value}, ...]}`. |
| `src/components/FundingRateChart.tsx` | Line chart with above/below-zero shading. Used for BTC + ETH funding-rate series. |
| `src/components/RatioChart.tsx` | Small sparkline for BTC whale ratio + BTC long/short ratio (both 0–1ish ratios over time). |
| `src/components/WindowSelector.tsx` | Header pill control: `90D` (default) / `6M` / `1Y` / `ALL`. |
| `src/lib/history.ts` | Frontend wrapper for `/api/history`. Returns the same `{labels, values}` shape `timelineFor` produces, so chart components can be window-agnostic. |

### Modified

| Path | Why |
| --- | --- |
| `server/types.ts` | Extend `DashboardData` (see §C). Add `HistoryPoint`, `HistoryResponse`, expand `HealthResponse` with `hasCoinglassKey`. |
| `server/routes/dashboard.ts` | Add 4 CQ specs (whale ratio, miner netflow, USDT netflow, USDC netflow) + 5 Coinglass specs (BTC funding, ETH funding, BTC long/short, BTC OI, ETH OI). Bundle Coinglass results into the same `sources` map so the source bar shows them with red when key is missing. |
| `server/routes/health.ts` | Report `hasCoinglassKey`. |
| `server/index.ts` | Mount `/api/history`. Add startup warning for missing `COINGLASS_API_KEY`. |
| `server/db.ts` | Migrate `timeseries` to `(metric TEXT, asset TEXT, ts INTEGER, value REAL, payload TEXT, PRIMARY KEY(metric, asset, ts))`. New helpers: `upsertPoints(metric, asset, rows)`, `queryRange(metric, asset, since, until)`, `metricDepth(metric, asset)` (oldest ts, useful for the "Archive depth: X days" UI hint). See §B for migration handling. |
| `server/collector.ts` | Full rewrite from stub: `TASKS` array covers every dashboard metric. CQ + Coinglass. `--backfill` flag fetches 90d. Skips Coinglass tasks gracefully if key missing. Structured logs. |
| `src/App.tsx` | Add window-selector state. Pass to chart components. New "Stablecoin flows" and "Derivatives sentiment" sections. New tiles. Update methodology paragraph (option A — see §E). |
| `src/lib/compute.ts` | Add `FUNDING_RATE_KEYS`, `LONG_SHORT_KEYS`, `OI_KEYS`, `WHALE_RATIO_KEYS`, `MINER_NETFLOW_KEYS` fallback arrays. Extend `AltFlowInputs` and `computeAltFlowIndex` for the new funding-rate component. |
| `src/lib/api.ts` | Re-export new types. Keep `dataOf` unchanged. |
| `src/components/SourceBar.tsx` | No code change expected; it iterates `data.sources` already. Verify it handles longer source lists gracefully (wrapping). |
| `.env.example` | Add `COINGLASS_API_KEY` with a one-line comment about Hobbyist tier. |
| `CLAUDE.md` | Add Coinglass conventions, collector lifecycle, history-endpoint contract, window-selector routing rule, updated composite formula. Drive-by: correct the `better-sqlite3` mention to `node:sqlite`. |
| `README.md` | Add a paragraph on running the collector (`npm run collector`, `npm run collector -- --backfill`), and one on the window selector. |
| `package.json` | No new deps unless probing reveals a Coinglass SDK is preferable (it's not — plain `fetch` is fine). I'll keep this empty unless something forces my hand. |

### Untouched

- `src/components/HeroChart.tsx`, `HeroScore.tsx`, `NetflowChart.tsx`, `ReserveChart.tsx`, `IndicatorsChart.tsx`, `Tile.tsx` — reused as-is.
- `src/styles.css` — only touch if Derivatives section needs a new section style; otherwise reuse `.grid` / `.tiles` / `.methodology` patterns. **Will not introduce border-radius or new colors.** If a new tone (e.g. for funding above/below zero shading) is genuinely needed, I'll add it as a new `--accent-funding` token, not inline hex.
- `verify-index.mjs` — leave alone. I'll write throwaway probe scripts in `$env:TEMP` per CLAUDE.md.

---

## B. Database schema

**Current** (`server/db.ts`):

```sql
CREATE TABLE timeseries (
  source TEXT NOT NULL,
  bucket_date TEXT NOT NULL,
  value REAL,
  payload TEXT,
  PRIMARY KEY (source, bucket_date)
);
```

**Proposed**:

```sql
CREATE TABLE timeseries_v2 (
  metric TEXT NOT NULL,            -- e.g. 'netflow', 'funding_rate', 'whale_ratio', 'reserve'
  asset TEXT NOT NULL,             -- e.g. 'btc', 'eth', 'usdt', 'usdc', 'all'
  ts INTEGER NOT NULL,             -- ms-precision unix timestamp (UTC midnight for daily metrics)
  value REAL,
  payload TEXT,
  PRIMARY KEY (metric, asset, ts)
);
CREATE INDEX IF NOT EXISTS idx_ts_metric_asset ON timeseries_v2(metric, asset, ts);
```

**Migration strategy**: There's no production data here yet, but to be safe I'll keep the old `timeseries` table around (untouched) and add `timeseries_v2` alongside it. The new collector and history route only read/write `v2`. After a release where everything works, we can drop the old table — that's a separate task. This avoids any `DROP TABLE` risk on a user with existing data.

**Why `ts INTEGER` (ms unix) instead of `bucket_date TEXT`?** Because Coinglass returns ms timestamps natively, and CryptoQuant returns YYYY-MM-DD strings — normalizing to ms means the history route doesn't need per-source date-parsing. CQ daily values get stored at UTC midnight ms.

**Metric/asset taxonomy** (will be exported from `server/types.ts` as a `const` and reused in the history route's whitelist):

| metric | asset | source |
| --- | --- | --- |
| `netflow` | `btc`, `eth`, `usdt`, `usdc`, `miner_btc` | CQ |
| `reserve` | `btc` | CQ |
| `ssr` | `btc` | CQ |
| `mvrv` | `btc` | CQ |
| `stable_supply` | `usdt`, `usdc` | CQ |
| `whale_ratio` | `btc` | CQ |
| `funding_rate` | `btc`, `eth` | Coinglass |
| `long_short_ratio` | `btc` | Coinglass |
| `open_interest` | `btc`, `eth` | Coinglass |

`miner_btc` as an asset under `netflow` is a slight abuse but keeps the schema flat. Alternative is a separate metric `miner_netflow` — I'll use that instead, cleaner: `metric=miner_netflow, asset=btc`. Updated table above mentally.

---

## C. `DashboardData` shape — diff vs current

**Current**:

```ts
export interface DashboardData {
  generatedAt: string;
  flows: { btcNetflow, ethNetflow, stableUsdtSupply, stableUsdcSupply };
  stocks: { btcReserve };
  indicators: { ssr, mvrv };
  sources: Record<string, SourceStatus>;
}
```

**Proposed**:

```ts
export interface DashboardData {
  generatedAt: string;
  flows: {
    btcNetflow: SourceResult;
    ethNetflow: SourceResult;
    usdtNetflow: SourceResult;        // NEW (CQ)
    usdcNetflow: SourceResult;        // NEW (CQ)
    stableUsdtSupply: SourceResult;
    stableUsdcSupply: SourceResult;
    btcMinerNetflow: SourceResult;    // NEW (CQ) — renamed from "btcMinerNet" in brief for consistency
  };
  stocks: {
    btcReserve: SourceResult;
    btcOpenInterest: SourceResult;    // NEW (Coinglass)
    ethOpenInterest: SourceResult;    // NEW (Coinglass)
  };
  indicators: {
    ssr: SourceResult;
    mvrv: SourceResult;
    btcWhaleRatio: SourceResult;      // NEW (CQ)
  };
  derivatives: {                      // NEW group
    btcFundingRate: SourceResult;     // NEW (Coinglass)
    ethFundingRate: SourceResult;     // NEW (Coinglass)
    btcLongShortRatio: SourceResult;  // NEW (Coinglass)
  };
  sources: Record<string, SourceStatus>;
}
```

`sources` keys mirror the field names exactly so SourceBar shows one entry per metric. Coinglass entries with a missing key surface as red `"key not configured"` per acceptance criterion #4.

`HistoryResponse` (new):
```ts
export interface HistoryPoint { ts: number; value: number; }
export interface HistoryResponse {
  metric: string;
  asset: string;
  points: HistoryPoint[];   // oldest-first; the inverse of CQ ordering, because chart code is left-to-right
  archiveDepthDays: number; // (now - oldest_ts) / day, rounded. Frontend uses this for the "Archive depth: X days" hint.
}
```

---

## D. Endpoints to add

### CryptoQuant (4 new — to support §2 of the brief)

These need verification via `/v1/discovery/endpoints?format=json` — I'll run a probe in phase 2 before committing the spec. **Treat the paths below as my best guess from CLAUDE.md context; I'll correct after probing.**

| Field | Path | Params (best guess) | Notes |
| --- | --- | --- | --- |
| `btcWhaleRatio` | `/btc/exchange-flows/exchange-whale-ratio` | `window=day, exchange=all_exchange, limit=90` | 0–1 ratio. May be Premium-tier; if so, source bar will show red and we move on. |
| `btcMinerNetflow` | `/btc/miner-flows/netflow` | `window=day, miner=all_miner, limit=90` | Coin units. |
| `usdtNetflow` | `/stablecoin/exchange-flows/netflow` | `window=day, exchange=all_exchange, token=usdt_eth, limit=90` | Per CLAUDE.md, stablecoin paths live under `/stablecoin/`. Will probe to confirm. |
| `usdcNetflow` | `/stablecoin/exchange-flows/netflow` | `window=day, exchange=all_exchange, token=usdc, limit=90` | Same as above. |

If any of these 404 or return Premium-only on Pro tier, I'll log the failure as a `sources` red entry, leave the tile rendering "—", and document the gap in CLAUDE.md. Won't break the dashboard.

### Coinglass (5 new)

Coinglass v4 base URL: `https://open-api.coinglass.com/api`. Auth header: `CG-API-KEY: <key>`. Will probe each endpoint shape before wiring — Coinglass response envelopes vary by endpoint family per the brief.

| Field | Path (best guess) | Params | Notes |
| --- | --- | --- | --- |
| `btcFundingRate` | `/futures/funding-rate/oi-weight-history` | `symbol=BTC, interval=1d, limit=90` | OI-weighted aggregated funding. |
| `ethFundingRate` | `/futures/funding-rate/oi-weight-history` | `symbol=ETH, interval=1d, limit=90` | |
| `btcLongShortRatio` | `/futures/top-long-short-position-ratio/history` | `symbol=BTC, interval=1d, limit=90, exchange=Binance` | Top traders only (per brief). |
| `btcOpenInterest` | `/futures/open-interest/aggregated-history` | `symbol=BTC, interval=1d, limit=90` | Aggregated across exchanges. |
| `ethOpenInterest` | `/futures/open-interest/aggregated-history` | `symbol=ETH, interval=1d, limit=90` | |

Coinglass is documented at `docs.coinglass.com/reference` — I won't fetch that page (per the rule about not generating URLs); I'll probe the endpoints themselves and adjust paths/params if the first guesses 404.

**Ordering**: per the brief, some Coinglass endpoints return oldest-first. After fetching, I'll inspect first vs last timestamp and reverse if necessary so internal storage is **most-recent-first** (matching CQ). This means existing `compute.ts` helpers work unchanged.

---

## E. Composite Alt Flow Index — funding rate proposal

**Recommendation: Option A (add as 5th component, reweight others proportionally).**

**Rationale**:

- Funding rate is genuinely orthogonal to the four existing inputs. The current composite is 100% on-chain flow; adding a derivatives-sentiment input meaningfully broadens what the score captures. Without it, the index can be screaming "risk-on" while perp markets are euphoric and a leverage flush is imminent — a known failure mode of pure-flow indices in 2021.
- Score historical comparability is already weak — we're calibrating against 90 days of data with no formal backtest. Breaking the comparability is cheap. I'll note explicitly in CLAUDE.md and the methodology paragraph that the formula changed on 2026-05-01 and old values aren't directly comparable.
- A separate read-out (Option B) is what the dashboard *already* does for SSR posture before it was folded into the index. The lesson from that build was that users don't synthesize a separate read-out into the headline number — that's the index's job.

**Proposed weights**:

| Component | Old | New | Reason for the new weight |
| --- | --- | --- | --- |
| Stablecoin supply 7d expansion | 40% | 35% | Still the heaviest single input; small trim to make room. |
| BTC exchange netflow 7d sum | 25% | 22% | Modest trim. |
| ETH exchange netflow 7d sum | 15% | 13% | Modest trim. |
| SSR posture vs 30d mean | 20% | 15% | Largest trim — SSR is partially redundant with the funding signal as a "sentiment temperature" reading. |
| **Funding rate posture** | — | **15%** | New. |

Funding-rate component: Use 14-day mean of OI-weighted aggregated funding rate (BTC + ETH equally weighted). Saturation reference: ±0.0003 daily (~0.03% per 8h funding period, roughly the threshold above which funding is meaningfully crowded). Sign inverted: high funding → bearish for risk-on positioning → negative score contribution.

Math:
```
fundingPosture14d = mean of last 14 days of (btcFunding + ethFunding) / 2
fundingScore = clamp(tanh100(-fundingPosture14d / 0.0003), -100, 100)
```

I'll update `App.tsx::DashboardView`'s methodology `<ul>` to match.

---

## F. Frontend window selector behavior

- State lives in `App.tsx`: `const [window, setWindow] = useState<'90d' | '6m' | '1y' | 'all'>('90d')`.
- Pill buttons rendered in the masthead, right side. Existing refresh affordance (none right now — there's an interval-based refetch) stays.
- For `90d`: chart components receive `CQDataPoint[] | null` from `data.flows.*` as today. **No refetch on window change** (per "what NOT to do" #7).
- For `>90d`: chart components additionally accept a `historyOverride?: HistoryResponse` prop. When `window !== '90d'`, App.tsx fires N `/api/history` calls in parallel via `Promise.all` and passes the responses to the matching charts. Tiles continue to use the dashboard endpoint's most-recent values.
- "Archive depth" hint: when `historyOverride.archiveDepthDays` is less than the requested window in days, render a small `<span class="chart__hint">` below the chart title: "Archive depth: 23 days. Showing what's available." Don't show this for `90d` (always satisfied by the direct API).
- No localStorage. The selection resets to `90d` on reload — fine, that's the dashboard's "open it and read today" mode.

---

## G. Risk areas / open questions

1. **Coinglass endpoint path guesses are uncertain.** I'll probe with a temp `.ps1` script per CLAUDE.md (893-byte limit). If the first set 404s, I'll fall back to `/futures/fundingRate/...` camelCase variants. Worst case: any Coinglass endpoint that fails just means a red source bar entry — won't block phase completion.
2. **Whale ratio + miner netflow may be Premium-tier only.** Same fallback: red source entry, "—" tile, documented gap.
3. **Backfill rate-limit risk.** 90-day backfill across 14 metrics = 14 requests, well inside budget. But if I miscount a Coinglass endpoint as daily when it's actually 4-hourly, I might pull 90×6 = 540 points and trigger the 30 req/min ceiling. I'll throttle the backfill to one request per ~2.5s to be safe.
4. **Database migration.** New table alongside old. Risk: collector silently writes only to v2 while a future feature still reads from old `timeseries`. There are no readers of the old table today (it's only written). I'll grep for any reads in the code and fail the plan if any exist; phase 4 work will not proceed until that's confirmed.
5. **Reweighting the composite.** Once shipped, the score on-screen jumps even if no underlying conditions change. I'll add a one-line note under the methodology heading: "Formula updated 2026-05-01 — see CLAUDE.md for prior weights."
6. **Funding rate sign convention.** Coinglass returns funding as decimal (0.0001 = 0.01% per period). Period convention varies by endpoint — daily aggregated history may already be summed across the day. I'll inspect a sample response and document. If it's per-period, I'll multiply by 3 to get daily before comparing to the 0.0003 saturation reference.
7. **Source bar wrapping.** Going from 7 to 16 sources may overflow horizontally. Will eyeball in phase 5; if it wraps poorly, add `flex-wrap: wrap` to its container in `styles.css`.

---

## H. Validation plan, phase by phase

Each phase ends in a runnable, working state. **If a phase breaks the dashboard, I stop and fix before proceeding.**

| Phase | What | How I verify |
| --- | --- | --- |
| 1 — Coinglass adapter | `server/coinglass.ts`, env, health, startup warning. Probe endpoints with a temp `.ps1`. | `curl http://localhost:8787/api/health` shows `hasCoinglassKey`. Manual fetch through a temp test route confirms data returns. Then remove the test route. |
| 2 — Surface hidden signals | Add 4 CQ specs to dashboard route, render tiles + small charts. | Visual: 4 new tiles + new "Stablecoin flows" section. `npm run typecheck` clean. Source bar shows green for the 4 new entries (assuming Pro tier supports them). |
| 3 — Derivatives section | Add 5 Coinglass specs to dashboard route, render section. | Visual: new "Derivatives sentiment" section after stablecoin flows. With key set: green sources. With key unset: red sources, tiles show "—", dashboard still loads. |
| 4 — Collector | Schema migration, full rewrite, backfill flag. | `npm run collector -- --backfill` runs without errors. `sqlite3 data/liquidity.db "SELECT metric, asset, COUNT(*) FROM timeseries_v2 GROUP BY metric, asset"` shows ~90 rows for each metric with a working endpoint. Run `npm run collector` (no flag) and confirm a single tick logs structured per-task results. |
| 5 — History route + window selector | `server/routes/history.ts`, frontend wiring. | `curl 'http://localhost:8787/api/history?metric=netflow&asset=btc'` returns valid JSON with `points` and `archiveDepthDays`. UI: switching to `6M` triggers refetch; charts show the longer window with the "Archive depth" hint. Switching back to `90D` is instant (no refetch). |
| 6 — CLAUDE.md + final typecheck | Documentation update. | `npm run typecheck` passes. Spot-check `npm run dev` once more — golden path through all sections. |

---

## I. Stop point

That's the plan. Awaiting approval before phase 1.

If you accept it as-is, I'll proceed top-to-bottom. If you want changes — especially on (a) the Option-A composite reweighting, (b) the migration approach on `timeseries`, or (c) any of the four discrepancies at the top — flag them and I'll revise this file before starting.
