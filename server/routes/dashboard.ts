import { Hono } from 'hono';
import { cqFetchMany, type CqFetchSpec } from '../cryptoquant.ts';
import { cgFetchMany, type CgFetchSpec } from '../coinglass.ts';
import type { DashboardData } from '../types.ts';

export const dashboardRoute = new Hono();

const LIMIT = 90;

// Single source of truth for the endpoints we pull. To add a new metric:
//   1. Add an entry here.
//   2. Add the field to DashboardData in server/types.ts.
//   3. Read it via dataOf(data.x.y) in a component.
//
// CryptoQuant pulls — auth via Authorization: Bearer.
const CQ_SPECS = {
  btcNetflow: {
    path: '/btc/exchange-flows/netflow',
    params: { window: 'day', exchange: 'all_exchange', limit: LIMIT },
  },
  ethNetflow: {
    path: '/eth/exchange-flows/netflow',
    params: { window: 'day', exchange: 'all_exchange', limit: LIMIT },
  },
  // Stablecoin netflows: value is in USD (not stablecoin units).
  usdtNetflow: {
    path: '/stablecoin/exchange-flows/netflow',
    params: { window: 'day', exchange: 'all_exchange', token: 'usdt_eth', limit: LIMIT },
  },
  usdcNetflow: {
    path: '/stablecoin/exchange-flows/netflow',
    params: { window: 'day', exchange: 'all_exchange', token: 'usdc', limit: LIMIT },
  },
  stableUsdtSupply: {
    path: '/stablecoin/network-data/supply',
    params: { window: 'day', token: 'usdt_eth', limit: LIMIT },
  },
  stableUsdcSupply: {
    path: '/stablecoin/network-data/supply',
    params: { window: 'day', token: 'usdc', limit: LIMIT },
  },
  btcMinerNetflow: {
    path: '/btc/miner-flows/netflow',
    params: { window: 'day', miner: 'all_miner', limit: LIMIT },
  },
  btcReserve: {
    path: '/btc/exchange-flows/reserve',
    params: { window: 'day', exchange: 'all_exchange', limit: LIMIT },
  },
  ssr: {
    path: '/btc/market-indicator/stablecoin-supply-ratio',
    params: { window: 'day', limit: LIMIT },
  },
  mvrv: {
    path: '/btc/market-indicator/mvrv',
    params: { window: 'day', limit: LIMIT },
  },
  // Live path is `/btc/flow-indicator/...`, not `/btc/exchange-flows/...`.
  // Confirmed via discovery probe; a 404 surfaced from the latter.
  btcWhaleRatio: {
    path: '/btc/flow-indicator/exchange-whale-ratio',
    params: { window: 'day', exchange: 'all_exchange', limit: LIMIT },
  },
} satisfies Record<string, CqFetchSpec>;

// Coinglass pulls — auth via CG-API-KEY. Treated identically to CQ for the
// purposes of the SourceBar (each key shows up as one entry under `sources`).
const CG_SPECS = {
  btcFundingRate: {
    path: '/futures/funding-rate/oi-weight-history',
    params: { symbol: 'BTC', interval: '1d', limit: LIMIT },
  },
  ethFundingRate: {
    path: '/futures/funding-rate/oi-weight-history',
    params: { symbol: 'ETH', interval: '1d', limit: LIMIT },
  },
  btcLongShortRatio: {
    // Long/short endpoint wants the full pair as `symbol`, not the base
    // asset. With `symbol=BTC` it 400s "pair does not exist".
    path: '/futures/top-long-short-position-ratio/history',
    params: { symbol: 'BTCUSDT', exchange: 'Binance', interval: '1d', limit: LIMIT },
  },
  btcOpenInterest: {
    path: '/futures/open-interest/aggregated-history',
    params: { symbol: 'BTC', interval: '1d', limit: LIMIT },
  },
  ethOpenInterest: {
    path: '/futures/open-interest/aggregated-history',
    params: { symbol: 'ETH', interval: '1d', limit: LIMIT },
  },
} satisfies Record<string, CgFetchSpec>;

dashboardRoute.get('/', async (c) => {
  const [cq, cg] = await Promise.all([cqFetchMany(CQ_SPECS), cgFetchMany(CG_SPECS)]);

  const body: DashboardData = {
    generatedAt: new Date().toISOString(),
    flows: {
      btcNetflow: cq.results.btcNetflow,
      ethNetflow: cq.results.ethNetflow,
      usdtNetflow: cq.results.usdtNetflow,
      usdcNetflow: cq.results.usdcNetflow,
      stableUsdtSupply: cq.results.stableUsdtSupply,
      stableUsdcSupply: cq.results.stableUsdcSupply,
      btcMinerNetflow: cq.results.btcMinerNetflow,
    },
    stocks: {
      btcReserve: cq.results.btcReserve,
      btcOpenInterest: cg.results.btcOpenInterest,
      ethOpenInterest: cg.results.ethOpenInterest,
    },
    indicators: {
      ssr: cq.results.ssr,
      mvrv: cq.results.mvrv,
      btcWhaleRatio: cq.results.btcWhaleRatio,
    },
    derivatives: {
      btcFundingRate: cg.results.btcFundingRate,
      ethFundingRate: cg.results.ethFundingRate,
      btcLongShortRatio: cg.results.btcLongShortRatio,
    },
    sources: { ...cq.sources, ...cg.sources },
  };

  return c.json(body);
});
