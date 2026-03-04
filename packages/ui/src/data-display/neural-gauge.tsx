/**
 * @noema/ui - NeuralGauge
 *
 * 270° SVG arc gauge for 0–1 scalar values.
 */
import type { JSX } from 'react';
import { cn } from '../lib/utils.js';
import type { ColorFamily } from '../lib/types.js';

const SIZE_MAP = {
  sm: { svgSize: 80, r: 30, strokeWidth: 6, cx: 40, cy: 40 },
  md: { svgSize: 112, r: 42, strokeWidth: 8, cx: 56, cy: 56 },
  lg: { svgSize: 160, r: 60, strokeWidth: 10, cx: 80, cy: 80 },
} as const;

// Static class lookup — dynamic Tailwind class strings are JIT-unsafe
const STROKE_COLOR: Record<ColorFamily, string> = {
  synapse: 'stroke-synapse-400',
  dendrite: 'stroke-dendrite-400',
  myelin: 'stroke-myelin-400',
  neuron: 'stroke-neuron-400',
  cortex: 'stroke-cortex-400',
  axon: 'stroke-axon-400',
};

interface INeuralGaugeProps {
  value: number; // 0–1
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  colorFamily?: ColorFamily;
  showValue?: boolean;
  animate?: boolean;
  className?: string;
}

export function NeuralGauge({
  value,
  label,
  size = 'md',
  colorFamily = 'synapse',
  showValue = true,
  animate = true,
  className,
}: INeuralGaugeProps): JSX.Element {
  const clamped = Math.min(1, Math.max(0, value));
  const { svgSize, r, strokeWidth, cx, cy } = SIZE_MAP[size];
  const circumference = 2 * Math.PI * r;
  const gaugeArc = circumference * 0.75; // 270° sweep
  const filledArc = gaugeArc * clamped;
  const isHighValue = clamped > 0.8;

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <svg
        width={svgSize}
        height={svgSize}
        viewBox={`0 0 ${String(svgSize)} ${String(svgSize)}`}
        aria-label={`${label ?? 'Gauge'}: ${String(Math.round(clamped * 100))}%`}
        role="img"
      >
        {/* Background track arc */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-axon-200"
          strokeDasharray={`${String(gaugeArc)} ${String(circumference - gaugeArc)}`}
          strokeLinecap="round"
          transform={`rotate(135, ${String(cx)}, ${String(cy)})`}
        />
        {/* Filled arc — value portion */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          className={cn(
            STROKE_COLOR[colorFamily],
            animate && 'animate-ring-fill',
            isHighValue && 'animate-pulse-glow'
          )}
          strokeDasharray={`${String(filledArc)} ${String(circumference - filledArc)}`}
          strokeLinecap="round"
          transform={`rotate(135, ${String(cx)}, ${String(cy)})`}
        />
        {showValue && (
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            className="font-mono font-semibold text-sm"
            style={{ fill: `hsl(var(--${colorFamily}-400))` }}
          >
            {String(Math.round(clamped * 100))}%
          </text>
        )}
      </svg>
      {label !== undefined && <span className="text-caption text-axon-400">{label}</span>}
    </div>
  );
}
