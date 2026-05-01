# Cheddar Terminal — Multi-page Routing

## Goal

Evolve this single-page liquidity dashboard into a multi-page workstation called Cheddar Terminal. Three modules:

1. Altcoin monitor — existing, keep as-is
2. NGX banks valuation — stub for now
3. Crypto protocol valuation — stub for now

Add a Bloomberg-aesthetic homepage at `/`.

## Constraints

- **Do not restyle the existing altcoin monitor.** Just route to it. Visual unification is a later session.
- The editorial design tokens in `src/styles.css` are owned by the altcoin monitor. **Do not touch.**
- Bloomberg tokens for the new homepage and stub pages live **inline** in those component files. No global token additions.
- Preserve all existing CryptoQuant / Coinglass / SQLite logic exactly.

## Work items

### 1. `package.json`

- Rename `"name": "liquidity-monitor"` → `"cheddar-terminal"`
- Add to dependencies: `"react-router-dom": "^6.28.0"`

### 2. Move existing `src/App.tsx` → `src/pages/AltcoinMonitor.tsx`

- Rename the export from `App` to `AltcoinMonitor`
- Preserve every import, hook, state, JSX, comment verbatim — pure rename + relocate

### 3. Replace `src/App.tsx` with router root

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import AltcoinMonitor from "./pages/AltcoinMonitor";
import NgxBanks from "./pages/NgxBanks";
import CryptoValuation from "./pages/CryptoValuation";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/altcoin-monitor" element={<AltcoinMonitor />} />
        <Route path="/ngx-banks" element={<NgxBanks />} />
        <Route path="/crypto-valuation" element={<CryptoValuation />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### 4. Create `src/pages/Home.tsx` — Cheddar Terminal hub

**Aesthetic:** Bloomberg terminal. Dense, monospace, dark.

**Tokens** (inline, not in `styles.css`):

| Token | Value |
|---|---|
| bg | `#0a0a0a` |
| surface | `#141414` |
| surfaceHover | `#1a1a1a` |
| border | `#1f1f1f` |
| text | `#e8e8e8` |
| textMuted | `#888` |
| textDim | `#555` |
| amber | `#f5a623` |
| green | `#3FB950` |
| red | `#f04747` |

**Font:** `'JetBrains Mono', 'IBM Plex Mono', Menlo, Consolas, ui-monospace, monospace`

**Structure (top to bottom):**

#### a) Top bar
Amber background, black text, 11px, letter-spacing 0.08em.
- Left: `CHEDDAR TERMINAL | v0.1.0`
- Right: live date `FRI 01 MAY 2026` · live time `14:32:07 WAT` · `LAGOS`
- Clock updates every second.

#### b) Ticker
Auto-scrolling marquee, 90s linear infinite, items duplicated for seamless loop.

| Sym | Px | Ch% |
|---|---|---|
| BTC | 94287.15 | +1.24 |
| ETH | 3421.82 | +0.92 |
| SOL | 187.42 | -0.87 |
| TAO | 412.18 | +2.41 |
| NGX ASI | 203770.45 | +0.45 |
| NGX BNK10 | 1284.17 | +0.71 |
| USD/NGN | 1547.20 | +0.18 |
| BRENT | 78.42 | -0.34 |
| XAU | 2674.10 | +0.62 |
| DXY | 104.27 | -0.11 |
| ETHFI | 1.42 | +4.21 |
| DANGCEM | 482.50 | +1.05 |

Each pill: muted symbol, white tabular price, green/red ▲/▼ change.

#### c) Status row
10px, on surface bg, with bullet separators:
- Pulsing green dot + `MARKET LIVE`
- Session ID (random `S-XXXXXX` generated on mount)
- `3 MODULES ACTIVE` (green)
- `NGX OPEN` (green)
- `US EQUITIES PRE-OPEN` (amber)

#### d) Hero
Padding 32px 16px. `CHEDDAR TERMINAL` in 22px text, blinking 10×18 amber cursor next to it (530ms blink). Subtitle 12px muted: *"Private market workstation. On-chain liquidity, NGX equities, crypto valuation — one workspace, one keystroke away."*

#### e) Dashboard grid
Auto-fit `minmax(280px, 1fr)`, gap 12px. Three cards. Each card is a `react-router-dom` `<Link>`. Hover: border amber, `ENTER →` appears top-right (replacing `── ──`).

**Card 01 — LIQUIDITY · ALMR · `/altcoin-monitor` · live**
- Title: `ALTCOIN LIQUIDITY MONITOR`
- Blurb: `Composite Alt Flow Index across stablecoin supply, BTC dominance, exchange netflows and top-alt momentum.`
- Sources: `CRYPTOQUANT · DEFILLAMA · COINPAPRIKA`
- Headline: `+42.7` (green) / `FLOW INDEX`
- Metrics (2-col grid): `ALT FLOW +42.7` (green), `USDT 7D +2.1%` (green), `BTC.D 54.8%` (red), `SIGNAL ROTATING` (amber)

**Card 02 — EQUITIES · NGXB · `/ngx-banks` · stub** (show `· COMING SOON` in amber next to the code)
- Title: `NGX BANKS VALUATION`
- Blurb: `P/E, P/B, PEG and dividend yield across NGX banking with peer-discount scoring and live prices.`
- Sources: `NGX · CARDINALSTONE · COMPANY FILINGS`
- Headline: `8` (white) / `NAMES TRACKED`
- Metrics: `ACCESSCORP 2.6×` (green), `UBA 3.9×` (green), `ZENITH 4.1×` (green), `GTCO 4.4×` (green)

**Card 03 — CRYPTO · CPVF · `/crypto-valuation` · stub**
- Title: `PROTOCOL VALUATION`
- Blurb: `Revenue multiples, P/F and P/S benchmarks across DeFi sectors. Sector fair-value bands and live multiples.`
- Sources: `DEFILLAMA · TOKENTERMINAL · ON-CHAIN`
- Headline: `14.3×` (white) / `P/S MEDIAN`
- Metrics: `P/S MED 14.3×` (white), `P/F MED 22.7×` (white), `FAIR 10–30×` (amber), `SECTORS 7` (white)

**Sparkline per card:** 24-point SVG line, deterministic by card index. Use sin-based pseudo-random with seed = `idx + 1`. Color matches the card headline color.

#### f) Activity log
Surface bg, header `ACTIVITY LOG · LIVE` (amber), right side pulsing green `STREAMING` dot. Six rows (`time / amber code / message`):

```
14:31:42 · ALMR · USDT supply +$412M / 24h — dry powder forming
14:28:15 · NGXB · ACCESSCORP P/B drift: 0.42× → 0.43× on volume
14:24:03 · CPVF · DEX sector P/F median compressed to 19.4×
14:19:28 · ALMR · BTC.D crossed 55% → flow regime: NEUTRAL→ROTATING
14:11:07 · NGXB · GTCO Q1 EPS estimate revised +4.2%
14:02:51 · CPVF · Restaking sector added — 4 names, P/F 38.1× med
```

#### g) Bottom bar
10px, dim text, F-key labels in amber:
- `F1 HELP · F2 NAV · F3 EXPORT · ⌘K SEARCH · ESC HOME`
- Right: `BUILD 2026.05.01 · LAGOS · ● ONLINE` (green dot)

### 5. Create stub pages

`src/pages/NgxBanks.tsx` and `src/pages/CryptoValuation.tsx` — minimal stubs.

Same Bloomberg tokens. Reuse the top bar pattern from Home for visual consistency. Body: centered `MODULE NGXB · COMING SOON` (or `CPVF`), one-paragraph blurb of what's planned, and `← BACK TO TERMINAL` Link to `/`.

### 6. `server/index.ts` — SPA fallback

Add SPA fallback for client-side routing in production:

- API routes (`/api/*`) must keep working untouched
- Static assets (anything with a file extension under `dist/web`) served normally
- Anything else → serve `dist/web/index.html` so React Router takes over on the client

Hono pattern: keep existing API mounts first, then static, then a catch-all GET that reads `dist/web/index.html` and returns it as HTML. In dev this is irrelevant (Vite handles it); only matters for `npm start` in prod.

### 7. `src/main.tsx`

Likely no changes needed. Verify it just imports `App` and mounts. If it does anything extra, leave it alone.

## Verify

```bash
npm install
npm run typecheck       # zero errors
npm run dev             # visit http://localhost:5173
```

Check:
- `/` renders the Bloomberg homepage with live clock + scrolling ticker
- Clicking the ALMR card → `/altcoin-monitor` renders the existing dashboard intact
- `/ngx-banks` and `/crypto-valuation` render stubs with working back link

```bash
npm run build           # completes without errors
```

## Commit

```bash
git add -A
git commit -m "feat: multi-page routing + Cheddar Terminal homepage

- Add react-router-dom with 4 routes
- Move altcoin monitor to /altcoin-monitor (unchanged)
- New Bloomberg-aesthetic homepage at /
- Stub pages for NGX banks and crypto valuation
- SPA fallback in Hono for production routing"
git push
```

## Do not

- Touch `src/styles.css`
- Modify any altcoin monitor logic
- Restyle the altcoin monitor (separate session)
- Add any `localStorage` anywhere
- Bypass the SPA fallback rule (API routes stay `/api/*`-only)
