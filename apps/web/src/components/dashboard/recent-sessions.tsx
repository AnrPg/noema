/**
 * Recent Sessions Panel
 *
 * Lists the 5 most recent study sessions with state chips, mode badges,
 * card progress, and a NeuralGauge showing completion percentage.
 */

'use client';

import { useSessions } from '@noema/api-client';
import type { ISessionDto, SessionMode, UserDto } from '@noema/api-client';
import type { StudyMode } from '@noema/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  NeuralGauge,
  SESSION_STATE_MAP,
  Skeleton,
  StateChip,
} from '@noema/ui';
import { BookOpen, FlaskConical, Layers, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

type UserId = UserDto['id'];

function ensureSessions(value: unknown): ISessionDto[] {
  return Array.isArray(value) ? (value as ISessionDto[]) : [];
}

// ============================================================================
// Constants
// ============================================================================

const SESSION_MODE_LABEL: Record<SessionMode, string> = {
  standard: 'Standard',
  cram: 'Cram',
  preview: 'Preview',
  test: 'Test',
};

const SESSION_MODE_ICON: Record<SessionMode, LucideIcon> = {
  standard: BookOpen,
  cram: Layers,
  preview: FlaskConical,
  test: Target,
};

// Mode badge background colors — static for Tailwind JIT
const MODE_BADGE_CLASS: Record<SessionMode, string> = {
  standard: 'bg-synapse-400/10 text-synapse-400',
  cram: 'bg-cortex-400/10 text-cortex-400',
  preview: 'bg-dendrite-400/10 text-dendrite-400',
  test: 'bg-myelin-400/10 text-myelin-400',
};

// ============================================================================
// Helpers
// ============================================================================

function relativeTime(dateStr: string): string {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  // Derive each unit directly from diffMs to avoid double-rounding at threshold boundaries
  const diffMs = new Date(dateStr).getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffMs / 60_000);
  const diffHr = Math.round(diffMs / 3_600_000);
  const diffDay = Math.round(diffMs / 86_400_000);

  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, 'second');
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, 'hour');
  return rtf.format(diffDay, 'day');
}

function sessionProgress(session: ISessionDto): number {
  if (session.state === 'COMPLETED') return 100;
  if (session.cardIds.length === 0) return 0;
  return Math.round((session.currentCardIndex / session.cardIds.length) * 100);
}

// ============================================================================
// SessionRow
// ============================================================================

interface ISessionRowProps {
  session: ISessionDto;
  onClick: () => void;
}

function SessionRow({ session, onClick }: ISessionRowProps): React.JSX.Element {
  const ModeIcon = SESSION_MODE_ICON[session.mode];
  const progress = sessionProgress(session);
  const cardCount = session.cardIds.length;
  const modeClass = MODE_BADGE_CLASS[session.mode];

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg px-3 py-3 text-left transition-colors hover:bg-axon-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synapse-400"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StateChip state={session.state} stateMap={SESSION_STATE_MAP} size="sm" />
            <span
              className={`inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${modeClass}`}
            >
              <ModeIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{SESSION_MODE_LABEL[session.mode]}</span>
            </span>
            <span className="shrink-0 text-xs text-axon-400">{relativeTime(session.startedAt)}</span>
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-axon-400">
            <span className="tabular-nums">
              {String(session.currentCardIndex)}/{String(cardCount)} cards
            </span>
            <span>{String(progress)}% complete</span>
          </div>
        </div>

        <NeuralGauge
          value={progress / 100}
          size="sm"
          animate
          valueLabel={`${String(progress)}%`}
          className="shrink-0"
        />
      </div>
    </button>
  );
}

// ============================================================================
// Skeleton rows
// ============================================================================

function SessionRowSkeleton(): React.JSX.Element {
  return (
    <div className="flex items-center gap-4 px-3 py-2">
      <Skeleton variant="rect" className="h-5 w-16 rounded-full" />
      <Skeleton variant="rect" className="h-5 w-16 rounded-full" />
      <Skeleton variant="text" className="flex-1" />
      <Skeleton variant="circle" className="h-10 w-10 shrink-0" />
      <Skeleton variant="rect" className="h-4 w-14 shrink-0" />
    </div>
  );
}

// ============================================================================
// RecentSessions
// ============================================================================

interface IRecentSessionsProps {
  userId: UserId;
  studyMode: StudyMode;
}

/**
 * `userId` is accepted for API interface parity with sibling dashboard components.
 * `useSessions` is auth-scoped and does not accept a userId filter — the prop is
 * reserved for when the API adds per-user scoped access (e.g. admin view of another
 * user's sessions). Until then the underscore prefix suppresses the unused-variable lint rule.
 */
export function RecentSessions({
  userId: _userId,
  studyMode,
}: IRecentSessionsProps): React.JSX.Element {
  const router = useRouter();
  const { data, isLoading } = useSessions({ limit: 5, studyMode });

  const sessions: ISessionDto[] = [...ensureSessions(data?.data)]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Sessions</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        {isLoading ? (
          <div className="flex flex-col gap-1">
            <SessionRowSkeleton />
            <SessionRowSkeleton />
            <SessionRowSkeleton />
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            title="No sessions yet"
            description="Start your first study session!"
            action={{
              label: 'Start studying',
              onClick: () => {
                router.push('/session/new');
              },
            }}
          />
        ) : (
          <div className="flex flex-col gap-1">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onClick={() => {
                  // Navigate to session summary. A dedicated session detail page
                  // is planned for a future phase; summary is the closest equivalent.
                  router.push(`/session/${session.id}/summary`);
                }}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
