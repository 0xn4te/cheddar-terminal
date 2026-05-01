import { useEffect, useMemo, useState } from 'react';
import type { CQDataPoint, DashboardData } from './lib/api.ts';
import { dataOf, getDashboard } from './lib/api.ts';
import { getHistory, historyToData, type HistoryResponse } from './lib/history.ts';
import {
  computeAltFlowIndex,
  combineSeriesByDate,
  latestValue,
  meanLastN,
  pctChangeNDaysAgo,
  sumLastN,
  WHALE_RATIO_KEYS,
  LONG_SHORT_KEYS,
  OPEN_INTEREST_KEYS,
  FUNDING_RATE_KEYS,
} from './lib/compute.ts';
import { fmtDate, fmtNum, fmtPct, fmtUSD } from './lib/format.ts';
import { Tile } from './components/Tile.tsx';
import { SourceBar } from './components/SourceBar.tsx';
import { HeroScore } from './components/HeroScore.tsx';
import { HeroChart } from './components/HeroChart.tsx';
import { NetflowChart } from './components/NetflowChart.tsx';
import { ReserveChart } from './components/ReserveChart.tsx';
import { IndicatorsChart } from './components/IndicatorsChart.tsx';
import { RatioChart } from './components/RatioChart.tsx';
import { FundingRateChart } from './components/FundingRateChart.tsx';
import { WindowSelector, windowToDays, type ViewWindow } from './components/WindowSelector.tsx';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: DashboardData };

// (metric, asset, synthesized-field) tuples for everything that has a chart.
// Field name is what `historyToData` writes into each synthesized point;
// callers' `valueKey` arrays then read from it.
const HISTORY_REQUESTS = [
  { metric: 'netflow', asset: 'btc', field: 'netflow_total' },
  { metric: 'netflow', asset: 'eth', field: 'netflow_total' },
  { metric: 'netflow', asset: 'usdt', field: 'netflow_total' },
  { metric: 'netflow', asset: 'usdc', field: 'netflow_total' },
  { metric: 'miner_netflow', asset: 'btc', field: 'netflow_total' },
  { metric: 'reserve', asset: 'btc', field: 'reserve' },
  { metric: 'ssr', asset: 'btc', field: 'stablecoin_supply_ratio' },
  { metric: 'mvrv', asset: 'btc', field: 'mvrv' },
  { metric: 'whale_ratio', asset: 'btc', field: 'exchange_whale_ratio' },
  { metric: 'funding_rate', asset: 'btc', field: 'close' },
  { metric: 'funding_rate', asset: 'eth', field: 'close' },
  { metric: 'long_short_ratio', asset: 'btc', field: 'top_position_long_short_ratio' },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export default function App() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [viewWindow, setViewWindow] = useState<ViewWindow>('90d');
  const [historyMap, setHistoryMap] = useState<Map<string, HistoryResponse> | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getDashboard();
        if (!cancelled) setState({ phase: 'ready', data });
      } catch (err) {
        if (!cancelled) {
          setState({
            phase: 'error',
            message: err instanceof Error ? err.message : 'unknown error',
          });
        }
      }
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    // 90d uses the dashboard endpoint already loaded in state — no extra fetch.
    if (viewWindow === '90d') {
      setHistoryMap(null);
      return;
    }

    let cancelled = false;
    const days = windowToDays(viewWindow);
    const since = days === null ? 0 : Date.now() - days * DAY_MS;

    setHistoryLoading(true);
    Promise.all(
      HISTORY_REQUESTS.map(async (r) => {
        const res = await getHistory(r.metric, r.asset, since);
        return [`${r.metric}:${r.asset}`, res] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        setHistoryMap(new Map(entries));
        setHistoryLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[history] fetch failed:', err);
        setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewWindow]);

  if (state.phase === 'loading') {
    return (
      <main className="page page--center">
        <div className="loading">Loading on-chain flows…</div>
      </main>
    );
  }

  if (state.phase === 'error') {
    return (
      <main className="page page--center">
        <div className="error">
          <div className="error__title">Dashboard unavailable</div>
          <div className="error__detail">{state.message}</div>
          <div className="error__hint">
            Check that the backend is running on :8787 and that{' '}
            <code>CRYPTOQUANT_API_KEY</code> is set in <code>.env</code>.
          </div>
        </div>
      </main>
    );
  }

  return (
    <DashboardView
      data={state.data}
      viewWindow={viewWindow}
      onWindowChange={setViewWindow}
      historyMap={historyMap}
      historyLoading={historyLoading}
    />
  );
}

