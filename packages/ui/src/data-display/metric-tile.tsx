/**
 * @noema/ui - MetricTile
 *
 * Compact stat card with optional sparkline and trend indicator.
 */
import type { JSX, ReactNode } from 'react';
import { cn } from '../lib/utils.js';
import { Card, CardContent } from '../primitives/card.js';
import type { ColorFamily } from '../lib/types.js';

// Static color lookups - never construct Tailwind class strings dynamically
const TEXT_COLOR: Record<ColorFamily, string> = {
  synapse: 'text-synapse-400',
  dendrite: 'text-dendrite-400',
  myelin: 'text-myelin-400',
  neuron: 'text-neuron-400',
  cortex: 'text-cortex-400',
  axon: 'text-axon-400',
};

const STROKE_COLOR: Record<ColorFamily, string> = {
  synapse: 'stroke-synapse-400',
  dendrite: 'stroke-dendrite-400',
  myelin: 'stroke-myelin-400',
  neuron: 'stroke-neuron-400',
  cortex: 'stroke-cortex-400',
  axon: 'stroke-axon-400',
};

interface ITrend {
  direction: 'up' | 'down' | 'flat';
  delta?: string;
}

interface IMetricTileProps {
  label: string;
  value: string | number;
  trend?: ITrend;
  icon?: ReactNode;
  colorFamily?: ColorFamily;
  sparklineData?: number[];
  className?: string;
}

function Sparkline({
  data,
  colorFamily,
}: {
  data: number[];
  colorFamily: ColorFamily;
}): JSX.Element | null {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  const W = 48;
  const H = 16;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = range === 0 ? H / 2 : H - ((v - min) / range) * H;
      return `${String(x)},${String(y)}`;
    })
    .join(' ');

  return (
    <svg width={W} height={H} overflow="visible" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={STROKE_COLOR[colorFamily]}
      />
    </svg>
  );
}

const TREND_ICON: Record<ITrend['direction'], string> = {
  up: '^',
  down: 'v',
  flat: '>',
};

const TREND_COLOR: Record<ITrend['direction'], string> = {
  up: 'text-neuron-400',
  down: 'text-cortex-400',
  flat: 'text-axon-400',
};

export function MetricTile({
  label,
  value,
  trend,
  icon,
  colorFamily = 'synapse',
  sparklineData,
  className,
}: IMetricTileProps): JSX.Element {
  return (
    <Card className={cn('min-w-[120px]', className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-metric-label text-axon-400">{label}</span>
          {icon !== undefined && <span className="text-axon-400">{icon}</span>}
        </div>
        <div className="mt-1 flex items-end gap-2">
          <span className={cn('text-metric-value', TEXT_COLOR[colorFamily])}>{String(value)}</span>
          {trend !== undefined && (
            <span className={cn('text-caption mb-0.5', TREND_COLOR[trend.direction])}>
              {TREND_ICON[trend.direction]}
              {trend.delta !== undefined ? ` ${trend.delta}` : ''}
            </span>
          )}
        </div>
        {sparklineData !== undefined && (
          <div className="mt-2">
            <Sparkline data={sparklineData} colorFamily={colorFamily} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
