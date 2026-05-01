FROM node:22-slim AS base
WORKDIR /app

# Install all deps. tsx and chart.js are needed at runtime, so we don't
# pass --omit=dev. Frontend deps are also needed during the `npm run build`
# step below.
COPY package*.json ./
RUN npm ci

# Copy source and build the frontend bundle into dist/web.
COPY . .
RUN npm run build

# Make sure the data dir exists. The Fly volume mount will overlay this at
# runtime — but having the dir in the image avoids a missing-dir error if
# the volume isn't mounted (e.g. in `fly machine run` ad-hoc invocations).
RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 8787

# tsx runs the TS server directly — no compile step, matches the local
# dev/start pattern. NODE_ENV=production triggers the static-file + SPA
# fallback branch in server/index.ts.
CMD ["npx", "tsx", "server/index.ts"]
