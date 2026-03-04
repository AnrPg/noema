/**
 * @noema/ui - ProgressRing
 *
 * Concentric SVG rings for multi-dimensional progress display.
 */
import type { JSX, ReactNode } from 'react';
import { cn } from '../lib/utils.js';
import type { ColorFamily } from '../lib/types.js';

const SIZE_MAP = {
  sm: { svgSize: 80, baseR: 28, strokeWidth: 6, gap: 4, cx: 40, cy: 40 },
  md: { svgSize: 120, baseR: 44, strokeWidth: 8, gap: 5, cx: 60, cy: 60 },
  lg: { svgSize: 160, baseR: 60, strokeWidth: 9, gap: 6, cx: 80, cy: 80 },
} as const;

// Static lookup maps for JIT safety
const STROKE_COLOR: Record<ColorFamily, string> = {
  synapse: 'stroke-synapse-400',
  dendrite: 'stroke-dendrite-400',
  myelin: 'stroke-myelin-400',
  neuron: 'stroke-neuron-400',
  cortex: 'stroke-cortex-400',
  axon: 'stroke-axon-400',
};

interface IRing {
  value: number;
  max: number;
  color: ColorFamily;
  label: string;
}

interface IProgressRingProps {
  rings: IRing[];
  size?: 'sm' | 'md' | 'lg';
  centerContent?: ReactNode;
  className?: string;
}

export function ProgressRing({
  rings,
  size = 'md',
  centerContent,
  className,
}: IProgressRingProps): JSX.Element {
  const { svgSize, baseR, strokeWidth, gap, cx, cy } = SIZE_MAP[size];
  const ringStep = strokeWidth + gap;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        width={svgSize}
        height={svgSize}
        viewBox={`0 0 ${String(svgSize)} ${String(svgSize)}`}
        aria-label="Progress rings"
        role="img"
      >
        {rings.map((ring, i) => {
          const r = baseR - i * ringStep;
          if (r <= 0) return null;
          const circumference = 2 * Math.PI * r;
          const ratio = Math.min(1, Math.max(0, ring.value / ring.max));
          const filled = circumference * ratio;

          return (
            <g key={ring.label}>
              {/* Background track */}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                strokeWidth={strokeWidth}
                className={cn(STROKE_COLOR[ring.color], 'opacity-10')}
              />
              {/* Filled arc — starts at top (−90°) */}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                strokeWidth={strokeWidth}
                className={cn(STROKE_COLOR[ring.color], 'animate-ring-fill')}
                strokeDasharray={`${String(filled)} ${String(circumference)}`}
                strokeLinecap="round"
                transform={`rotate(-90, ${String(cx)}, ${String(cy)})`}
                style={{ animationDelay: `${String(i * 100)}ms` }}
              />
            </g>
          );
        })}
      </svg>
      {centerContent !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center">{centerContent}</div>
      )}
    </div>
  );
}
