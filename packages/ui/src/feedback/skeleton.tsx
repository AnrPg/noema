/**
 * @noema/ui - Skeleton
 *
 * Loading placeholder with shimmer animation for 6 variants.
 */
import type { JSX } from 'react';
import { cn } from '../lib/utils.js';

type SkeletonVariant = 'text' | 'circle' | 'rect' | 'metric-tile' | 'card' | 'graph-node';

const VARIANT_BASE: Record<SkeletonVariant, string> = {
  text: 'h-4 w-full rounded',
  circle: 'rounded-full',
  rect: 'rounded-lg',
  'metric-tile': 'h-20 w-32 rounded-lg',
  card: 'h-40 w-full rounded-lg',
  'graph-node': 'h-8 w-8 rounded-full',
};

interface ISkeletonProps {
  variant: SkeletonVariant;
  width?: string;
  height?: string;
  className?: string;
}

export function Skeleton({ variant, width, height, className }: ISkeletonProps): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn('shimmer bg-axon-100', VARIANT_BASE[variant], className)}
      style={{ width, height }}
    />
  );
}
