'use client';
/**
 * @noema/web — Reviews / TodaysPlan
 *
 * Dual-lane plan visualization for today's review session.
 * Shows retention vs calibration counts as a split bar + "Start" CTA.
 */
import * as React from 'react';
import Link from 'next/link';
import { useReviewQueue } from '@noema/api-client';
import type { StudyMode, UserId } from '@noema/types';
import { Button } from '@noema/ui';
import { Loader2, PlayCircle } from 'lucide-react';

export interface ITodaysPlanProps {
  userId: UserId;
  studyMode: StudyMode;
}

export function TodaysPlan({ userId, studyMode }: ITodaysPlanProps): React.JSX.Element {
  const { data: queueData, isLoading } = useReviewQueue(
    { limit: 500, studyMode },
    { enabled: userId !== '' }
  );

  const queue = queueData?.data;
  const totalRetention = queue?.retentionDue ?? 0;
  const totalCalibration = queue?.calibrationDue ?? 0;
  const total = totalRetention + totalCalibration;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Loading today's plan…
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center">
        <span className="text-4xl" role="img" aria-label="Celebration">
          🎉
        </span>
        <h3 className="text-lg font-semibold text-foreground">All caught up!</h3>
        <p className="text-sm text-muted-foreground">
          Your memory is consolidating. No reviews due today.
        </p>
      </div>
    );
  }

  const retentionPct = total > 0 ? Math.round((totalRetention / total) * 100) : 50;
  const calibrationPct = 100 - retentionPct;

  // Estimate: ~2 min per card average
  const estimatedMinutes = Math.round(total * 2);
  const estimatedLabel =
    estimatedMinutes < 60
      ? `~${String(estimatedMinutes)}m`
      : `~${String(Math.floor(estimatedMinutes / 60))}h ${String(estimatedMinutes % 60)}m`;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card px-6 py-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Today's Review Plan</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {String(total)} cards · {estimatedLabel}
          </p>
        </div>
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/session/new">
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            Start Today's Review
          </Link>
        </Button>
      </div>

      {/* Split bar */}
      <div className="flex overflow-hidden rounded-lg" style={{ height: '40px' }}>
        <div
          className="flex flex-col items-center justify-center bg-synapse-400/80 transition-all"
          style={{ width: `${String(retentionPct)}%` }}
        >
          <span className="text-xs font-semibold text-white">{String(totalRetention)}</span>
          <span className="text-[10px] text-white/80">Retention</span>
        </div>
        <div
          className="flex flex-col items-center justify-center bg-myelin-400/80 transition-all"
          style={{ width: `${String(calibrationPct)}%` }}
        >
          <span className="text-xs font-semibold text-white">{String(totalCalibration)}</span>
          <span className="text-[10px] text-white/80">Calibration</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-synapse-400" />
          Retention (FSRS)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-myelin-400" />
          Calibration (HLR)
        </span>
      </div>
    </div>
  );
}
