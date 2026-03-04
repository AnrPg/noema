/**
 * @noema/ui - StateChip
 *
 * FSM state pill with configurable state maps and 5 built-in domain maps.
 */
import type { JSX, ReactNode } from 'react';
import { cn } from '../lib/utils.js';
import type { ColorFamily } from '../lib/types.js';

// BG tint and ring color lookups — static for Tailwind JIT
const BG_TINT: Record<ColorFamily, string> = {
  synapse: 'bg-synapse-400/15 text-synapse-400',
  dendrite: 'bg-dendrite-400/15 text-dendrite-400',
  myelin: 'bg-myelin-400/15 text-myelin-400',
  neuron: 'bg-neuron-400/15 text-neuron-400',
  cortex: 'bg-cortex-400/15 text-cortex-400',
  axon: 'bg-axon-400/15 text-axon-400',
};

const RING_COLOR: Record<ColorFamily, string> = {
  synapse: 'ring-synapse-400/40',
  dendrite: 'ring-dendrite-400/40',
  myelin: 'ring-myelin-400/40',
  neuron: 'ring-neuron-400/40',
  cortex: 'ring-cortex-400/40',
  axon: 'ring-axon-400/40',
};

export interface IStateConfig {
  label: string;
  color: ColorFamily;
  icon?: ReactNode;
}

export interface IStateChipProps {
  state: string;
  stateMap: Record<string, IStateConfig>;
  size?: 'sm' | 'md';
  pulse?: boolean;
  className?: string;
}

// ── Default state maps ────────────────────────────────────────────────────────

export const SESSION_STATE_MAP: Record<string, IStateConfig> = {
  ACTIVE: { label: 'Active', color: 'synapse' },
  PAUSED: { label: 'Paused', color: 'myelin' },
  COMPLETED: { label: 'Completed', color: 'neuron' },
  ABANDONED: { label: 'Abandoned', color: 'cortex' },
  EXPIRED: { label: 'Expired', color: 'axon' },
};

export const CARD_STATE_MAP: Record<string, IStateConfig> = {
  DRAFT: { label: 'Draft', color: 'axon' },
  ACTIVE: { label: 'Active', color: 'synapse' },
  SUSPENDED: { label: 'Suspended', color: 'myelin' },
  ARCHIVED: { label: 'Archived', color: 'axon' },
};

export const CARD_LEARNING_STATE_MAP: Record<string, IStateConfig> = {
  NEW: { label: 'New', color: 'dendrite' },
  LEARNING: { label: 'Learning', color: 'synapse' },
  REVIEW: { label: 'Review', color: 'myelin' },
  RELEARNING: { label: 'Relearning', color: 'cortex' },
};

export const MUTATION_STATE_MAP: Record<string, IStateConfig> = {
  PENDING: { label: 'Pending', color: 'axon' },
  IN_FLIGHT: { label: 'In Flight', color: 'synapse' },
  COMMITTED: { label: 'Committed', color: 'neuron' },
  REJECTED: { label: 'Rejected', color: 'cortex' },
  ROLLED_BACK: { label: 'Rolled Back', color: 'myelin' },
};

export const MISCONCEPTION_STATUS_MAP: Record<string, IStateConfig> = {
  DETECTED: { label: 'Detected', color: 'cortex' },
  ACKNOWLEDGED: { label: 'Acknowledged', color: 'myelin' },
  RESOLVING: { label: 'Resolving', color: 'synapse' },
  RESOLVED: { label: 'Resolved', color: 'neuron' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function StateChip({
  state,
  stateMap,
  size = 'md',
  pulse = false,
  className,
}: IStateChipProps): JSX.Element {
  const config: IStateConfig = stateMap[state] ?? {
    label: state,
    color: 'axon',
  };
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs gap-1' : 'px-2.5 py-1 text-xs gap-1.5';

  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        BG_TINT[config.color],
        sizeClass,
        pulse && 'ring-1 ring-offset-0 animate-pulse-glow',
        pulse && RING_COLOR[config.color],
        className
      )}
    >
      {config.icon !== undefined && config.icon}
      {config.label}
    </span>
  );
}
