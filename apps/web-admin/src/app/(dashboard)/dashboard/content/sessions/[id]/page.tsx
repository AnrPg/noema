/**
 * Session Detail Page
 *
 * Admin view of a single learning session: header with state/mode, metadata
 * card, card-IDs list, and attempts log.
 */

'use client';

import * as React from 'react';
import type { JSX } from 'react';
import type { IAttemptDto } from '@noema/api-client';
import { useSession, useSessionAttempts } from '@noema/api-client';
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

function isAttemptDto(value: unknown): value is IAttemptDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate['id'] === 'string' &&
    typeof candidate['cardId'] === 'string' &&
    typeof candidate['reviewedAt'] === 'string'
  );
}

function getAttemptsFromResponse(value: unknown): IAttemptDto[] {
  if (Array.isArray(value)) {
    return value.filter(isAttemptDto);
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const candidate = value as Record<string, unknown>;
  const nestedAttempts = candidate['attempts'] ?? candidate['items'] ?? candidate['data'];

  if (nestedAttempts === value) {
    return [];
  }

  return getAttemptsFromResponse(nestedAttempts);
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

  const { data: attemptsResponse, isLoading: attemptsLoading } = useSessionAttempts(
    sessionId as Parameters<typeof useSessionAttempts>[0]
  );

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
  const attempts = getAttemptsFromResponse(attemptsResponse?.data);

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
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${stateBadgeClass(session.state)}`}
            >
              {session.state}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${modeBadgeClass(session.mode)}`}
            >
              {session.mode}
            </span>
          </div>
          <p className="text-sm text-muted-foreground pt-1">
            User:{' '}
            <Link
              href={`/dashboard/users/${session.userId}`}
              className="font-mono text-xs text-primary hover:underline"
            >
              {session.userId}
            </Link>
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
            <InfoRow label="State">{session.state}</InfoRow>
            <InfoRow label="Mode">{session.mode}</InfoRow>
            <InfoRow label="Card count">{String(session.cardIds.length)}</InfoRow>
            <InfoRow label="Current card index">{String(session.currentCardIndex)}</InfoRow>
            <InfoRow label="Started at">{formatDate(session.startedAt)}</InfoRow>
            <InfoRow label="Expires at">{formatDate(session.expiresAt)}</InfoRow>
            {session.pausedAt !== null && (
              <InfoRow label="Paused at">{formatDate(session.pausedAt)}</InfoRow>
            )}
            {session.completedAt !== null && (
              <InfoRow label="Completed at">{formatDate(session.completedAt)}</InfoRow>
            )}
            {session.abandonedAt !== null && (
              <InfoRow label="Abandoned at">{formatDate(session.abandonedAt)}</InfoRow>
            )}
            <InfoRow label="Created at">{formatDate(session.createdAt)}</InfoRow>
            <InfoRow label="Updated at">{formatDate(session.updatedAt)}</InfoRow>
          </CardContent>
        </Card>

        {/* Card IDs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Cards in Session ({String(session.cardIds.length)})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {session.cardIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cards in this session.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {session.cardIds.map((cardId, index) => (
                  <div key={cardId} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-6 text-right shrink-0">
                      {String(index + 1)}.
                    </span>
                    <code className="font-mono text-muted-foreground truncate" title={cardId}>
                      {truncateId(cardId)}
                    </code>
                    <code
                      className="font-mono text-muted-foreground/50 hidden lg:block truncate flex-1"
                      title={cardId}
                    >
                      {cardId}
                    </code>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Attempts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Attempts {attemptsLoading ? '…' : `(${String(attempts.length)})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attemptsLoading ? (
            <div className="py-4 text-center text-muted-foreground">Loading attempts…</div>
          ) : attempts.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground">No attempts recorded.</div>
          ) : (
            <>
              {/* Column headers */}
              <div className="flex items-center gap-3 pb-2 border-b text-xs font-medium text-muted-foreground">
                <span className="w-28 shrink-0">Attempt ID</span>
                <span className="w-28 shrink-0 hidden md:block">Card ID</span>
                <span className="shrink-0 w-12 text-right">Grade</span>
                <span className="shrink-0 w-16 text-right hidden sm:block">Conf. Before</span>
                <span className="shrink-0 w-16 text-right hidden sm:block">Conf. After</span>
                <span className="shrink-0 w-20 text-right hidden lg:block">Dwell (ms)</span>
                <span className="shrink-0 w-20 text-right">Reviewed</span>
              </div>
              <div className="divide-y">
                {attempts.map((attempt) => (
                  <div key={attempt.id} className="flex items-center gap-3 py-2 text-xs">
                    <span
                      className="font-mono text-muted-foreground shrink-0 w-28 truncate"
                      title={attempt.id}
                    >
                      {truncateId(attempt.id)}
                    </span>
                    <span
                      className="font-mono text-muted-foreground shrink-0 w-28 truncate hidden md:block"
                      title={attempt.cardId}
                    >
                      {truncateId(attempt.cardId)}
                    </span>
                    <span className="shrink-0 w-12 text-right font-medium">
                      {String(attempt.grade)}
                    </span>
                    <span className="shrink-0 w-16 text-right hidden sm:block text-muted-foreground">
                      {attempt.confidenceBefore !== null
                        ? attempt.confidenceBefore.toFixed(2)
                        : '—'}
                    </span>
                    <span className="shrink-0 w-16 text-right hidden sm:block text-muted-foreground">
                      {attempt.confidenceAfter !== null ? attempt.confidenceAfter.toFixed(2) : '—'}
                    </span>
                    <span className="shrink-0 w-20 text-right hidden lg:block text-muted-foreground">
                      {String(attempt.dwellTimeMs)}
                    </span>
                    <span className="shrink-0 w-20 text-right text-muted-foreground">
                      {formatDate(attempt.reviewedAt)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
