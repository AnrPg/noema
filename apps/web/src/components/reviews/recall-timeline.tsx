'use client';
/**
 * @noema/web — Reviews / RecallTimeline
 *
 * Timeline of past reviews for a card.
 * Each dot: date, grade, colored by result.
 */
import * as React from 'react';

export interface IReviewEvent {
  date: string;
  grade: number; // 1=Again, 2=Hard, 3=Good, 4=Easy
  responseTimeMs?: number | null;
}

export interface IRecallTimelineProps {
  events: IReviewEvent[];
}

const GRADE_COLOR: Record<number, string> = {
  1: 'bg-cortex-400',
  2: 'bg-amber-400',
  3: 'bg-synapse-400',
  4: 'bg-neuron-400',
};

const GRADE_LABEL: Record<number, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function RecallTimeline({ events }: IRecallTimelineProps): React.JSX.Element {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-6 text-xs text-muted-foreground">
        No review history yet.
      </div>
    );
  }

  return (
    <div className="relative" aria-label="Review history timeline">
      {/* Connector line */}
      <div className="absolute left-2 top-3 bottom-3 w-px bg-border" aria-hidden="true" />

      <ol className="flex flex-col gap-2.5">
        {events.map((ev, i) => {
          const dotColor = GRADE_COLOR[ev.grade] ?? 'bg-muted';
          const gradeLabel = GRADE_LABEL[ev.grade] ?? String(ev.grade);

          return (
            <li key={`${ev.date}-${String(i)}`} className="flex items-start gap-3 pl-1">
              {/* Dot */}
              <span
                className={[
                  'mt-1 h-3 w-3 flex-shrink-0 rounded-full border-2 border-background',
                  dotColor,
                ].join(' ')}
                title={gradeLabel}
              />
              {/* Content */}
              <div className="flex flex-1 items-center justify-between text-xs">
                <span className="text-muted-foreground">{formatDate(ev.date)}</span>
                <span
                  className={[
                    'font-medium',
                    ev.grade <= 1
                      ? 'text-cortex-400'
                      : ev.grade === 2
                        ? 'text-amber-500'
                        : ev.grade === 3
                          ? 'text-synapse-400'
                          : 'text-neuron-400',
                  ].join(' ')}
                >
                  {gradeLabel}
                </span>
                {ev.responseTimeMs !== null && ev.responseTimeMs !== undefined && (
                  <span className="text-muted-foreground tabular-nums">
                    {String(Math.round(ev.responseTimeMs / 1000))}s
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
