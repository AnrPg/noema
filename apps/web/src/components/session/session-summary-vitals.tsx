'use client';

/**
 * @noema/web - Session / SessionSummaryVitals
 *
 * Key stats for a completed Step-loop session.
 */

import * as React from 'react';
import { MetricTile, NeuralGauge } from '@noema/ui';

// ============================================================================
// Types
// ============================================================================

interface ISessionSummaryVitalsProps {
  session: {
    startedAt: string;
    completedAt: string | null;
    mode: string;
  };
  stepStats?: {
    stepsPlanned: number;
    stepsEvaluated: number;
    stepsSkipped: number;
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Formats a duration in milliseconds as "Xh Ym" or "Ym" (or "< 1m" for very short).
 */
function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return '< 1m';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${String(hours)}h ${String(minutes)}m`;
  if (hours > 0) return `${String(hours)}h`;
  return `${String(minutes)}m`;
}

// ============================================================================
// SessionSummaryVitals
// ============================================================================

export function SessionSummaryVitals({
  session,
  stepStats,
}: ISessionSummaryVitalsProps): React.JSX.Element {
  const evaluatedSteps = stepStats?.stepsEvaluated ?? 0;
  const plannedSteps = stepStats?.stepsPlanned ?? 0;
  const skippedSteps = stepStats?.stepsSkipped ?? 0;
  const completion = plannedSteps > 0 ? Math.round((evaluatedSteps / plannedSteps) * 100) : 0;

  const startMs = new Date(session.startedAt).getTime();
  const endMs = session.completedAt !== null ? new Date(session.completedAt).getTime() : Date.now();
  const durationMs = Math.max(0, endMs - startMs);
  const timeSpent = formatDuration(durationMs);

  const modeLabel =
    session.mode.charAt(0).toUpperCase() + session.mode.slice(1).toLowerCase().replace(/_/g, ' ');

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {/* Total steps */}
      <MetricTile label="Steps Evaluated" value={evaluatedSteps} colorFamily="synapse" />

      {/* Completion */}
      <MetricTile
        label="Completion"
        value={`${String(completion)}%`}
        colorFamily="dendrite"
        icon={<NeuralGauge value={completion / 100} size="sm" showValue={false} />}
      />

      {/* Time spent */}
      <MetricTile label="Time Spent" value={timeSpent} colorFamily="myelin" />

      {/* Skipped steps */}
      <MetricTile label="Skipped" value={skippedSteps} colorFamily="cortex" />

      {/* Mode */}
      <MetricTile label="Mode" value={modeLabel} colorFamily="dendrite" />
    </div>
  );
}
