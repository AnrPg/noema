/**
 * @noema/ui - PulseIndicator
 *
 * Breathing status dot with 4 status states and optional label.
 */
import type { JSX } from 'react';
import { cn } from '../lib/utils.js';

type Status = 'active' | 'idle' | 'error' | 'offline';

// Static lookups — JIT-safe
const STATUS_COLOR: Record<Status, string> = {
  active: 'bg-neuron-400',
  idle: 'bg-axon-400',
  error: 'bg-cortex-400',
  offline: 'bg-axon-200',
};

const SIZE_CLASS: Record<'xs' | 'sm', string> = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2.5 w-2.5',
};

interface IPulseIndicatorProps {
  status: Status;
  size?: 'xs' | 'sm';
  label?: string;
  className?: string;
}

export function PulseIndicator({
  status,
  size = 'sm',
  label,
  className,
}: IPulseIndicatorProps): JSX.Element {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'rounded-full flex-shrink-0',
          STATUS_COLOR[status],
          SIZE_CLASS[size],
          status === 'active' && 'animate-pulse-glow'
        )}
      />
      {label !== undefined && <span className="text-caption text-axon-400">{label}</span>}
    </span>
  );
}
