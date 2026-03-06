/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
'use client';
/**
 * @noema/web — Reviews / ReviewWindows
 *
 * Day-planner style view of today's suggested review time blocks.
 * Each block shows time range, card count, and lane.
 */
import * as React from 'react';
import { useReviewWindows } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { Loader2 } from 'lucide-react';

export interface IReviewWindowsProps {
  userId: UserId;
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

export function ReviewWindows({ userId }: IReviewWindowsProps): React.JSX.Element {
  const { data: windowsData, isLoading } = useReviewWindows({ userId }, { enabled: userId !== '' });

  const allWindows: any[] = (windowsData as any)?.data ?? [];

  // Only show today's windows
  const today = new Date();
  const todayStr = [
    String(today.getFullYear()),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  const todayWindows = React.useMemo(
    () =>
      allWindows.filter((w) => {
        const d = new Date(String(w.startAt));
        const ds = [
          String(d.getFullYear()),
          String(d.getMonth() + 1).padStart(2, '0'),
          String(d.getDate()).padStart(2, '0'),
        ].join('-');
        return ds === todayStr;
      }),
    [allWindows, todayStr]
  );

  if (isLoading === true) {
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
          const lane = String(w.lane) as 'retention' | 'calibration';
          const loadScore: number = (w.loadScore as number | undefined) ?? 0;
          const cardsDue: number = (w.cardsDue as number | undefined) ?? 0;

          return (
            <div
              key={`${String(w.startAt)}-${String(i)}`}
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
                  {formatTime(String(w.startAt))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDuration(String(w.startAt), String(w.endAt))}
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
