/**
 * Session Detail Page
 *
 * Admin view of a single learning session: header with lifecycle state/study mode,
 * metadata card, and session stats/config.
 */

'use client';

import * as React from 'react';
import type { JSX } from 'react';
import type { UserDto } from '@noema/api-client';
import { useSession, usersApi } from '@noema/api-client';
import { getUserDisplayName } from '@noema/auth/user-display';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { formatDate, truncateId } from '@/lib/format';

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const STATE_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  PAUSED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  COMPLETED: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  ABANDONED: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300',
  EXPIRED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

function stateBadgeClass(state: string): string {
  return STATE_COLORS[state] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

const MODE_COLORS: Record<string, string> = {
  standard: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  cram: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  preview: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  test: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
};

function modeBadgeClass(mode: string): string {
  return MODE_COLORS[mode] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

// ---------------------------------------------------------------------------
// InfoRow helper
// ---------------------------------------------------------------------------

function InfoRow({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 text-sm py-1">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SessionDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const sessionId = params.id;

  const {
    data: sessionResponse,
    isLoading: sessionLoading,
    error: sessionError,
  } = useSession(sessionId as Parameters<typeof useSession>[0]);

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">Loading session details…</p>
      </div>
    );
  }

  if (sessionError !== null || sessionResponse === undefined) {
    return (
      <div className="space-y-4">
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => {
            router.back();
          }}
          type="button"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex items-center justify-center py-16">
          <p className="text-muted-foreground">Session not found.</p>
        </div>
      </div>
    );
  }

  const session = sessionResponse.data;

  const sessionUserId = session.userId;
  const sessionUserQuery = useQuery({
    queryKey: ['session-user', sessionUserId],
    queryFn: async (): Promise<UserDto | null> => {
      if (sessionUserId === '') return null;
      try {
        const response = await usersApi.getById(sessionUserId);
        return response.data;
      } catch {
        const searchCandidates = new Set<string>();
        searchCandidates.add(sessionUserId);
        if (sessionUserId.startsWith('user_')) {
          searchCandidates.add(sessionUserId.slice('user_'.length));
        }

        for (const candidate of searchCandidates) {
          const term = candidate.trim();
          if (term === '') continue;
          const list = await usersApi.list({ search: term }, { limit: 1 });
          if (list.data.items.length > 0) {
            return list.data.items[0] ?? null;
          }
        }
        return null;
      }
    },
    enabled: sessionUserId !== '',
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const sessionUser = sessionUserQuery.data ?? null;
  const sessionUserDisplayName = sessionUser ? getUserDisplayName(sessionUser) : '';

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/content"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Content
      </Link>

      {/* Session Header Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <code className="font-mono text-lg font-semibold" title={session.id}>
              {session.id}
            </code>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${stateBadgeClass(session.lifecycleState)}`}
            >
              {session.lifecycleState}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${modeBadgeClass(session.studyMode)}`}
            >
              {session.studyMode}
            </span>
          </div>
          <p className="text-sm text-muted-foreground pt-1">
            User:{' '}
            {sessionUser ? (
              <Link
                href={`/dashboard/users/${sessionUser.id}`}
                className="font-medium text-sm text-primary hover:underline"
              >
                {sessionUserDisplayName} (@{sessionUser.username})
              </Link>
            ) : sessionUserQuery.isLoading ? (
              <span className="font-mono text-xs text-muted-foreground">Loading user…</span>
            ) : (
              <span className="font-mono text-xs text-muted-foreground">
                {truncateId(session.userId)}
              </span>
            )}
          </p>
        </CardHeader>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Session Metadata */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Session Metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <InfoRow label="Session ID">
              <code className="font-mono text-xs">{session.id}</code>
            </InfoRow>
            <InfoRow label="Lifecycle">{session.lifecycleState}</InfoRow>
            <InfoRow label="Study mode">{session.studyMode}</InfoRow>
            <InfoRow label="Learning mode">{session.learningMode}</InfoRow>
            <InfoRow label="Curriculum ID">
              <code className="font-mono text-xs">{session.curriculumId}</code>
            </InfoRow>
            <InfoRow label="Curriculum version">
              {session.curriculumVersionId ?? '—'}
            </InfoRow>
            <InfoRow label="Pause count">{String(session.pauseCount)}</InfoRow>
            <InfoRow label="Total paused ms">{String(session.totalPausedMs)}</InfoRow>
            <InfoRow label="Started at">{formatDate(session.startedAt)}</InfoRow>
            <InfoRow label="Last activity">{formatDate(session.lastActivityAt)}</InfoRow>
            {session.completedAt !== null && (
              <InfoRow label="Completed at">{formatDate(session.completedAt)}</InfoRow>
            )}
            <InfoRow label="Termination reason">{session.terminationReason ?? '—'}</InfoRow>
            <InfoRow label="Version">{String(session.version)}</InfoRow>
            <InfoRow label="Created at">{formatDate(session.createdAt)}</InfoRow>
            <InfoRow label="Updated at">{formatDate(session.updatedAt)}</InfoRow>
          </CardContent>
        </Card>

        {/* Session Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Session Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <InfoRow label="Steps planned">{String(session.stats.stepsPlanned)}</InfoRow>
            <InfoRow label="Steps presented">{String(session.stats.stepsPresented)}</InfoRow>
            <InfoRow label="Steps evaluated">{String(session.stats.stepsEvaluated)}</InfoRow>
            <InfoRow label="Steps skipped">{String(session.stats.stepsSkipped)}</InfoRow>
          </CardContent>
        </Card>
      </div>

      {/* Session Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Session Config</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-4 text-xs">
            {JSON.stringify(session.config, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
