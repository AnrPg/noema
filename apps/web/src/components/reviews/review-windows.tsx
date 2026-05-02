'use client';
/**
 * @noema/web — Reviews / ReviewWindows
 *
 * Day-planner style view of today's suggested review time blocks.
 * Each block shows time range, concept count, and algorithm lane.
 */
import * as React from 'react';
import { useDueConcepts } from '@noema/api-client';
import type { StudyMode, UserId } from '@noema/types';
import { Loader2 } from 'lucide-react';

export interface IReviewWindowsProps {
  userId: UserId;
  studyMode: StudyMode;
}

function localDateStr(d: Date): string {
  const y = String(d.getFullYear());
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(startAt: string, endAt: string): string {
  const diffMs = new Date(endAt).getTime() - new Date(startAt).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${String(mins)}m`;
  return `${String(Math.floor(mins / 60))}h ${String(mins % 60)}m`;
}

interface IReviewWindowBlock {
  startAt: string;
  endAt: string;
  conceptsDue: number;
  lane: 'fsrs' | 'hlr';
  loadScore: number;
}

function buildReviewWindows(
  concepts: { dueAt: string; algorithm: string }[]
): IReviewWindowBlock[] {
  const today = localDateStr(new Date());
  const dueToday = concepts.filter((concept) => localDateStr(new Date(concept.dueAt)) === today);
  const fsrsCount = dueToday.filter((concept) => concept.algorithm === 'fsrs').length;
  const hlrCount = dueToday.filter((concept) => concept.algorithm === 'hlr').length;
  const total = Math.max(1, fsrsCount + hlrCount);

  return [
    { lane: 'fsrs' as const, conceptsDue: fsrsCount, startHour: 9 },
    { lane: 'hlr' as const, conceptsDue: hlrCount, startHour: 13 },
  ]
    .filter((block) => block.conceptsDue > 0)
    .map((block) => {
      const startAt = new Date(`${today}T${String(block.startHour).padStart(2, '0')}:00:00`);
      const durationMinutes = Math.max(20, block.conceptsDue * 2);
      const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
      return {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        conceptsDue: block.conceptsDue,
        lane: block.lane,
        loadScore: block.conceptsDue / total,
      };
    });
}

export function ReviewWindows({ userId, studyMode }: IReviewWindowsProps): React.JSX.Element {
  const dueConcepts = useDueConcepts({ studyMode, limit: 500 }, { enabled: userId !== '' });

  const todayWindows = React.useMemo(
    () => buildReviewWindows(dueConcepts.data?.data.concepts ?? []),
    [dueConcepts.data]
  );

  const isLoading = dueConcepts.isLoading;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Loading review windows…
      </div>
    );
  }

  if (todayWindows.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-8 text-sm text-muted-foreground">
        No review windows suggested for today.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card px-6 py-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">Suggested Review Windows</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Advisory time blocks — suggestions, not appointments.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {todayWindows.map((w, i) => {
          const { lane, loadScore, conceptsDue } = w;

          return (
            <div
              key={`${w.startAt}-${String(i)}`}
              className={[
                'flex items-center gap-4 rounded-lg border border-dashed px-4 py-3',
                lane === 'fsrs'
                  ? 'border-synapse-400/40 bg-synapse-400/5'
                  : 'border-myelin-400/40 bg-myelin-400/5',
              ].join(' ')}
            >
              {/* Time range */}
              <div className="min-w-[90px]">
                <p className="text-sm font-medium text-foreground tabular-nums">
                  {formatTime(w.startAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDuration(w.startAt, w.endAt)}
                </p>
              </div>

              {/* Lane badge */}
              <span
                className={[
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                  lane === 'fsrs'
                    ? 'bg-synapse-400/15 text-synapse-400'
                    : 'bg-myelin-400/15 text-myelin-400',
                ].join(' ')}
              >
                {lane.toUpperCase()}
              </span>

              {/* Card count */}
              <span className="flex-1 text-sm text-muted-foreground">
                {String(conceptsDue)} {conceptsDue === 1 ? 'concept' : 'concepts'}
              </span>

              {/* Load indicator */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                  <div
                    className={[
                      'h-full rounded-full transition-all',
                      lane === 'fsrs' ? 'bg-synapse-400' : 'bg-myelin-400',
                    ].join(' ')}
                    style={{ width: `${String(Math.round(loadScore * 100))}%` }}
                  />
                </div>
                <span>{String(Math.round(loadScore * 100))}% load</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
