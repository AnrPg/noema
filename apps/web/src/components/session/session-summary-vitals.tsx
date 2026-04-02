'use client';

/**
 * @noema/web - Session / SessionSummaryVitals
 *
 * Key stats for a completed session: total cards, accuracy gauge,
 * time spent, and mode badge.
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
    uniqueCardsReviewed?: number;
  };
  attempts: { grade: number; cardId?: string }[];
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

// Grade >= 3 counts as a passing attempt for accuracy calculation.
const PASSING_GRADE = 3;

// ============================================================================
// SessionSummaryVitals
// ============================================================================

export function SessionSummaryVitals({
  session,
  attempts,
}: ISessionSummaryVitalsProps): React.JSX.Element {
  const total = attempts.length;
  const uniqueCardCount =
    session.uniqueCardsReviewed ??
    new Set(
      attempts
        .map((attempt) => attempt.cardId)
        .filter((cardId): cardId is string => typeof cardId === 'string' && cardId !== '')
    ).size;
  const passing = attempts.filter((a) => a.grade >= PASSING_GRADE).length;
  const accuracy = total > 0 ? Math.round((passing / total) * 100) : 0;

  const startMs = new Date(session.startedAt).getTime();
  const endMs = session.completedAt !== null ? new Date(session.completedAt).getTime() : Date.now();
  const durationMs = Math.max(0, endMs - startMs);
  const timeSpent = formatDuration(durationMs);

  const modeLabel =
    session.mode.charAt(0).toUpperCase() + session.mode.slice(1).toLowerCase().replace(/_/g, ' ');

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total cards */}
      <MetricTile
        label="Cards Attempted"
        value={uniqueCardCount > 0 ? uniqueCardCount : total}
        colorFamily="synapse"
      />

      {/* Accuracy */}
      <MetricTile
        label="Accuracy"
        value={`${String(accuracy)}%`}
        colorFamily="dendrite"
        icon={<NeuralGauge value={accuracy} size="sm" showValue={false} />}
      />

      {/* Time spent */}
      <MetricTile label="Time Spent" value={timeSpent} colorFamily="myelin" />

      {/* Mode */}
      <MetricTile label="Mode" value={modeLabel} colorFamily="cortex" />
    </div>
  );
}
