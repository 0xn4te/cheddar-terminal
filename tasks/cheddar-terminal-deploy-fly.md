# Cheddar Terminal — Deploy to Fly.io

## Goal

Deploy the running Cheddar Terminal app (Vite frontend + Hono backend + SQLite) to Fly.io, in the Johannesburg region (closest to Lagos). Result: a working `https://cheddar-terminal.fly.dev` URL with the dashboard live, API working, and SQLite persistence configured. Custom domain (cheddarterminal.xyz) gets pointed at it in a separate session.

## Constraints

- Windows host (PowerShell, not bash). All installs and commands must work on Windows.
- Don't compile TypeScript to JS in the Docker image — the project already runs via `tsx` in production. Keep that pattern. Just make sure `tsx` is available in the runtime image (move it from devDependencies to dependencies, or `npm ci` without `--omit=dev`).
- The `--env-file=.env` flag in `npm start` MUST be removed for production. Fly injects secrets as plain env vars, no .env file in the container. Update the script to a production-safe form.
- SQLite database file (`data/liquidity.db`) needs to live on a Fly Volume mounted at the data dir, so it survives deploys and restarts.
- Don't deploy the collector process yet. v1 runs frontend + API only. The dashboard's 90D window works fine without the collector. Longer windows will show "archive empty, run collector" messages, which is fine for now. We add the collector in a later session.
- Don't break local dev — `npm run dev` must still work after these changes.

## Prerequisites (assumed already done by user)

- Fly.io account created
- Payment method added with $5 trial credit visible
- GitHub already authenticated with Fly

## Work items

### 1. Install flyctl (Windows)

In PowerShell:

```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

After install, the script tells you to add a path to the PATH env var. Either add it to PATH for current shell only (`$env:Path += ";C:\Users\Nate\.fly\bin"`) or restart the terminal so the change picks up. Verify:

```powershell
fly version
```

Should print a version string.

### 2. Authenticate

```powershell
fly auth login
```

This opens a browser. **PAUSE HERE** — user clicks "Sign in with GitHub" in the browser, approves, comes back. CLI prints "successfully logged in." Don't proceed until that confirmation appears.

### 3. Create the Fly app (without deploying)

```powershell
fly apps create cheddar-terminal --org personal
```

If "cheddar-terminal" is taken globally on Fly, fall back to `cheddar-terminal-ng` or similar — pick one that's free and update `app =` in fly.toml below.

### 4. Write `fly.toml`

Create `fly.toml` at project root:

```toml
app = "cheddar-terminal"
primary_region = "jnb"

[build]

[env]
  NODE_ENV = "production"
  PORT = "8787"
  DB_PATH = "/app/data/liquidity.db"

[http_service]
  internal_port = 8787
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"

[[mounts]]
  source = "cheddar_data"
  destination = "/app/data"
```

Notes:
- `primary_region = "jnb"` — Johannesburg. If `fly platform regions` shows JNB unavailable, fall back to `cdg` (Paris).
- 512MB memory chosen because Chart.js + Vite build can spike. Drop to 256MB later if it's stable.
- `auto_stop_machines = "stop"` keeps cost down — machine sleeps after 5 min of no traffic, wakes on next request (~3-5s cold start). Acceptable for a personal tool.
- `DB_PATH` env var moves the SQLite file path out of code and into config, so we can point local at `data/liquidity.db` and prod at `/app/data/liquidity.db`. **Update `server/db.ts` to read `process.env.DB_PATH || "data/liquidity.db"` for the file path.** Verify this change doesn't break local dev.

### 5. Write `Dockerfile`

Create `Dockerfile` at project root:

```dockerfile
FROM node:22-slim AS base
WORKDIR /app

# Install all deps (we need tsx + chart.js + recharts at runtime)
COPY package*.json ./
RUN npm ci

# Copy source and build the frontend
COPY . .
RUN npm run build

# Ensure data dir exists (volume will mount over it)
RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 8787

