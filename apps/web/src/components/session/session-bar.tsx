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
import { Button, NeuralGauge, PulseIndicator, StateChip } from '@noema/ui';
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
      className="sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:flex-nowrap sm:justify-between sm:gap-3 sm:px-4"
      role="toolbar"
      aria-label="Session controls"
    >
      {/* ── Left: compact progress ring ───────────────────────────────── */}
      <div className="flex items-center gap-2">
        <NeuralGauge
          value={percent / 100}
          size="sm"
          animate
          valueLabel={
            <span className="text-[8px] tabular-nums text-foreground">
              {String(completed)}
              <span className="opacity-50">/{String(total)}</span>
            </span>
          }
          className="shrink-0"
        />
      </div>

      {/* ── Center: pulse + timer + optional lane chip ─────────────────── */}
      <div className="order-3 flex w-full min-w-0 items-center justify-center gap-2 sm:order-2 sm:w-auto sm:flex-1 sm:flex-none">
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
      <div className="order-2 ml-auto flex items-center justify-end gap-2 sm:order-3 sm:w-auto">
        <Button
          variant="ghost"
          size="icon"
          aria-label={isPaused ? 'Resume session' : 'Pause session'}
          onClick={isPaused ? onResume : onPause}
          className="h-8 w-8 shrink-0"
        >
          {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 border-destructive/40 px-3 text-destructive hover:border-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-4"
          onClick={onAbandon}
        >
          <LogOut className="h-4 w-4" />
          <span className="sm:hidden">Stop</span>
          <span className="hidden sm:inline">Stop session</span>
        </Button>
      </div>
    </div>
  );
}
