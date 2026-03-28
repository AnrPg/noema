'use client';
/**
 * @noema/web — /reviews
 *
 * Reviews Dashboard (Schedule Intelligence):
 *   1. Today's Plan — dual-lane split bar + Start CTA
 *   2. 7-Day Review Forecast — expandable bar chart
 *   3. Review Windows — day-planner time blocks
 *   4. Scheduling Simulator trigger button
 */
import * as React from 'react';
import { useAuth } from '@noema/auth';
import type { UserId } from '@noema/types';
import { TodaysPlan } from '@/components/reviews/todays-plan';
import { ReviewForecastFull } from '@/components/reviews/review-forecast-full';
import { ReviewStatsSummary } from '@/components/reviews/review-stats-summary';
import { ReviewWindows } from '@/components/reviews/review-windows';
import { SchedulingSimulator } from '@/components/reviews/scheduling-simulator';
import { useActiveStudyMode } from '@/hooks/use-active-study-mode';
import { getStudyModeDescription, getStudyModeLabel } from '@/lib/study-mode';

export default function ReviewsPage(): React.JSX.Element {
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;
  const activeStudyMode = useActiveStudyMode();
  const [showSimulator, setShowSimulator] = React.useState(false);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your personalized review schedule and forecasts for {getStudyModeLabel(activeStudyMode)}
            .
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {getStudyModeDescription(activeStudyMode)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowSimulator((prev) => !prev);
          }}
          aria-expanded={showSimulator}
          className={[
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            showSimulator
              ? 'bg-primary text-primary-foreground'
              : 'border border-border bg-background text-foreground hover:bg-muted',
          ].join(' ')}
        >
          {showSimulator ? 'Hide Simulator' : 'Simulate'}
        </button>
      </div>

      {/* Section 1 — Today's Plan */}
      <section aria-label="Today's plan">
        <TodaysPlan userId={userId} studyMode={activeStudyMode} />
      </section>

      {/* Section 2 — 7-Day Forecast */}
      <section aria-label="7-day review forecast">
        <ReviewForecastFull userId={userId} studyMode={activeStudyMode} />
      </section>

      {/* Section 3 — Review Analytics */}
      <section aria-label="Review analytics">
        <ReviewStatsSummary userId={userId} studyMode={activeStudyMode} />
      </section>

      {/* Section 4 — Review Windows */}
      <section aria-label="Suggested review windows">
        <ReviewWindows userId={userId} studyMode={activeStudyMode} />
      </section>

      {/* Section 5 — Scheduling Simulator (toggle) */}
      {showSimulator && (
        <section aria-label="Scheduling simulator">
          <SchedulingSimulator userId={userId} studyMode={activeStudyMode} />
        </section>
      )}
    </div>
  );
}