CMD ["npx", "tsx", "server/index.ts"]
```

### 6. Write `.dockerignore`

Create `.dockerignore` at project root:

```
node_modules
.git
.env
.env.*
dist
data
*.log
.DS_Store
.vscode
.idea
```

### 7. Update `package.json` `start` script

Change from:

```json
"start": "cross-env NODE_ENV=production tsx --env-file=.env server/index.ts"
```

To:

```json
"start": "cross-env NODE_ENV=production tsx server/index.ts",
"start:local": "cross-env NODE_ENV=production tsx --env-file=.env server/index.ts"
```

The new `start` is what runs in Docker (Fly injects env vars natively). `start:local` preserves the current behavior for testing prod mode locally.

### 8. Move `tsx` to dependencies

Currently in devDependencies. In production Docker we need it. Move it to dependencies in package.json. Also move anything else the production server actually imports at runtime (`cross-env` can stay in dev — it's only used for the start scripts which work without it on Linux). On Linux the `cross-env NODE_ENV=production` part will work because cross-env handles the syntax difference; on Linux you could equivalently write `NODE_ENV=production tsx server/index.ts`. But cross-env in dev is fine — leave it, just make sure tsx is in production deps.

Run `npm install` to update package-lock.json.

### 9. Update `server/db.ts` to use DB_PATH env var

Find where the SQLite file path is hardcoded as `data/liquidity.db` (or similar). Wrap it:

```ts
const DB_PATH = process.env.DB_PATH || "data/liquidity.db";
```

Use `DB_PATH` everywhere the path is referenced. Verify local dev still works (`npm run dev` and check the dashboard loads data).

### 10. Create the SQLite volume on Fly

```powershell
fly volumes create cheddar_data --region jnb --size 1
```

Confirm with "y". Volume name MUST match `[[mounts]] source` in fly.toml.

### 11. Set Fly secrets (API keys)

Read `.env` to get `CRYPTOQUANT_API_KEY` and `COINGLASS_API_KEY` values. Don't print them to terminal output. Use them inline in the fly secrets command:

```powershell
fly secrets set CRYPTOQUANT_API_KEY=<value> COINGLASS_API_KEY=<value>
```

If reading the .env file is awkward / risky, **PAUSE HERE** and ask the user to run the command themselves with their keys filled in. They can copy from `.env`.

### 12. First deploy

```powershell
fly deploy
```

This will:
- Build the Docker image remotely (Fly builders)
- Push to Fly registry
- Boot a new machine in JNB
- Mount the volume
- Run health checks

Takes 3-7 minutes for first deploy.

### 13. Verify

```powershell
fly status
fly logs
```

Look for "machine X started" and HTTP requests succeeding. No crash loops.

Then open in a browser: `https://cheddar-terminal.fly.dev` (or whatever app name was used in step 3).

Verify in the browser:

1. Homepage at `/` loads with all Bloomberg chrome (top bar, ticker, status row, dashboard cards, activity log, F-key footer)
2. Click ALMR card → `/altcoin-monitor` loads
3. Altcoin monitor page shows the Bloomberg-styled dashboard
4. Live data appears (Alt Flow Index value, charts populate, tiles show numbers) — this confirms the API is reaching CryptoQuant and Coinglass through the secrets
5. Window selector buttons work — 90D should refetch and show data; 6M/1Y/ALL will likely show "Archive depth: 0 days. Showing what's available." since no collector has run yet — that's expected
6. Stub pages (`/ngx-banks`, `/crypto-valuation`) load with their back links
7. `← BACK TO TERMINAL` link works
8. Refresh the page and reload — first request after idle may take 3-5s (cold start); subsequent requests should be instant

If anything fails: capture `fly logs --no-tail | Select-Object -Last 100` and tell the user. Common issues:
- `node:sqlite` not found → Node version too low. fly.toml or Dockerfile pinned to wrong version. Make sure Node 22+.
- 502 errors → Wrong port. Internal port should match what server/index.ts listens on. Check server logs.
- Empty page → Frontend wasn't built. Check `npm run build` ran during Docker build, dist/web exists.

### 14. Commit and push

```powershell
git add -A
git commit -m "feat: Fly.io deployment config

- Dockerfile + fly.toml + .dockerignore
- DB_PATH env var for SQLite path (local + prod parity)
- Production-safe start script (no --env-file flag)
- tsx moved to dependencies for runtime
- SQLite volume mounted at /app/data in production"
git push
```

## Verify local dev still works

```powershell
npm run dev
```

Visit `http://localhost:5173/`. Confirm:
- Homepage and altcoin monitor still work as they did before
- API still calls CryptoQuant + Coinglass
- SQLite still reads/writes (e.g. window selector showing 6M still works if there's existing local archive data)

If anything broke locally, fix before deploying or before committing the deploy changes. Local must keep working — we deploy from the same codebase.

## Do not

- Run `fly deploy` before fly.toml, Dockerfile, and DB_PATH refactor are in place
- Hardcode API keys anywhere — only via `fly secrets`
- Commit `.env` (it's gitignored, double-check)
- Add the collector deployment yet (separate session)
- Touch the existing dashboard / homepage code — this task is infrastructure only
- Compile TypeScript to JS — keep tsx as the runtime