interface ChartSlot {
  data: CQDataPoint[] | null;
  archiveNote?: string;
}

interface DashboardViewProps {
  data: DashboardData;
  viewWindow: ViewWindow;
  onWindowChange: (next: ViewWindow) => void;
  historyMap: Map<string, HistoryResponse> | null;
  historyLoading: boolean;
}

function DashboardView({ data, viewWindow, onWindowChange, historyMap, historyLoading }: DashboardViewProps) {
  // Tile data always comes from the dashboard endpoint, regardless of window.
  const btcNetflow = dataOf(data.flows.btcNetflow);
  const ethNetflow = dataOf(data.flows.ethNetflow);
  const usdtNetflow = dataOf(data.flows.usdtNetflow);
  const usdcNetflow = dataOf(data.flows.usdcNetflow);
  const stableUsdt = dataOf(data.flows.stableUsdtSupply);
  const stableUsdc = dataOf(data.flows.stableUsdcSupply);
  const btcMinerNetflow = dataOf(data.flows.btcMinerNetflow);
  const btcReserve = dataOf(data.stocks.btcReserve);
  const ssr = dataOf(data.indicators.ssr);
  const mvrv = dataOf(data.indicators.mvrv);
  const btcWhaleRatio = dataOf(data.indicators.btcWhaleRatio);
  const btcFunding = dataOf(data.derivatives.btcFundingRate);
  const ethFunding = dataOf(data.derivatives.ethFundingRate);
  const btcLongShort = dataOf(data.derivatives.btcLongShortRatio);
  const btcOI = dataOf(data.stocks.btcOpenInterest);
  const ethOI = dataOf(data.stocks.ethOpenInterest);

  const indexResult = computeAltFlowIndex({
    stableUsdt,
    stableUsdc,
    btcNetflow,
    ethNetflow,
    ssr,
    btcFunding,
    ethFunding,
  });

  const stableKeys = ['supply_total', 'supply_circulating', 'total_supply', 'value'];
  const netflowKeys = ['netflow_total_usd', 'netflow_usd', 'netflow_total'];
  const stableCombined = combineSeriesByDate(stableUsdt, stableUsdc, stableKeys);
  const stableTotal = latestValue(
    stableCombined.length > 0 ? stableCombined : null,
    stableKeys,
  );
  const stable7d = pctChangeNDaysAgo(
    stableCombined.length > 0 ? stableCombined : null,
    stableKeys,
    7,
  );
  const btc7dNetflow = sumLastN(btcNetflow, netflowKeys, 7);
  const eth7dNetflow = sumLastN(ethNetflow, netflowKeys, 7);
  const usdt7dNetflow = sumLastN(usdtNetflow, netflowKeys, 7);
  const usdc7dNetflow = sumLastN(usdcNetflow, netflowKeys, 7);
  const miner7dNetflow = sumLastN(btcMinerNetflow, netflowKeys, 7);
  const ssrLatest = latestValue(ssr, ['stablecoin_supply_ratio', 'ssr', 'value']);
  const mvrvLatest = latestValue(mvrv, ['mvrv', 'value']);
  const reserveLatest = latestValue(btcReserve, ['reserve', 'value']);
  const reserve30d = pctChangeNDaysAgo(btcReserve, ['reserve', 'value'], 30);
  const whaleRatioLatest = latestValue(btcWhaleRatio, WHALE_RATIO_KEYS);
  const btcFundingMean14 = meanLastN(btcFunding, FUNDING_RATE_KEYS, 14);
  const ethFundingMean14 = meanLastN(ethFunding, FUNDING_RATE_KEYS, 14);
  const btcLongShortLatest = latestValue(btcLongShort, LONG_SHORT_KEYS);
  const btcOILatest = latestValue(btcOI, OPEN_INTEREST_KEYS);
  const ethOILatest = latestValue(ethOI, OPEN_INTEREST_KEYS);
  const btcOI7d = pctChangeNDaysAgo(btcOI, OPEN_INTEREST_KEYS, 7);
  const ethOI7d = pctChangeNDaysAgo(ethOI, OPEN_INTEREST_KEYS, 7);

  // Chart data routing: 90d uses dashboard payload, longer windows use the
  // synthesized history payload from /api/history.
  const requestedDays = windowToDays(viewWindow);
  const chartDays = viewWindow === '90d' ? undefined : (requestedDays ?? 9999);

  const slot = useMemo(() => {
    return (metric: string, asset: string, fallback: CQDataPoint[] | null, field: string): ChartSlot => {
      if (viewWindow === '90d' || !historyMap) {
        return { data: fallback };
      }
      const h = historyMap.get(`${metric}:${asset}`);
      if (!h || h.points.length === 0) {
        return {
          data: null,
          archiveNote: `Archive depth: 0 days. Run \`npm run collector -- --backfill\` to populate.`,
        };
      }
      const synth = historyToData(h, field);
      const note =
        requestedDays !== null && h.archiveDepthDays < requestedDays
          ? `Archive depth: ${h.archiveDepthDays} days. Showing what's available.`
          : undefined;
      return { data: synth, archiveNote: note };
    };
  }, [viewWindow, historyMap, requestedDays]);

  const btcNetflowSlot = slot('netflow', 'btc', btcNetflow, 'netflow_total');
  const ethNetflowSlot = slot('netflow', 'eth', ethNetflow, 'netflow_total');
  const usdtNetflowSlot = slot('netflow', 'usdt', usdtNetflow, 'netflow_total');
  const usdcNetflowSlot = slot('netflow', 'usdc', usdcNetflow, 'netflow_total');
  const minerSlot = slot('miner_netflow', 'btc', btcMinerNetflow, 'netflow_total');
  const reserveSlot = slot('reserve', 'btc', btcReserve, 'reserve');
  const ssrSlot = slot('ssr', 'btc', ssr, 'stablecoin_supply_ratio');
  const mvrvSlot = slot('mvrv', 'btc', mvrv, 'mvrv');
  const whaleSlot = slot('whale_ratio', 'btc', btcWhaleRatio, 'exchange_whale_ratio');
  const btcFundingSlot = slot('funding_rate', 'btc', btcFunding, 'close');
  const ethFundingSlot = slot('funding_rate', 'eth', ethFunding, 'close');
  const longShortSlot = slot('long_short_ratio', 'btc', btcLongShort, 'top_position_long_short_ratio');

  const indicatorsArchiveNote = ssrSlot.archiveNote ?? mvrvSlot.archiveNote;

  return (
    <main className="page">
      <header className="masthead">
        <div className="masthead__rule" />
        <h1 className="masthead__title">
          Alt Flow Monitor — <em>a daily reading of on-chain liquidity</em>
        </h1>
        <div className="masthead__row">
          <div className="masthead__sub">
            {fmtDate(data.generatedAt, true)} · CryptoQuant + Coinglass feeds · local instance
          </div>
          <WindowSelector value={viewWindow} onChange={onWindowChange} loading={historyLoading} />
        </div>
        <div className="masthead__rule" />
      </header>

      <section className="hero">
        <HeroScore result={indexResult} />
        <HeroChart btcNetflow={btcNetflowSlot.data} />
      </section>

      <section className="tiles">
        <Tile
          label="Stablecoin supply"
          value={fmtUSD(stableTotal)}
          hint={stable7d === null ? 'no data' : `${fmtPct(stable7d)} 7d`}
          tone={stable7d !== null && stable7d > 0 ? 'pos' : stable7d !== null && stable7d < 0 ? 'neg' : 'neu'}
        />
        <Tile
          label="BTC 7d netflow"
          value={`${fmtNum(btc7dNetflow, { compact: true })} BTC`}
          hint={(btc7dNetflow ?? 0) < 0 ? 'net outflow' : 'net inflow'}
          tone={(btc7dNetflow ?? 0) < 0 ? 'pos' : 'neg'}
        />
        <Tile
          label="ETH 7d netflow"
          value={`${fmtNum(eth7dNetflow, { compact: true })} ETH`}
          hint={(eth7dNetflow ?? 0) < 0 ? 'net outflow' : 'net inflow'}
          tone={(eth7dNetflow ?? 0) < 0 ? 'pos' : 'neg'}
        />
        <Tile
          label="USDT 7d netflow"
          value={fmtUSD(usdt7dNetflow)}
          hint={(usdt7dNetflow ?? 0) < 0 ? 'leaving exchanges' : 'arriving on exchanges'}
          tone={(usdt7dNetflow ?? 0) < 0 ? 'pos' : 'neg'}
        />
        <Tile
          label="USDC 7d netflow"
          value={fmtUSD(usdc7dNetflow)}
          hint={(usdc7dNetflow ?? 0) < 0 ? 'leaving exchanges' : 'arriving on exchanges'}
          tone={(usdc7dNetflow ?? 0) < 0 ? 'pos' : 'neg'}
        />
        <Tile
          label="SSR (latest)"
          value={fmtNum(ssrLatest)}
          hint="lower = more stable dry powder"
        />
        <Tile label="MVRV (latest)" value={fmtNum(mvrvLatest)} hint=">3.5 historically frothy" />
        <Tile
          label="BTC on exchanges"
          value={fmtNum(reserveLatest, { compact: true })}
          hint={reserve30d === null ? '' : `${fmtPct(reserve30d)} 30d`}
          tone={reserve30d !== null && reserve30d < 0 ? 'pos' : 'neg'}
        />
        <Tile
          label="Whale ratio (BTC)"
          value={fmtNum(whaleRatioLatest)}
          hint=">0.85 = whale-dominated inflows"
          tone={whaleRatioLatest !== null && whaleRatioLatest > 0.85 ? 'neg' : 'neu'}
        />
        <Tile
          label="Miner 7d netflow"
          value={`${fmtNum(miner7dNetflow, { compact: true })} BTC`}
          hint={(miner7dNetflow ?? 0) > 0 ? 'distribution' : 'accumulation'}
          tone={(miner7dNetflow ?? 0) > 0 ? 'neg' : 'pos'}
        />
      </section>

      <section className="grid">
        <NetflowChart
          data={btcNetflowSlot.data}
          title={`BTC exchange netflow (${viewWindow.toUpperCase()})`}
          unit="BTC"
          days={chartDays}
          archiveNote={btcNetflowSlot.archiveNote}
        />
        <NetflowChart
          data={ethNetflowSlot.data}
          title={`ETH exchange netflow (${viewWindow.toUpperCase()})`}
          unit="ETH"
          days={chartDays}
          archiveNote={ethNetflowSlot.archiveNote}
        />
        <ReserveChart
          data={reserveSlot.data}
          valueKey={['reserve', 'value']}
          title={`BTC exchange reserve (${viewWindow.toUpperCase()})`}
          unit="BTC"
          days={chartDays}
          archiveNote={reserveSlot.archiveNote}
        />
        <IndicatorsChart
          ssr={ssrSlot.data}
          mvrv={mvrvSlot.data}
          days={chartDays}
          archiveNote={indicatorsArchiveNote}
        />
      </section>

      <section className="section-heading">
        <h2><em>Stablecoin flows</em></h2>
        <p>USD moving onto and off exchanges via USDT and USDC. Outflows = stables parked off-exchange (often a sign holders aren't deploying yet).</p>
      </section>

      <section className="grid">
        <NetflowChart
          data={usdtNetflowSlot.data}
          title={`USDT exchange netflow (${viewWindow.toUpperCase()})`}
          unit="USD"
          days={chartDays}
          archiveNote={usdtNetflowSlot.archiveNote}
        />
        <NetflowChart
          data={usdcNetflowSlot.data}
          title={`USDC exchange netflow (${viewWindow.toUpperCase()})`}
          unit="USD"
          days={chartDays}
          archiveNote={usdcNetflowSlot.archiveNote}
        />
      </section>

      <section className="section-heading">
        <h2><em>Whales &amp; miners</em></h2>
        <p>Cohort-level signals. Whale-ratio lift typically precedes volatility; sustained miner outflows signal distribution.</p>
      </section>

      <section className="grid">
        <RatioChart
          data={whaleSlot.data}
          valueKey={WHALE_RATIO_KEYS}
          title={`BTC exchange whale ratio (${viewWindow.toUpperCase()})`}
          reference={0.85}
          days={chartDays}
          archiveNote={whaleSlot.archiveNote}
        />
        <NetflowChart
          data={minerSlot.data}
          title={`BTC miner netflow (${viewWindow.toUpperCase()})`}
          unit="BTC"
          days={chartDays}
          archiveNote={minerSlot.archiveNote}
        />
      </section>

      <section className="section-heading">
        <h2><em>Derivatives sentiment</em></h2>
        <p>OI-weighted aggregated funding rates and positioning. Positive funding = crowded long; negative = crowded short. Top-trader long/short ratios above 1 lean bullish.</p>
      </section>

      <section className="tiles">
        <Tile
          label="BTC funding (14d mean)"
          value={btcFundingMean14 === null ? '—' : `${(btcFundingMean14 * 100).toFixed(4)}%`}
          hint={(btcFundingMean14 ?? 0) > 0.0003 ? 'crowded long' : (btcFundingMean14 ?? 0) < -0.0003 ? 'crowded short' : 'balanced'}
          tone={(btcFundingMean14 ?? 0) > 0.0003 ? 'neg' : (btcFundingMean14 ?? 0) < -0.0003 ? 'pos' : 'neu'}
        />
        <Tile
          label="ETH funding (14d mean)"
          value={ethFundingMean14 === null ? '—' : `${(ethFundingMean14 * 100).toFixed(4)}%`}
          hint={(ethFundingMean14 ?? 0) > 0.0003 ? 'crowded long' : (ethFundingMean14 ?? 0) < -0.0003 ? 'crowded short' : 'balanced'}
          tone={(ethFundingMean14 ?? 0) > 0.0003 ? 'neg' : (ethFundingMean14 ?? 0) < -0.0003 ? 'pos' : 'neu'}
        />
        <Tile
          label="BTC long/short (top)"
          value={fmtNum(btcLongShortLatest)}
          hint={(btcLongShortLatest ?? 1) > 1 ? 'longs dominant' : 'shorts dominant'}
          tone={(btcLongShortLatest ?? 1) > 1.5 ? 'neg' : 'neu'}
        />
        <Tile
          label="BTC open interest"
          value={fmtUSD(btcOILatest)}
          hint={btcOI7d === null ? '' : `${fmtPct(btcOI7d)} 7d`}
          tone={btcOI7d !== null && btcOI7d > 0.10 ? 'neg' : 'neu'}
        />
        <Tile
          label="ETH open interest"
          value={fmtUSD(ethOILatest)}
          hint={ethOI7d === null ? '' : `${fmtPct(ethOI7d)} 7d`}
          tone={ethOI7d !== null && ethOI7d > 0.10 ? 'neg' : 'neu'}
        />
      </section>

      <section className="grid">
        <FundingRateChart
          data={btcFundingSlot.data}
          title={`BTC funding rate (${viewWindow.toUpperCase()})`}
          days={chartDays}
          archiveNote={btcFundingSlot.archiveNote}
        />
        <FundingRateChart
          data={ethFundingSlot.data}
          title={`ETH funding rate (${viewWindow.toUpperCase()})`}
          days={chartDays}
          archiveNote={ethFundingSlot.archiveNote}
        />
        <RatioChart
          data={longShortSlot.data}
          valueKey={LONG_SHORT_KEYS}
          title={`BTC top-trader long/short (${viewWindow.toUpperCase()})`}
          reference={1}
          days={chartDays}
          archiveNote={longShortSlot.archiveNote}
        />
      </section>

      <section className="methodology">
        <h2 className="methodology__title">
          <em>How the Alt Flow Index is built</em>
        </h2>
        <p>
          A weighted composite, bounded [-100, +100]. Inputs are normalized
          through a tanh so extremes saturate gracefully. Components renormalize
          when a source is unavailable, so a partial reading is still useful.
        </p>
        <ul className="methodology__list">
          <li>
            <strong>35%</strong> · Stablecoin supply 7d expansion (USDT + USDC).
            Growing dry powder is bullish for risk assets.
          </li>
          <li>
            <strong>22%</strong> · BTC exchange netflow, 7d sum. Negative means
            coins moving off exchanges — typically accumulation.
          </li>
          <li>
            <strong>13%</strong> · ETH exchange netflow, 7d sum. Same logic, ETH
            cohort.
          </li>
          <li>
            <strong>15%</strong> · SSR posture vs 30d mean. Below trend = stables
            heavy relative to BTC = ammo for alts.
          </li>
          <li>
            <strong>15%</strong> · Funding posture, BTC + ETH 14d mean (sign
            inverted). High aggregated funding = crowded long = bearish for
            risk-on positioning.
          </li>
        </ul>
        <p className="methodology__note">
          Weights updated 2026-05-01 to add the funding-rate component;
          scores from before that date are not directly comparable.
        </p>
      </section>

      <SourceBar sources={data.sources} generatedAt={data.generatedAt} />
    </main>
  );
}
