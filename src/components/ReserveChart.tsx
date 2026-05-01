import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { COLORS, defaultChartOptions } from '../lib/chartSetup.ts';
import { fmtDate, fmtNum } from '../lib/format.ts';
import { timelineFor } from '../lib/compute.ts';
import type { CQDataPoint } from '../lib/api.ts';

interface ReserveChartProps {
  data: CQDataPoint[] | null;
  valueKey: string[];
  title: string;
  unit?: string;
  days?: number;
  archiveNote?: string;
}

export function ReserveChart({
  data,
  valueKey,
  title,
  unit = '',
  days = 90,
  archiveNote,
}: ReserveChartProps) {
  const series = useMemo(() => timelineFor(data, valueKey, days), [data, valueKey, days]);

  if (series.values.length === 0) {
    return <div className="chart chart--empty">{title} unavailable</div>;
  }

  const chartData = {
    labels: series.labels,
    datasets: [
      {
        label: title,
        data: series.values,
        borderColor: COLORS.accent,
        backgroundColor: 'rgba(212, 163, 90, 0.10)',
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
    label: (item) => `${fmtNum(Number(item.parsed.y), { compact: true })} ${unit}`.trim(),
  };

  return (
    <div className="chart">
      <div className="chart__title">{title}</div>
      {archiveNote && <div className="chart__hint">{archiveNote}</div>}
      <div className="chart__canvas">
        <Line data={chartData} options={opts} />
      </div>
    </div>
  );
}
