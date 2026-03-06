/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-unsafe-call */
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
import { ReviewWindows } from '@/components/reviews/review-windows';
import { SchedulingSimulator } from '@/components/reviews/scheduling-simulator';

export default function ReviewsPage(): React.JSX.Element {
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;
  const [showSimulator, setShowSimulator] = React.useState(false);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your personalized review schedule and forecasts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowSimulator((prev) => !prev);
          }}
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
        <TodaysPlan userId={userId} />
      </section>

      {/* Section 2 — 7-Day Forecast */}
      <section aria-label="7-day review forecast">
        <ReviewForecastFull userId={userId} />
      </section>

      {/* Section 3 — Review Windows */}
      <section aria-label="Suggested review windows">
        <ReviewWindows userId={userId} />
      </section>

      {/* Section 4 — Scheduling Simulator (toggle) */}
      {showSimulator && (
        <section aria-label="Scheduling simulator">
          <SchedulingSimulator userId={userId} />
        </section>
      )}
    </div>
  );
}
