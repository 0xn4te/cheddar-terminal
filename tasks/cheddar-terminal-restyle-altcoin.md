# Cheddar Terminal — Restyle Altcoin Monitor (Bloomberg)

## Goal

Convert the altcoin monitor at `/altcoin-monitor` from its current editorial style (cream on near-black, Instrument Serif italic) to match the Bloomberg aesthetic of the Cheddar Terminal homepage (dark on dark, JetBrains Mono everywhere, amber accents). All data fetching, all logic, and the entire component file structure stay exactly as-is. This is a pure aesthetic pass.

Also: wrap the altcoin monitor in the shared `_TerminalShell` so it gets the same top bar and bottom F-key chrome as the stub pages, plus a back-to-terminal link.

## Constraints

- **Do not change any data logic.** No edits to `src/lib/api.ts`, `src/lib/history.ts`, `src/lib/compute.ts`, anything in `server/`, or any data-fetching effect inside components. The numbers, fetches, calculations all stay.
- **Do not change component file structure.** Same files, same exports, same prop shapes. Only their visual output changes.
- **The Cheddar Terminal homepage at `/` must look identical after this work** — its tokens are inline so global token changes shouldn't affect it, but verify.
- Drop Instrument Serif entirely. Bloomberg is monospace top to bottom.
- Drop italic styling on headings. Use uppercase + letter-spacing instead.
- Keep semantic colors: red for negative/bearish values, green for positive/bullish, amber for warnings/neutral. The "−17 Defensive" hero stays red because the score is genuinely negative.

## Token mapping

Update `src/styles.css` `:root` tokens. Old → new:

| Token (purpose) | Old (editorial) | New (Bloomberg) |
|---|---|---|
| Background | cream / near-black | `#0a0a0a` |
| Surface | beige tile | `#141414` |
| Surface hover | (n/a) | `#1a1a1a` |
| Border | cream-tan | `#1f1f1f` |
| Border strong | — | `#2a2a2a` |
| Text primary | cream | `#e8e8e8` |
| Text muted | tan | `#888` |
| Text dim | — | `#555` |
| Accent | (whatever it was) | amber `#f5a623` |
| Positive | green | `#3FB950` |
| Negative | red | `#f04747` |
| Font heading | Instrument Serif | `'JetBrains Mono', 'IBM Plex Mono', Menlo, Consolas, ui-monospace, monospace` |
| Font body | (sans) | same as heading — mono everywhere |
| Font numbers | JetBrains Mono | unchanged |

Keep the existing token *names* in CSS (e.g. `--color-bg`, `--color-text`, etc.) — change their *values* only. That way components that reference tokens by name don't need editing.

## Files likely to need attention

1. **`src/styles.css`** — primary token swap. Body bg, font-family stack, heading rules, any italic rules → unstyle.
2. **`src/lib/chartSetup.ts`** — `COLORS` and `defaultChartOptions()`. Update Chart.js axis text color, grid line color, background. Keep red/green bar colors. Update the line color used for hero netflow chart to amber `#f5a623` so it pops on dark.
3. **`src/pages/AltcoinMonitor.tsx`** — wrap return JSX in `_TerminalShell` (the same wrapper the stub pages use). Add a sub-header inside the shell: amber `MODULE ALMR · ALTCOIN LIQUIDITY MONITOR` on the left, `← BACK TO TERMINAL` Link on the right. The existing dashboard content sits below the sub-header.
4. **`src/components/HeroScore.tsx`** — heading was probably "Alt Flow Monitor — a daily reading of on-chain liquidity" in serif italic. Replace with mono uppercase: heading `ALT FLOW INDEX` (already that label exists in the column), and the page title becomes the sub-header from #3 above. The big number and color logic stay.
5. **`src/components/Tile.tsx`** — recolor borders + label/value typography. Should mostly inherit from token changes, but check for hardcoded hex.
6. **`src/components/WindowSelector.tsx`** — pill control. Active state: amber bg, black text. Inactive: transparent bg, dim text, hover surface. Border `#1f1f1f`.
7. **`src/components/SourceBar.tsx`** — small recolor. Green dot for live source, red dot for failed. Text muted.
8. **`src/components/HeroChart.tsx`, `NetflowChart.tsx`, `ReserveChart.tsx`, `IndicatorsChart.tsx`, `RatioChart.tsx`, `FundingRateChart.tsx`** — these import from `chartSetup.ts`. Most colors should auto-update if `chartSetup` is correct. Spot-check each chart on dev: axis labels readable, grid lines subtle but visible, line/bar colors match new palette.

