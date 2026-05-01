// Pulls /api/dashboard, computes the Alt Flow Index, prints diagnostics.
import {
  computeAltFlowIndex,
  latestValue,
  sumLastN,
  pctChangeNDaysAgo,
  combineSeriesByDate,
} from './src/lib/compute.ts';

const res = await fetch('http://localhost:8787/api/dashboard');
const data = await res.json();

const dataOf = (sr) => (sr?.ok ? sr.data : null);
const btc = dataOf(data.flows.btcNetflow);
const eth = dataOf(data.flows.ethNetflow);
const usdt = dataOf(data.flows.stableUsdtSupply);
const usdc = dataOf(data.flows.stableUsdcSupply);
const ssr = dataOf(data.indicators.ssr);
const mvrv = dataOf(data.indicators.mvrv);
const reserve = dataOf(data.stocks.btcReserve);

const idx = computeAltFlowIndex({
  stableUsdt: usdt,
  stableUsdc: usdc,
  btcNetflow: btc,
  ethNetflow: eth,
  ssr,
});

const stableKeys = ['supply_total', 'supply_circulating', 'total_supply'];
const stableCombined = combineSeriesByDate(usdt, usdc, stableKeys);
const stable7d = pctChangeNDaysAgo(
  stableCombined.length ? stableCombined : null,
  stableKeys,
  7,
);

console.log('--- raw latest values ---');
console.log('USDT supply:', latestValue(usdt, stableKeys)?.toLocaleString());
console.log('USDC supply:', latestValue(usdc, stableKeys)?.toLocaleString());
console.log(
  'Combined supply:',
  latestValue(stableCombined.length ? stableCombined : null, stableKeys)?.toLocaleString(),
);
console.log('Stable 7d %:', stable7d === null ? 'n/a' : (stable7d * 100).toFixed(3) + '%');
console.log('BTC 7d netflow:', sumLastN(btc, ['netflow_total_usd', 'netflow_total'], 7)?.toFixed(2), 'BTC');
console.log('ETH 7d netflow:', sumLastN(eth, ['netflow_total_usd', 'netflow_total'], 7)?.toFixed(2), 'ETH');
console.log('SSR latest:', latestValue(ssr, ['stablecoin_supply_ratio', 'ssr']));
console.log('MVRV latest:', latestValue(mvrv, ['mvrv']));
console.log('BTC reserve:', latestValue(reserve, ['reserve'])?.toLocaleString(), 'BTC');

console.log('\n--- Alt Flow Index ---');
console.log('Score:', idx.score?.toFixed(2));
for (const c of idx.components) {
  console.log(
    `  ${c.label} (${(c.weight * 100) | 0}%): ${c.score === null ? 'no data' : c.score.toFixed(2)}`,
  );
}
