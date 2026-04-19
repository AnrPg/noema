/**
 * @noema/ui - NeuralGauge
 *
 * Shared speedometer-style SVG gauge for 0–1 scalar values.
 */
import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { cn } from '../lib/utils.js';
import type { ColorFamily } from '../lib/types.js';

const SIZE_MAP = {
  sm: { svgWidth: 80, svgHeight: 52, r: 30, strokeWidth: 6, cx: 40, cy: 40, valueBottom: 2 },
  md: {
    svgWidth: 112,
    svgHeight: 72,
    r: 42,
    strokeWidth: 8,
    cx: 56,
    cy: 56,
    valueBottom: 4,
  },
  lg: {
    svgWidth: 160,
    svgHeight: 102,
    r: 60,
    strokeWidth: 10,
    cx: 80,
    cy: 80,
    valueBottom: 6,
  },
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
  valueLabel?: ReactNode;
  animate?: boolean;
  className?: string;
}

export function NeuralGauge({
  value,
  label,
  size = 'md',
  colorFamily = 'synapse',
  showValue = true,
  valueLabel,
  animate = true,
  className,
}: INeuralGaugeProps): JSX.Element {
  const clamped = Math.min(1, Math.max(0, value));
  const [displayedValue, setDisplayedValue] = useState(animate ? 0 : clamped);
  const { svgWidth, svgHeight, r, strokeWidth, cx, cy, valueBottom } = SIZE_MAP[size];
  const path = `M ${String(cx - r)} ${String(cy)} A ${String(r)} ${String(r)} 0 0 1 ${String(cx + r)} ${String(cy)}`;

  useEffect(() => {
    if (!animate) {
      setDisplayedValue(clamped);
      return;
    }

    const frame = requestAnimationFrame(() => {
      setDisplayedValue(clamped);
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [animate, clamped]);

  const visibleValue = showValue || valueLabel !== undefined;
  const resolvedValueLabel = valueLabel ?? `${String(Math.round(clamped * 100))}%`;

  return (
    <div className={cn('inline-flex flex-col items-center gap-1', className)}>
      <div className="relative" style={{ width: svgWidth, height: svgHeight }}>
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${String(svgWidth)} ${String(svgHeight)}`}
          aria-label={`${label ?? 'Gauge'}: ${String(Math.round(clamped * 100))}%`}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(clamped * 100)}
        >
          <path
            d={path}
            fill="none"
            pathLength={100}
            strokeWidth={strokeWidth}
            className="stroke-axon-200/70"
            strokeLinecap="round"
          />
          <path
            d={path}
            fill="none"
            pathLength={100}
            strokeWidth={strokeWidth}
            className={STROKE_COLOR[colorFamily]}
            strokeLinecap="round"
            strokeDasharray="100"
            strokeDashoffset={100 - displayedValue * 100}
            style={{
              transition: animate ? 'stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1)' : undefined,
            }}
          />
        </svg>
        {visibleValue && (
          <div
            className="pointer-events-none absolute inset-x-0 flex justify-center"
            style={{ bottom: valueBottom }}
          >
            <span
              className={cn(
                'font-mono font-semibold leading-none',
                size === 'sm' ? 'text-[11px]' : size === 'md' ? 'text-sm' : 'text-lg'
              )}
              style={{ color: `hsl(var(--${colorFamily}-400))` }}
            >
              {resolvedValueLabel}
            </span>
          </div>
        )}
      </div>
      {label !== undefined && <span className="text-caption text-axon-400">{label}</span>}
    </div>
  );
}
