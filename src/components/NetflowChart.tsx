import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { COLORS, defaultChartOptions } from '../lib/chartSetup.ts';
import { fmtDate, fmtNum } from '../lib/format.ts';
import { timelineFor } from '../lib/compute.ts';
import type { CQDataPoint } from '../lib/api.ts';

interface NetflowChartProps {
  data: CQDataPoint[] | null;
  valueKey?: string[];
  title: string;
  unit?: string;
  days?: number;
  archiveNote?: string;
}

export function NetflowChart({
  data,
  valueKey = ['netflow_total_usd', 'netflow_usd', 'netflow_total'],
  title,
  unit = '',
  days = 60,
  archiveNote,
}: NetflowChartProps) {
  const series = useMemo(() => timelineFor(data, valueKey, days), [data, valueKey, days]);

  if (series.values.length === 0) {
    return <div className="chart chart--empty">{title} unavailable</div>;
  }

  const colors = series.values.map((v) => (v >= 0 ? COLORS.negative : COLORS.positive));

  const chartData = {
    labels: series.labels,
    datasets: [
      {
        label: title,
        data: series.values,
        backgroundColor: colors,
        borderWidth: 0,
      },
    ],
  };

  const opts = defaultChartOptions<'bar'>();
  opts.scales = {
    x: { type: 'time', time: { unit: 'week' }, grid: { display: false } },
    y: {
      grid: { color: COLORS.grid },
      ticks: { callback: (v: string | number) => fmtNum(Number(v), { compact: true }) },
    },
  } as never;
  opts.plugins!.tooltip!.callbacks = {
    title: (items) => fmtDate(new Date(Number(items[0].parsed.x)), true),
    label: (item) => `${fmtNum(Number(item.parsed.y), { compact: true })} ${unit}`.trim(),
  };

  return (
    <div className="chart">
      <div className="chart__title">{title}</div>
      {archiveNote && <div className="chart__hint">{archiveNote}</div>}
      <div className="chart__canvas">
        <Bar data={chartData} options={opts} />
      </div>
      <div className="chart__legend">
        <span className="chart__legend-swatch chart__legend-swatch--neg" /> inflow (bearish)
        <span className="chart__legend-swatch chart__legend-swatch--pos" /> outflow (bullish)
      </div>
    </div>
  );
}
