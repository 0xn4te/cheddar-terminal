import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
  type ChartOptions,
  type ChartType,
} from 'chart.js';
import 'chartjs-adapter-date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
);

// Bloomberg palette — keep these in sync with src/styles.css :root tokens.
// Chart.js needs raw hex strings (no CSS vars), hence the duplication.
export const COLORS = {
  bg: '#0a0a0a',
  surface: '#141414',
  text: '#e8e8e8',
  textDim: '#888',
  divider: '#1f1f1f',
  positive: '#3FB950',
  negative: '#f04747',
  accent: '#f5a623',
  axis: '#666',
  grid: 'rgba(255, 255, 255, 0.04)',
  zero: '#444',
} as const;

ChartJS.defaults.font.family =
  '"JetBrains Mono", "IBM Plex Mono", Menlo, Consolas, ui-monospace, monospace';
ChartJS.defaults.font.size = 10;
ChartJS.defaults.color = COLORS.axis;
ChartJS.defaults.borderColor = COLORS.divider;

export function defaultChartOptions<T extends ChartType = 'line'>(): ChartOptions<T> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: COLORS.surface,
        borderColor: COLORS.divider,
        borderWidth: 1,
        titleColor: COLORS.text,
        bodyColor: COLORS.text,
        padding: 10,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: COLORS.axis, maxRotation: 0 },
        border: { color: COLORS.divider },
      },
      y: {
        grid: { color: COLORS.grid },
        ticks: { color: COLORS.axis },
        border: { color: COLORS.divider },
      },
    },
  } as ChartOptions<T>;
}
