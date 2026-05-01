import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { COLORS, defaultChartOptions } from '../lib/chartSetup.ts';
import { fmtDate, fmtNum } from '../lib/format.ts';
import { sumLastN, timelineFor } from '../lib/compute.ts';
import type { CQDataPoint } from '../lib/api.ts';

interface HeroChartProps {
  btcNetflow: CQDataPoint[] | null;
}

const NETFLOW_KEYS = ['netflow_total_usd', 'netflow_usd', 'netflow_total'];

// Rolling 7-day sum of BTC exchange netflow, oldest-first.
// Negative values = net outflow = bullish.
function rolling7dSum(data: CQDataPoint[] | null): { labels: Date[]; values: number[] } {
  if (!data || data.length < 7) return { labels: [], values: [] };
  const tl = timelineFor(data, NETFLOW_KEYS);
  const out: { labels: Date[]; values: number[] } = { labels: [], values: [] };
  for (let i = 6; i < tl.values.length; i++) {
    let s = 0;
    for (let j = i - 6; j <= i; j++) s += tl.values[j];
    out.labels.push(tl.labels[i]);
    out.values.push(s);
  }
  return out;
}

export function HeroChart({ btcNetflow }: HeroChartProps) {
  const series = useMemo(() => rolling7dSum(btcNetflow), [btcNetflow]);
  const latest7 = useMemo(() => sumLastN(btcNetflow, NETFLOW_KEYS, 7), [btcNetflow]);

  if (series.values.length === 0) {
    return (
      <div className="hero-chart hero-chart--empty">
        BTC netflow series unavailable
      </div>
    );
  }

  const data = {
    labels: series.labels,
    datasets: [
      {
        label: 'BTC netflow (7d sum, USD)',
        data: series.values,
        borderColor: COLORS.accent,
        backgroundColor: 'rgba(212, 163, 90, 0.12)',
        fill: true,
        tension: 0.25,
        pointRadius: 0,
        borderWidth: 1.5,
      },
    ],
  };

  const opts = defaultChartOptions<'line'>();
  opts.scales = {
    x: { type: 'time', time: { unit: 'week' }, grid: { display: false } },
    y: {
      grid: { color: COLORS.grid },
      ticks: { callback: (v: string | number) => fmtNum(Number(v), { compact: true }) },
    },
  } as never;
  opts.plugins!.tooltip!.callbacks = {
    title: (items) => fmtDate(new Date(Number(items[0].parsed.x)), true),
    label: (item) => `7d netflow: ${fmtNum(Number(item.parsed.y), { compact: true })} BTC`,
  };

  return (
    <div className="hero-chart">
      <div className="hero-chart__caption">
        Latest 7-day BTC exchange netflow:{' '}
        <span
          className={
            (latest7 ?? 0) < 0
              ? 'hero-chart__value hero-chart__value--pos'
              : 'hero-chart__value hero-chart__value--neg'
          }
        >
          {fmtNum(latest7, { compact: true })} BTC
        </span>
        {(latest7 ?? 0) < 0 ? ' (net outflow — bullish)' : ' (net inflow — bearish)'}
      </div>
      <div className="hero-chart__canvas">
        <Line data={data} options={opts} />
      </div>
    </div>
  );
}
