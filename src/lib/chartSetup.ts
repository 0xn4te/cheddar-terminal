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

// Design tokens — keep in sync with src/styles.css :root variables.
export const COLORS = {
  bg: '#0d0b07',
  surface: '#14110b',
  text: '#ede0c4',
  textDim: '#8a8170',
  divider: '#2a2520',
  positive: '#6fa86b',
  negative: '#c2553f',
  accent: '#d4a35a',
  axis: '#3a342b',
  grid: 'rgba(138, 129, 112, 0.12)',
} as const;

ChartJS.defaults.font.family = '"JetBrains Mono", ui-monospace, monospace';
ChartJS.defaults.font.size = 11;
ChartJS.defaults.color = COLORS.textDim;
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
        ticks: { color: COLORS.textDim, maxRotation: 0 },
        border: { color: COLORS.axis },
      },
      y: {
        grid: { color: COLORS.grid },
        ticks: { color: COLORS.textDim },
        border: { color: COLORS.axis },
      },
    },
  } as ChartOptions<T>;
}
