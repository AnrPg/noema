'use client';

/**
 * @noema/web - Session History Page
 *
 * /sessions — filterable list of past study sessions.
 */

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import { Button } from '@noema/ui';
import type { SessionId } from '@noema/types';
import { useSessions } from '@noema/api-client';
import { useAbandonSession } from '@noema/api-client/session';
import { toast } from '@/hooks/use-toast';
import type { ISessionDto, SessionState } from '@noema/api-client';
import { useActiveStudyMode } from '@/hooks/use-active-study-mode';

// ============================================================================
// Helpers
// ============================================================================

const STATE_LABELS: Record<SessionState, string> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  ABANDONED: 'Abandoned',
  EXPIRED: 'Expired',
};

const STATE_CLASSES: Record<SessionState, string> = {
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  PAUSED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  COMPLETED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  ABANDONED: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
  EXPIRED: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(startedAt: string, completedAt: string | null): string {
  if (completedAt === null) return '\u2014';
  const diffMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const totalSec = Math.round(diffMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins === 0) return String(secs) + 's';
  return String(mins) + 'm ' + String(secs) + 's';
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ============================================================================
// Skeleton row
// ============================================================================

function SkeletonRow(): React.JSX.Element {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 animate-pulse">
      <div className="h-5 w-20 rounded-full bg-muted" />
      <div className="h-4 w-16 rounded bg-muted" />
      <div className="h-4 w-24 rounded bg-muted" />
      <div className="h-4 w-14 rounded bg-muted ml-auto" />
      <div className="h-4 w-12 rounded bg-muted" />
      <div className="h-4 w-4 rounded bg-muted" />
    </div>
  );
}

// ============================================================================
// Filter type
// ============================================================================

type FilterValue = '' | 'COMPLETED' | 'ABANDONED' | 'EXPIRED';

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: 'All sessions', value: '' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Abandoned', value: 'ABANDONED' },
  { label: 'Expired', value: 'EXPIRED' },
];

// ============================================================================
// Session row
// ============================================================================

interface ISessionRowProps {
  session: ISessionDto;
  onStop?: (sessionId: SessionId) => void;
  isStopping?: boolean;
}

function SessionRow({ session, onStop, isStopping }: ISessionRowProps): React.JSX.Element {
  const sessionId = session.id;
  const state = session.state;
  const mode = session.mode;
  const startedAt = session.startedAt;
  const completedAt = session.completedAt;
  const cardIds = session.cardIds;
  const isTerminable = state === 'ACTIVE' || state === 'PAUSED';
  const shouldShowStopButton = isTerminable && typeof onStop === 'function';

  return (
    <div
      className={[
        'group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors',
        'hover:border-foreground/20 hover:bg-muted/40 focus-within:border-foreground/40',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
      ].join(' ')}
    >
      <Link
        href={`/session/${sessionId}/summary`}
        className="flex flex-1 items-center gap-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {/* State badge */}
        <span
          className={[
            'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
            STATE_CLASSES[state],
          ].join(' ')}
        >
          {STATE_LABELS[state]}
        </span>

        {/* Mode */}
        <span className="text-sm font-medium text-foreground">{capitalize(mode)}</span>

        {/* Date */}
        <span className="text-sm text-muted-foreground">{formatDate(startedAt)}</span>

        {/* Spacer */}
        <span className="flex-1" />

        {/* Card count */}
        <span className="text-sm text-muted-foreground">
          {String(cardIds.length)} {cardIds.length === 1 ? 'card' : 'cards'}
        </span>

        {/* Duration */}
        <span className="w-16 text-right text-sm text-muted-foreground">
          {formatDuration(startedAt, completedAt)}
        </span>

        {/* Arrow */}
        <ArrowRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>

      {shouldShowStopButton && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 whitespace-nowrap text-destructive border-destructive/40 hover:border-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          disabled={Boolean(isStopping)}
          aria-label="Stop session"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onStop(sessionId);
          }}
        >
          {isStopping === true ? 'Stopping…' : 'Stop session'}
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function SessionsPage(): React.JSX.Element {
  const [stateFilter, setStateFilter] = React.useState<FilterValue>('');
  const activeStudyMode = useActiveStudyMode();

  const { data, isLoading, isError, error } = useSessions(
    stateFilter !== ''
      ? { state: stateFilter as SessionState, studyMode: activeStudyMode, limit: 50 }
      : { studyMode: activeStudyMode, limit: 50 }
  );

  const sessions: ISessionDto[] = data?.data ?? [];
  const [stoppingSessionId, setStoppingSessionId] = React.useState<string | null>(null);
  const abandonSession = useAbandonSession();

  const handleStopSession = (sessionId: SessionId): void => {
    if (
      !confirm(
        'Stop this session? Progress so far will be saved, but the session will be marked as abandoned.'
      )
    ) {
      return;
    }

    setStoppingSessionId(sessionId);
    abandonSession.mutate(sessionId, {
      onSuccess: () => {
        toast.success('Session stopped.');
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to stop the session.');
      },
      onSettled: () => {
        setStoppingSessionId(null);
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Session History</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading
              ? 'Loading sessions\u2026'
              : isError
                ? 'Failed to load sessions.'
                : [String(sessions.length), sessions.length === 1 ? 'session' : 'sessions'].join(
                    ' '
                  )}
          </p>
        </div>

        <Link
          href={'/session/new'}
          className={[
            'inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5',
            'text-sm font-medium text-primary-foreground transition-colors',
            'hover:bg-primary/90',
            'focus:outline-none focus:ring-2 focus:ring-ring',
          ].join(' ')}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Start Session
        </Link>
      </div>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setStateFilter(f.value);
            }}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-ring',
              stateFilter === f.value
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-background text-foreground hover:bg-muted',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error instanceof Error ? error.message : 'An error occurred while loading sessions.'}
        </div>
      )}

      {/* Session list */}
      <div className="flex flex-col gap-2">
        {isLoading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
            <p className="text-sm text-muted-foreground">No sessions yet.</p>
            <Link
              href={'/session/new'}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Start your first session
            </Link>
          </div>
        ) : (
          sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onStop={handleStopSession}
              isStopping={stoppingSessionId === session.id && abandonSession.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}
