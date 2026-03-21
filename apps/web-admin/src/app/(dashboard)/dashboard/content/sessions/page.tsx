/**
 * Sessions List Page
 *
 * Admin view of all learning sessions: ID, user, status, mode, created date,
 * and a "View" link to the session detail page.
 */

'use client';

import * as React from 'react';
import { type JSX } from 'react';
import type { ISessionDto } from '@noema/api-client';
import { useSessions } from '@noema/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';
import Link from 'next/link';
import { formatDate, truncateId } from '@/lib/format';

// ---------------------------------------------------------------------------
// Helpers
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
// Session Row
// ---------------------------------------------------------------------------

function SessionRow({ session }: { session: ISessionDto }): React.JSX.Element {
  const createdDate = formatDate(session.createdAt);

  return (
    <div className="flex items-center gap-3 py-3">
      {/* Session ID */}
      <span
        className="font-mono text-xs text-muted-foreground shrink-0 w-28 truncate"
        title={session.id}
      >
        {truncateId(session.id)}
      </span>

      {/* User ID */}
      <Link
        href={`/dashboard/users/${session.userId}`}
        className="font-mono text-xs text-primary hover:underline shrink-0 w-28 truncate hidden md:block"
        title={session.userId}
      >
        {truncateId(session.userId)}
      </Link>

      {/* State badge */}
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${stateBadgeClass(session.state)}`}
      >
        {session.state}
      </span>

      {/* Mode badge */}
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${modeBadgeClass(session.mode)}`}
      >
        {session.mode}
      </span>

      {/* Card count */}
      <span className="text-xs text-muted-foreground shrink-0 hidden lg:block w-20 text-right">
        {String(session.cardIds.length)} cards
      </span>

      {/* Created date */}
      <span className="text-xs text-muted-foreground shrink-0 hidden sm:block w-20 text-right">
        {createdDate}
      </span>

      {/* View link */}
      <div className="shrink-0 ml-auto">
        <Link
          href={`/dashboard/content/sessions/${session.id}`}
          className="text-xs text-primary hover:underline"
        >
          View &rarr;
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SessionsPage(): JSX.Element {
  const { data, isLoading, isError } = useSessions();

  const sessions = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">Sessions</h1>
        <p className="text-muted-foreground mt-1">Platform-wide learning session log.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Sessions</CardTitle>
          <CardDescription>
            {isLoading
              ? 'Loading…'
              : `${String(sessions.length)} session${sessions.length !== 1 ? 's' : ''}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading sessions…</div>
          ) : isError ? (
            <div className="py-8 text-center text-sm text-destructive">
              Failed to load sessions. Please try again.
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No sessions found.</div>
          ) : (
            <>
              {/* Column headers */}
              <div className="flex items-center gap-3 pb-2 border-b text-xs font-medium text-muted-foreground">
                <span className="w-28 shrink-0">Session ID</span>
                <span className="hidden md:block shrink-0 w-28">User ID</span>
                <span className="shrink-0">State</span>
                <span className="shrink-0">Mode</span>
                <span className="hidden lg:block shrink-0 w-20 text-right">Cards</span>
                <span className="hidden sm:block shrink-0 w-20 text-right">Created</span>
                <span className="shrink-0 ml-auto">Actions</span>
              </div>
              <div className="divide-y">
                {sessions.map((session) => (
                  <SessionRow key={session.id} session={session} />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
