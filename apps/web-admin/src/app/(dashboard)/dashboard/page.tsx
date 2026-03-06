/**
 * Admin Dashboard Overview Page
 *
 * Three sections:
 *  1. System Health Row — 4 MetricTile components (users, cards, pending mutations, sessions)
 *  2. Pending Actions List — items requiring admin attention with links
 *  3. Recent Activity Feed — last 5 registered users
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { type JSX } from 'react';
import { useCKGMutations, useCardStats, useUsers } from '@noema/api-client';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricTile,
} from '@noema/ui';
import { Activity, AlertTriangle, ArrowRight, Clock, GitMerge, Users } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${String(days)}d ago`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminDashboardPage(): JSX.Element {
  const { data: usersData } = useUsers();
  const { data: cardStats } = useCardStats();
  const { data: pendingMutations } = useCKGMutations({ status: 'pending' });

  const totalUsers = usersData?.data.total ?? 0;
  const totalCards = cardStats?.total ?? 0;
  const pendingMutationCount = pendingMutations?.length ?? 0;
  const draftCards = cardStats?.byState.DRAFT ?? 0;

  // Recent activity: last 5 users sorted by createdAt desc
  const recentUsers = React.useMemo(() => {
    const items = usersData?.data.items ?? [];
    return [...items]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [usersData]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Platform overview and statistics.</p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 1 — System Health Row                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Total Users"
          value={totalUsers}
          icon={<Users className="h-4 w-4" />}
          colorFamily="synapse"
        />
        <MetricTile
          label="Total Cards"
          value={totalCards}
          icon={<GitMerge className="h-4 w-4" />}
          colorFamily="dendrite"
        />
        <MetricTile
          label="Pending Mutations"
          value={pendingMutationCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          colorFamily={pendingMutationCount > 0 ? 'cortex' : 'axon'}
        />
        <MetricTile
          label="Active Sessions"
          value="—"
          icon={<Activity className="h-4 w-4" />}
          colorFamily="axon"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2 — Pending Actions                                         */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Actions</CardTitle>
          <CardDescription>Items requiring admin attention</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingMutationCount === 0 && draftCards === 0 ? (
            <p className="text-sm text-muted-foreground">No pending actions.</p>
          ) : (
            <div className="divide-y">
              {/* Mutations awaiting review */}
              {pendingMutationCount > 0 && (
                <div className="flex items-center justify-between border-l-4 border-yellow-400 py-3 pl-4">
                  <div>
                    <p className="text-sm font-medium">
                      {String(pendingMutationCount)} mutation
                      {pendingMutationCount !== 1 ? 's' : ''} awaiting review
                    </p>
                    <p className="text-xs text-muted-foreground">CKG mutation pipeline</p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/dashboard/ckg/mutations">
                      Review <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              )}

              {/* Draft cards */}
              {draftCards > 0 && (
                <div className="flex items-center justify-between border-l-4 border-orange-400 py-3 pl-4">
                  <div>
                    <p className="text-sm font-medium">
                      {String(draftCards)} draft card{draftCards !== 1 ? 's' : ''} unpublished
                    </p>
                    <p className="text-xs text-muted-foreground">Content oversight</p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/dashboard/content">
                      View <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3 — Recent Activity Feed                                    */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest user registrations</CardDescription>
        </CardHeader>
        <CardContent>
          {recentUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            <div className="space-y-3">
              {recentUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground shrink-0">
                      {relativeTime(user.createdAt)}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {user.displayName !== '' ? user.displayName : user.username}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">registered</span>
                  </div>
                  <Button variant="ghost" size="sm" asChild className="shrink-0">
                    <Link href={`/dashboard/users/${user.id}`}>View</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
