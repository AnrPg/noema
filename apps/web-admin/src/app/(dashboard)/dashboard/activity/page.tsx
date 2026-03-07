/**
 * Activity Page
 *
 * Shows recent platform activity as a combined timeline of:
 *   - Learning sessions (from session-service)
 *   - CKG mutation pipeline events (from knowledge-graph-service)
 *
 * No dedicated audit-log endpoint exists yet; this derives activity from the
 * two most active event sources in the platform.
 */

'use client';

import type { JSX } from 'react';
import { useCKGMutations, useSessions } from '@noema/api-client';
import type { ICkgMutationDto, ISessionDto } from '@noema/api-client';
import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@noema/ui';
import { AlertCircle, BookOpen, GitPullRequest } from 'lucide-react';

// ---- unified event shape ------------------------------------------------

type ActivityEventKind = 'session' | 'mutation';

interface IActivityEvent {
  id: string;
  kind: ActivityEventKind;
  timestamp: string;
  title: string;
  detail: string;
  badge: string;
  badgeClass: string;
}

function sessionToEvent(s: ISessionDto): IActivityEvent {
  const badgeMap: Record<ISessionDto['state'], { label: string; cls: string }> = {
    ACTIVE: {
      label: 'ACTIVE',
      cls: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    },
    PAUSED: {
      label: 'PAUSED',
      cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    },
    COMPLETED: {
      label: 'COMPLETED',
      cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    },
    ABANDONED: {
      label: 'ABANDONED',
      cls: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    },
    EXPIRED: {
      label: 'EXPIRED',
      cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    },
  };
  const { label, cls } = badgeMap[s.state];
  return {
    id: String(s.id),
    kind: 'session',
    timestamp: s.updatedAt,
    title: `Session ${s.mode}`,
    detail: `${String(s.cardIds.length)} card(s) · user ${String(s.userId)}`,
    badge: label,
    badgeClass: cls,
  };
}

function mutationToEvent(m: ICkgMutationDto): IActivityEvent {
  const badgeMap: Record<ICkgMutationDto['status'], { label: string; cls: string }> = {
    pending: {
      label: 'PENDING',
      cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    },
    approved: {
      label: 'APPROVED',
      cls: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    },
    rejected: {
      label: 'REJECTED',
      cls: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    },
    cancelled: {
      label: 'CANCELLED',
      cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    },
    retrying: {
      label: 'RETRYING',
      cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
    },
  };
  const { label, cls } = badgeMap[m.status];
  const typeLabel = m.type.replace(/_/g, ' ');
  return {
    id: String(m.id),
    kind: 'mutation',
    timestamp: m.reviewedAt ?? m.proposedAt,
    title: `CKG ${typeLabel}`,
    detail: `proposed by ${String(m.proposedBy)}${m.reviewNote !== null ? ` · ${m.reviewNote}` : ''}`,
    badge: label,
    badgeClass: cls,
  };
}

// ---- component ---------------------------------------------------------

export default function ActivityPage(): JSX.Element {
  const {
    data: sessionsData,
    isLoading: sessionsLoading,
    isError: sessionsError,
  } = useSessions({ limit: 20 });

  const {
    data: mutationsData,
    isLoading: mutationsLoading,
    isError: mutationsError,
  } = useCKGMutations({ limit: 20 });

  const isLoading = sessionsLoading || mutationsLoading;
  const hasError = sessionsError || mutationsError;

  const events: IActivityEvent[] = [
    ...(sessionsData?.data ?? []).map(sessionToEvent),
    ...(mutationsData ?? []).map(mutationToEvent),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Activity</h1>
        <p className="text-muted-foreground mt-1">Platform activity and audit logs.</p>
      </div>

      {hasError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load activity data. Please try again.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>Recent sessions and CKG mutation pipeline events</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading activity…</div>
          ) : events.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No recent activity found.</div>
          ) : (
            <ol className="relative border-l border-border ml-3">
              {events.map((event) => (
                <li key={`${event.kind}:${event.id}`} className="mb-6 ml-6">
                  <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-muted ring-4 ring-background">
                    {event.kind === 'session' ? (
                      <BookOpen className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <GitPullRequest className="h-3 w-3 text-muted-foreground" />
                    )}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{event.title}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${event.badgeClass}`}
                    >
                      {event.badge}
                    </span>
                    <time className="text-xs text-muted-foreground">
                      {new Date(event.timestamp).toLocaleString()}
                    </time>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{event.detail}</p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
