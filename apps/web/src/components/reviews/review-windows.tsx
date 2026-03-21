'use client';
/**
 * @noema/web — Reviews / ReviewWindows
 *
 * Day-planner style view of today's suggested review time blocks.
 * Each block shows time range, card count, and lane.
 */
import * as React from 'react';
import { useReviewQueue } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { Loader2 } from 'lucide-react';

export interface IReviewWindowsProps {
  userId: UserId;
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
  cardsDue: number;
  lane: 'retention' | 'calibration';
  loadScore: number;
}

function buildReviewWindows(
  retentionDue: number,
  calibrationDue: number,
  totalDue: number
): IReviewWindowBlock[] {
  const today = localDateStr(new Date());
  const blocks: IReviewWindowBlock[] = [];
  const definitions = [
    { lane: 'retention' as const, cardsDue: retentionDue, startHour: 9 },
    { lane: 'calibration' as const, cardsDue: calibrationDue, startHour: 13 },
  ].filter((block) => block.cardsDue > 0);

  for (const block of definitions) {
    const durationMinutes = Math.max(20, block.cardsDue * 2);
    const startAt = new Date(`${today}T${String(block.startHour).padStart(2, '0')}:00:00`);
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
    blocks.push({
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      cardsDue: block.cardsDue,
      lane: block.lane,
      loadScore: totalDue > 0 ? block.cardsDue / totalDue : 0,
    });
  }

  return blocks;
}

export function ReviewWindows({ userId }: IReviewWindowsProps): React.JSX.Element {
  const { data: queueData, isLoading } = useReviewQueue({ limit: 500 }, { enabled: userId !== '' });

  const todayWindows = React.useMemo(() => {
    const queue = queueData?.data;
    return buildReviewWindows(
      queue?.retentionDue ?? 0,
      queue?.calibrationDue ?? 0,
      queue?.totalDue ?? 0
    );
  }, [queueData]);

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
          const { lane, loadScore, cardsDue } = w;

          return (
            <div
              key={`${w.startAt}-${String(i)}`}
              className={[
                'flex items-center gap-4 rounded-lg border border-dashed px-4 py-3',
                lane === 'retention'
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
                  lane === 'retention'
                    ? 'bg-synapse-400/15 text-synapse-400'
                    : 'bg-myelin-400/15 text-myelin-400',
                ].join(' ')}
              >
                {lane}
              </span>

              {/* Card count */}
              <span className="flex-1 text-sm text-muted-foreground">
                {String(cardsDue)} {cardsDue === 1 ? 'card' : 'cards'}
              </span>

              {/* Load indicator */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                  <div
                    className={[
                      'h-full rounded-full transition-all',
                      lane === 'retention' ? 'bg-synapse-400' : 'bg-myelin-400',
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
