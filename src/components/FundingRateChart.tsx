import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { COLORS, defaultChartOptions } from '../lib/chartSetup.ts';
import { fmtDate } from '../lib/format.ts';
import { timelineFor, FUNDING_RATE_KEYS } from '../lib/compute.ts';
import type { CQDataPoint } from '../lib/api.ts';

interface FundingRateChartProps {
  data: CQDataPoint[] | null;
  title: string;
  days?: number;
  archiveNote?: string;
}

// OI-weighted aggregated funding rate. Positive = longs pay shorts (crowded
// long, bearish for risk-on positioning). Negative = the reverse.
//
// Coinglass returns daily candles where `close` is the funding rate at the
// candle close, expressed as a fraction (e.g. 0.0001 = 0.01%). We render as
// percent for legibility.
export function FundingRateChart({ data, title, days = 90, archiveNote }: FundingRateChartProps) {
  const series = useMemo(() => timelineFor(data, FUNDING_RATE_KEYS, days), [data, days]);

  if (series.values.length === 0) {
    return <div className="chart chart--empty">{title} unavailable</div>;
  }

  const pctValues = series.values.map((v) => v * 100);

  const chartData = {
    labels: series.labels,
    datasets: [
      {
        label: title,
        data: pctValues,
        borderColor: COLORS.accent,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.2,
        fill: {
          target: 'origin',
          above: 'rgba(240, 71, 71, 0.18)',
          below: 'rgba(63, 185, 80, 0.18)',
        },
      },
    ],
  };

  const opts = defaultChartOptions<'line'>();
  opts.scales = {
    x: { type: 'time', time: { unit: 'week' }, grid: { display: false } },
    y: {
      grid: { color: COLORS.grid },
      ticks: { callback: (v: string | number) => `${Number(v).toFixed(3)}%` },
    },
  } as never;
  opts.plugins!.tooltip!.callbacks = {
    title: (items) => fmtDate(new Date(Number(items[0].parsed.x)), true),
    label: (item) => `${Number(item.parsed.y).toFixed(4)}%`,
  };

  return (
    <div className="chart">
      <div className="chart__title">{title}</div>
      {archiveNote && <div className="chart__hint">{archiveNote}</div>}
      <div className="chart__canvas">
        <Line data={chartData} options={opts} />
      </div>
      <div className="chart__legend">
        <span className="chart__legend-swatch chart__legend-swatch--neg" /> longs pay (crowded long)
        <span className="chart__legend-swatch chart__legend-swatch--pos" /> shorts pay (crowded short)
      </div>
    </div>
  );
}
