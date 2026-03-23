'use client';

/**
 * @noema/web - Session / SessionBar
 *
 * Sticky top bar displayed during an active session (~48px tall).
 * Three sections: progress ring (left), timer + lane (center),
 * pause/resume + abandon dropdown (right).
 * Receives all data as props — no internal data fetching.
 */

import * as React from 'react';
import { Pause, Play, LogOut } from 'lucide-react';
import { Button, PulseIndicator, StateChip } from '@noema/ui';
import type { IStateConfig } from '@noema/ui';
import type { SessionId } from '@noema/types';

// ============================================================================
// Types
// ============================================================================

export interface ISessionBarProps {
  sessionId: SessionId;
  completed: number;
  total: number;
  elapsedMs: number;
  lane: 'retention' | 'calibration' | null;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onAbandon: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Formats elapsed milliseconds as a zero-padded mm:ss string.
 * e.g. 127_000 ms → "02:07"
 */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${mm}:${ss}`;
}

// ============================================================================
// Inline compact progress ring (32px, 3px stroke)
// ============================================================================

interface ICompactRingProps {
  percent: number; // 0–100
  completed: number;
  total: number;
}

function CompactProgressRing({ percent, completed, total }: ICompactRingProps): React.JSX.Element {
  const size = 32;
  const strokeWidth = 3;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const ratio = Math.min(1, Math.max(0, percent / 100));
  const filled = circumference * ratio;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${String(size)} ${String(size)}`}
        overflow="visible"
        aria-label={`Progress: ${String(completed)} of ${String(total)} cards`}
        role="meter"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-axon-400/20"
        />
        {/* Filled arc — starts at top (-90°) */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-synapse-400"
          strokeDasharray={`${String(filled)} ${String(circumference)}`}
          strokeLinecap="round"
          transform={`rotate(-90, ${String(cx)}, ${String(cy)})`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="text-[8px] font-semibold leading-none text-foreground tabular-nums">
          {String(completed)}
          <span className="opacity-50">/{String(total)}</span>
        </span>
      </span>
    </div>
  );
}

// ============================================================================
// Lane state map for StateChip
// ============================================================================

const LANE_STATE_MAP: Record<string, IStateConfig> = {
  retention: { label: 'Retention', color: 'synapse' },
  calibration: { label: 'Calibration', color: 'myelin' },
};

// ============================================================================
// SessionBar
// ============================================================================

export function SessionBar({
  completed,
  total,
  elapsedMs,
  lane,
  isPaused,
  onPause,
  onResume,
  onAbandon,
}: ISessionBarProps): React.JSX.Element {
  const percent = total > 0 ? (completed / total) * 100 : 0;
  const elapsed = formatElapsed(elapsedMs);

  return (
    <div
      className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      role="toolbar"
      aria-label="Session controls"
    >
      {/* ── Left: compact progress ring ───────────────────────────────── */}
      <div className="flex items-center gap-2">
        <CompactProgressRing percent={percent} completed={completed} total={total} />
      </div>

      {/* ── Center: pulse + timer + optional lane chip ─────────────────── */}
      <div className="flex items-center gap-2">
        <PulseIndicator status={isPaused ? 'idle' : 'active'} size="xs" />
        <span
          className="font-mono text-sm tabular-nums text-foreground"
          aria-label={`Elapsed time: ${elapsed}`}
        >
          {elapsed}
        </span>
        {lane !== null && (
          <StateChip
            state={lane}
            stateMap={LANE_STATE_MAP}
            size="sm"
            pulse={!isPaused && lane === 'retention'}
          />
        )}
      </div>

      {/* ── Right: pause/resume + stop control ───────────────────────── */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={isPaused ? 'Resume session' : 'Pause session'}
          onClick={isPaused ? onResume : onPause}
          className="h-8 w-8"
        >
          {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 text-destructive border-destructive/40 hover:border-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={onAbandon}
        >
          <LogOut className="h-4 w-4" />
          Stop session
        </Button>
      </div>
    </div>
  );
}
