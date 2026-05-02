'use client';

import * as React from 'react';
import { useDueConcepts } from '@noema/api-client';
import type { StudyMode, UserId } from '@noema/types';
import { CalendarClock, Layers, Loader2, TimerReset, TrendingUp } from 'lucide-react';
import { getStudyModeShortLabel } from '@/lib/study-mode';

export interface IReviewStatsSummaryProps {
  userId: UserId;
  studyMode: StudyMode;
}

export function ReviewStatsSummary({
  userId,
  studyMode,
}: IReviewStatsSummaryProps): React.JSX.Element {
  const { data, isLoading } = useDueConcepts({ studyMode, limit: 200 }, { enabled: userId !== '' });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Loading review analytics…
      </div>
    );
  }

  const concepts = data?.data.concepts ?? [];
  const totalDue = concepts.length;
  const trackedConcepts = concepts.filter((concept) => concept.reviewCount > 0).length;
  const averageInterval =
    concepts.length > 0
      ? concepts.reduce((sum, concept) => sum + concept.intervalDays, 0) / concepts.length
      : null;
  const averageHalfLifeValues = concepts
    .map((concept) => concept.halfLife)
    .filter((value): value is number => value !== null);
  const averageHalfLife =
    averageHalfLifeValues.length > 0
      ? averageHalfLifeValues.reduce((sum, value) => sum + value, 0) / averageHalfLifeValues.length
      : null;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Review Analytics</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Concept schedule snapshot in {getStudyModeShortLabel(studyMode)} mode.
          </p>
        </div>
        <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Mode-scoped
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Due Concepts</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{String(totalDue)}</p>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Tracked</p>
          <div className="mt-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-synapse-400" aria-hidden="true" />
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {String(trackedConcepts)}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg Half-Life</p>
          <div className="mt-2 flex items-center gap-2">
            <TimerReset className="h-4 w-4 text-myelin-400" aria-hidden="true" />
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {averageHalfLife !== null ? `${String(Math.round(averageHalfLife))}d` : '—'}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg Interval</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
            {averageInterval !== null ? `${String(Math.round(averageInterval))}d` : '—'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Across due concepts</p>
        </div>
      </div>

      <div className="grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Due Right Now</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{String(totalDue)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {String(
              concepts.filter((concept) => new Date(concept.dueAt).getTime() < Date.now()).length
            )}{' '}
            overdue now
          </p>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">FSRS Concepts</p>
          <div className="mt-2 flex items-center gap-2">
            <Layers className="h-4 w-4 text-synapse-400" aria-hidden="true" />
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {String(concepts.filter((concept) => concept.algorithm === 'fsrs').length)}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Retention scheduling state</p>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">HLR Concepts</p>
          <div className="mt-2 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-myelin-400" aria-hidden="true" />
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {String(concepts.filter((concept) => concept.algorithm === 'hlr').length)}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Calibration scheduling state</p>
        </div>
      </div>
    </div>
  );
}