If any component has hardcoded hex values instead of CSS tokens, change them to tokens (`var(--color-...)`) so future shifts are one-file.

## Specific visual decisions

- **Page top chrome**: identical to homepage — amber strip with `CHEDDAR TERMINAL | v0.1.0` left, live date/time/location right.
- **Sub-header band** (under the amber strip, above the dashboard):
  - Surface bg `#141414`, 1px bottom border `#1f1f1f`
  - Left: `MODULE ALMR` (amber, 11px, letter-spaced) · `ALTCOIN LIQUIDITY MONITOR` (white, 13px, letter-spaced)
  - Right: `← BACK TO TERMINAL` (muted, hover amber, 11px)
  - Padding 12px 16px
- **Hero column** (left side with `-17 Defensive`):
  - Label `ALT FLOW INDEX` — 9px, amber, letter-spacing 0.18em
  - Big number — 64px, tabular-nums, color follows score sign (negative red, positive green, near-zero white)
  - Mood word — uppercase, 11px, dim
  - Composition table below — labels muted, percentages dim, values white/red/green by sign
- **Hero chart** (the big BTC netflow chart on the right):
  - Background transparent (lets dark page show through)
  - Line stroke amber `#f5a623`
  - Area fill amber 12% opacity
  - Zero line `#444`
  - Axis labels `#666`, 10px JetBrains Mono
  - Grid lines `rgba(255,255,255,0.04)` — barely there
- **Tiles** (the grid of metric tiles below):
  - Bg `#141414`, border `1px solid #1f1f1f`, no border-radius (Bloomberg is boxy)
  - Label uppercase muted 9px letter-spaced
  - Value 22px tabular mono, color by sign
  - Subtitle 10px dim
- **Bar charts** (BTC/ETH netflow 90D):
  - Background transparent
  - Bars red `#f04747` for inflow, green `#3FB950` for outflow (sign convention preserved)
  - Same axis/grid colors as hero chart
- **Window selector pill**: dark surface, amber for active state, dim for inactive, hover lifts to surfaceHover. No rounded pill — straight rectangles to match the Bloomberg boxiness, OR keep small radius if it really helps readability. Use judgment.
- **Footer / source bar**: same style as homepage bottom bar — F-key shortcuts in amber, build info muted, online dot green.

## Verify

```bash
npm run typecheck       # zero errors
npm run dev
```

Then in the browser at `http://localhost:5173/`:

1. Homepage at `/` looks unchanged (amber bar, dark cards, etc.)
2. Click ALMR card → `/altcoin-monitor` now loads in Bloomberg colors:
   - Same amber top bar as homepage
   - Sub-header with module code + back link
   - Big `-17` hero in red, "DEFENSIVE" label dim
   - Composition rows readable
   - Hero chart amber line on dark background, subtle grid
   - Tile grid below — no cream surfaces, all dark
   - Bar charts at the bottom — green/red bars on dark
3. `← BACK TO TERMINAL` returns to `/`
4. Window selector still functional (90D / 6M / 1Y / ALL) — clicking each refetches and rerenders with new theme
5. `/ngx-banks` and `/crypto-valuation` stubs still look right (they were already Bloomberg)

```bash
npm run build           # completes without errors
```

## Commit

```bash
git add -A
git commit -m "feat: restyle altcoin monitor to Bloomberg aesthetic

- Swap editorial tokens (cream/serif) for dark/mono in styles.css
- Update chartSetup.ts COLORS + defaultChartOptions for dark theme
- Wrap AltcoinMonitor in _TerminalShell with module sub-header + back link
- Drop Instrument Serif; mono everywhere
- Charts: amber lines, red/green bars, subtle grid on dark
- All data fetching and component logic preserved verbatim"
git push
```

## Do not

- Modify any data-fetching effects, API calls, or compute functions
- Change Alt Flow Index weights, divisors, or composition logic
- Touch the SQLite collector or `server/` files (no styling there)
- Add new dependencies (everything needed is already installed)
- Add `localStorage` anywhere
- Change any token names — only their values
- Restyle the homepage (its tokens are inline, leave them)
