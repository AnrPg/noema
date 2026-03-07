/**
 * Content Oversight Page
 *
 * Platform-wide content stats: total cards, drafts, templates, sessions.
 * Below the metrics: AdminCardBrowser listing the 50 most-recent cards.
 */

'use client';

import * as React from 'react';
import { type JSX } from 'react';
import Link from 'next/link';
import { useCardStats, useSessions, useTemplates } from '@noema/api-client';
import { Button, MetricTile } from '@noema/ui';
import { ArrowRight, BookOpen, FileText, GitMerge, Layers } from 'lucide-react';
import { AdminCardBrowser } from '../../../../components/content/admin-card-browser';

export default function ContentOversightPage(): JSX.Element {
  const { data: cardStats } = useCardStats();
  // Fetches only 1 session record to derive the count from the response array
  // length. A dedicated count endpoint would be preferable; add one when the
  // session-service exposes it (e.g. GET /sessions/count or meta.total in the
  // paginated response).
  const { data: sessionsData } = useSessions({ limit: 1 });
  const { data: templates } = useTemplates();

  const totalCards = cardStats?.total ?? 0;
  const draftCards = cardStats?.byState.DRAFT ?? 0;
  const totalTemplates = templates?.length ?? 0;
  // Uses the single-record fetch; not a true total — replace with meta.total
  // once the session-service pagination envelope exposes it.
  const totalSessions = sessionsData?.data.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Content Oversight</h1>
          <p className="text-muted-foreground mt-1">Platform-wide card and template management.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/content/templates">
            Manage Templates <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Metric Tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Total Cards"
          value={totalCards}
          icon={<GitMerge className="h-4 w-4" />}
          colorFamily="dendrite"
        />
        <MetricTile
          label="Draft Cards"
          value={draftCards}
          icon={<FileText className="h-4 w-4" />}
          colorFamily={draftCards > 0 ? 'cortex' : 'axon'}
        />
        <MetricTile
          label="Templates"
          value={totalTemplates}
          icon={<Layers className="h-4 w-4" />}
          colorFamily="synapse"
        />
        <MetricTile
          label="Sessions"
          value={totalSessions}
          icon={<BookOpen className="h-4 w-4" />}
          colorFamily="axon"
        />
      </div>

      {/* Card Browser */}
      <AdminCardBrowser />
    </div>
  );
}
