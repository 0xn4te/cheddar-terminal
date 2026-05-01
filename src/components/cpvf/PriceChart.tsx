import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartOptions } from 'chart.js';
import { COLORS, defaultChartOptions } from '../../lib/chartSetup';
import { TOKENS } from '../../pages/_TerminalShell';

interface PriceChartProps {
  geckoId: string | null;
}

interface MarketChartResponse {
  prices?: Array<[number, number]>;
}

type LoadState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ok'; points: Array<[number, number]> }
  | { phase: 'error'; message: string };

const fmtPrice = (n: number): string => {
  if (n == null || !isFinite(n)) return '—';
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return '$' + n.toFixed(2);
  if (n >= 0.01) return '$' + n.toFixed(4);
  return '$' + n.toExponential(2);
};

const fmtPct = (n: number | null): string => {
  if (n == null || !isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return sign + n.toFixed(2) + '%';
};

export function PriceChart({ geckoId }: PriceChartProps) {
  const [state, setState] = useState<LoadState>({ phase: 'idle' });

  useEffect(() => {
    if (!geckoId) {
      setState({ phase: 'error', message: 'no gecko id' });
      return;
    }
    let cancelled = false;
    setState({ phase: 'loading' });
    const url =
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(geckoId)}/market_chart` +
      `?vs_currency=usd&days=30`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('CG HTTP ' + r.status);
        return r.json() as Promise<MarketChartResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        const points = data.prices || [];
        if (!points.length) {
          setState({ phase: 'error', message: 'no points' });
          return;
        }
        setState({ phase: 'ok', points });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : 'fetch failed';
        setState({ phase: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [geckoId]);

  const summary = useMemo(() => {
    if (state.phase !== 'ok' || state.points.length === 0) {
      return { current: null as number | null, change: null as number | null };
    }
    const first = state.points[0][1];
    const last = state.points[state.points.length - 1][1];
    const change = first > 0 ? ((last - first) / first) * 100 : null;
    return { current: last, change };
  }, [state]);

  const positive = summary.change != null && summary.change >= 0;
  const lineColor = positive ? COLORS.positive : COLORS.negative;
  const fillColor = positive ? 'rgba(63, 185, 80, 0.10)' : 'rgba(240, 71, 71, 0.10)';

  const chartData = useMemo(() => {
    if (state.phase !== 'ok') return null;
    return {
      labels: state.points.map((p) => new Date(p[0])),
      datasets: [
        {
          label: 'Price',
          data: state.points.map((p) => p[1]),
          borderColor: lineColor,
          backgroundColor: fillColor,
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 1.5,
        },
      ],
    };
  }, [state, lineColor, fillColor]);

  const options = useMemo<ChartOptions<'line'>>(() => {
    const opts = defaultChartOptions<'line'>();
    opts.scales = {
      x: {
        type: 'time',
        time: { unit: 'day' },
        grid: { display: false },
        ticks: { color: COLORS.axis, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
      },
      y: {
        grid: { color: COLORS.grid },
        ticks: {
          color: COLORS.axis,
          callback: (v: string | number) => fmtPrice(Number(v)),
        },
      },
    } as never;
    opts.plugins!.tooltip!.callbacks = {
      label: (item) => fmtPrice(Number(item.parsed.y)),
    };
    return opts;
  }, []);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          marginBottom: 10,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span style={{ fontSize: 22, color: TOKENS.text, letterSpacing: '0.02em' }}>
          {state.phase === 'ok' && summary.current != null ? fmtPrice(summary.current) : '—'}
        </span>
        <span
          style={{
            fontSize: 12,
            color: summary.change == null ? TOKENS.textDim : positive ? TOKENS.green : TOKENS.red,
          }}
        >
          {fmtPct(summary.change)} <span style={{ color: TOKENS.textDim }}>30D</span>
        </span>
      </div>

      <div style={{ height: 360, position: 'relative' }}>
        {state.phase === 'loading' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: TOKENS.textDim,
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            fetching price data…
          </div>
        )}
        {state.phase === 'error' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: TOKENS.textDim,
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            price unavailable
          </div>
        )}
        {state.phase === 'ok' && chartData && <Line data={chartData} options={options} />}
      </div>
    </div>
  );
}
