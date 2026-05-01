import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { COLORS, defaultChartOptions } from '../lib/chartSetup.ts';
import { fmtDate, fmtNum } from '../lib/format.ts';
import { timelineFor } from '../lib/compute.ts';
import type { CQDataPoint } from '../lib/api.ts';

interface RatioChartProps {
  data: CQDataPoint[] | null;
  valueKey: string[];
  title: string;
  days?: number;
  // Optional reference line, e.g. 1.0 for long/short or a 30d mean.
  reference?: number;
  archiveNote?: string;
}

export function RatioChart({
  data,
  valueKey,
  title,
  days = 60,
  reference,
  archiveNote,
}: RatioChartProps) {
  const series = useMemo(() => timelineFor(data, valueKey, days), [data, valueKey, days]);

  if (series.values.length === 0) {
    return <div className="chart chart--empty">{title} unavailable</div>;
  }

  const datasets: Array<Record<string, unknown>> = [
    {
      label: title,
      data: series.values,
      borderColor: COLORS.accent,
      backgroundColor: 'rgba(212, 163, 90, 0.08)',
      fill: true,
      tension: 0.25,
      pointRadius: 0,
      borderWidth: 1.5,
    },
  ];

  if (reference !== undefined) {
    datasets.push({
      label: 'reference',
      data: series.values.map(() => reference),
      borderColor: COLORS.divider,
      borderDash: [4, 4],
      pointRadius: 0,
      borderWidth: 1,
      fill: false,
    });
  }

  const opts = defaultChartOptions<'line'>();
  opts.scales = {
    x: { type: 'time', time: { unit: 'week' }, grid: { display: false } },
    y: {
      grid: { color: COLORS.grid },
      ticks: { callback: (v: string | number) => fmtNum(Number(v)) },
    },
  } as never;
  opts.plugins!.tooltip!.callbacks = {
    title: (items) => fmtDate(new Date(Number(items[0].parsed.x)), true),
    label: (item) => fmtNum(Number(item.parsed.y)),
  };

  return (
    <div className="chart">
      <div className="chart__title">{title}</div>
      {archiveNote && <div className="chart__hint">{archiveNote}</div>}
      <div className="chart__canvas">
        <Line data={{ labels: series.labels, datasets: datasets as never }} options={opts} />
      </div>
    </div>
  );
}
