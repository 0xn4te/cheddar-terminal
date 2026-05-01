import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { COLORS, defaultChartOptions } from '../lib/chartSetup.ts';
import { fmtDate, fmtNum } from '../lib/format.ts';
import { timelineFor } from '../lib/compute.ts';
import type { CQDataPoint } from '../lib/api.ts';

interface IndicatorsChartProps {
  ssr: CQDataPoint[] | null;
  mvrv: CQDataPoint[] | null;
  days?: number;
  archiveNote?: string;
}

const SSR_KEYS = ['ssr', 'value'];
const MVRV_KEYS = ['mvrv', 'value'];

export function IndicatorsChart({ ssr, mvrv, days = 90, archiveNote }: IndicatorsChartProps) {
  const ssrSeries = useMemo(() => timelineFor(ssr, SSR_KEYS, days), [ssr, days]);
  const mvrvSeries = useMemo(() => timelineFor(mvrv, MVRV_KEYS, days), [mvrv, days]);

  if (ssrSeries.values.length === 0 && mvrvSeries.values.length === 0) {
    return <div className="chart chart--empty">SSR / MVRV unavailable</div>;
  }

  // Use whichever series has more points as the base x-axis.
  const labels = ssrSeries.labels.length >= mvrvSeries.labels.length
    ? ssrSeries.labels
    : mvrvSeries.labels;

  const chartData = {
    labels,
    datasets: [
      {
        label: 'SSR',
        data: ssrSeries.values,
        borderColor: COLORS.accent,
        backgroundColor: 'transparent',
        yAxisID: 'y',
        tension: 0.25,
        pointRadius: 0,
        borderWidth: 1.5,
      },
      {
        label: 'MVRV',
        data: mvrvSeries.values,
        borderColor: COLORS.positive,
        backgroundColor: 'transparent',
        yAxisID: 'y1',
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
      type: 'linear',
      position: 'left',
      grid: { color: COLORS.grid },
      ticks: { color: COLORS.accent },
      title: { display: true, text: 'SSR', color: COLORS.accent },
    },
    y1: {
      type: 'linear',
      position: 'right',
      grid: { display: false },
      ticks: { color: COLORS.positive },
      title: { display: true, text: 'MVRV', color: COLORS.positive },
    },
  } as never;
  opts.plugins!.legend = {
    display: true,
    labels: { color: COLORS.text, boxWidth: 10, boxHeight: 10 },
  };
  opts.plugins!.tooltip!.callbacks = {
    title: (items) => fmtDate(new Date(Number(items[0].parsed.x)), true),
    label: (item) => `${item.dataset.label}: ${fmtNum(Number(item.parsed.y))}`,
  };

  return (
    <div className="chart">
      <div className="chart__title">SSR &amp; MVRV</div>
      {archiveNote && <div className="chart__hint">{archiveNote}</div>}
      <div className="chart__canvas">
        <Line data={chartData} options={opts} />
      </div>
    </div>
  );
}
