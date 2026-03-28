'use client';

import * as React from 'react';
import { useReviewStats, useSchedulerProgressSummary } from '@noema/api-client';
import type { StudyMode, UserId } from '@noema/types';
import { Loader2, TimerReset, TrendingUp } from 'lucide-react';
import { getStudyModeShortLabel } from '@/lib/study-mode';

export interface IReviewStatsSummaryProps {
  userId: UserId;
  studyMode: StudyMode;
}

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function formatMs(ms: number | null): string {
  if (ms === null || Number.isNaN(ms)) {
    return '—';
  }

  if (ms < 1000) {
    return String(Math.round(ms)) + 'ms';
  }

  return (ms / 1000).toFixed(1) + 's';
}

export function ReviewStatsSummary({
  userId,
  studyMode,
}: IReviewStatsSummaryProps): React.JSX.Element {
  const reviewedAfter = React.useMemo(() => daysAgoIso(30), []);
  const progress = useSchedulerProgressSummary({ studyMode }, { enabled: userId !== '' });
  const { data, isLoading } = useReviewStats(
    {
      userId,
      studyMode,
      reviewedAfter,
    },
    { enabled: userId !== '' }
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Loading review analytics…
      </div>
    );
  }

  const stats = data?.data;
  const totalReviews = stats?.totalReviews ?? 0;
  const outcomes = stats?.outcomeDistribution;
  const correctReviews = (outcomes?.correct ?? 0) + (outcomes?.partial ?? 0) * 0.5;
  const accuracy = totalReviews > 0 ? Math.round((correctReviews / totalReviews) * 100) : 0;
  const averageInterval = stats?.averageInterval ?? null;
  const calibrationDelta = stats?.averageCalibrationDelta ?? null;
  const summary = progress.data?.data;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Review Analytics</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Last 30 days in {getStudyModeShortLabel(studyMode)} mode.
          </p>
        </div>
        <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Mode-scoped
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Reviews</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
            {String(totalReviews)}
          </p>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Accuracy</p>
          <div className="mt-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-synapse-400" aria-hidden="true" />
            <p className="text-2xl font-bold tabular-nums text-foreground">{String(accuracy)}%</p>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg Response</p>
          <div className="mt-2 flex items-center gap-2">
            <TimerReset className="h-4 w-4 text-myelin-400" aria-hidden="true" />
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {formatMs(stats?.averageResponseTimeMs ?? null)}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg Interval</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
            {averageInterval !== null ? `${String(Math.round(averageInterval))}d` : '—'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Avg calibration delta: {calibrationDelta !== null ? calibrationDelta.toFixed(2) : '—'}
          </p>
        </div>
      </div>

      <div className="grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Due Right Now</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
            {String(summary?.dueNow ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {String(summary?.overdueCards ?? 0)} overdue today
          </p>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Tracked Coverage</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
            {summary !== undefined
              ? `${String(summary.trackedCards)}/${String(summary.totalCards)}`
              : '—'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {String(summary?.newCards ?? 0)} new · {String(summary?.matureCards ?? 0)} mature
          </p>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Readiness</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
            {summary?.averageRecallProbability !== null &&
            summary?.averageRecallProbability !== undefined
              ? `${String(Math.round(summary.averageRecallProbability * 100))}%`
              : '—'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {String(summary?.fragileCards ?? 0)} fragile · {String(summary?.strongRecallCards ?? 0)}{' '}
            strong
          </p>
        </div>
      </div>
    </div>
  );
}
