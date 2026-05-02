'use client';

import Link from 'next/link';
import * as React from 'react';
import {
  useDueConcepts,
  useMe,
  useStabilitySummary,
  usePKGNodes,
} from '@noema/api-client';
import type { IGraphNodeDto } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';
import { BarChart3, CalendarClock, Flag, Loader2, Sparkles, Target } from 'lucide-react';

import { useActiveStudyMode } from '@/hooks/use-active-study-mode';
import {
  getStudyModeDescription,
  getStudyModeLabel,
  getStudyModeShortLabel,
} from '@/lib/study-mode';

function percent(part: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return Math.round((part / total) * 100);
}

function percentText(value: number | null): string {
  if (value === null) {
    return '—';
  }

  return `${String(Math.round(value * 100))}%`;
}

function daysText(value: number | null): string {
  if (value === null) {
    return '—';
  }

  return `${String(Math.round(value))}d`;
}

function leastStableNodes(nodes: IGraphNodeDto[]): IGraphNodeDto[] {
  return nodes.filter((node) => typeof node.stabilityLevel === 'number').slice(0, 5);
}

export default function GoalsPage(): React.JSX.Element {
  const activeStudyMode = useActiveStudyMode();
  const { data: me } = useMe();
  const userId = (me?.id ?? '') as UserId;

  const summary = useStabilitySummary(userId, {
    enabled: userId !== '',
    studyMode: activeStudyMode,
  });
  const weakestNodeQuery = usePKGNodes(userId, {
    enabled: userId !== '',
    pageSize: 5,
    sortBy: 'stabilityLevel',
    sortOrder: 'asc',
    studyMode: activeStudyMode,
  });
  const dueConcepts = useDueConcepts(
    { studyMode: activeStudyMode, limit: 4 },
    { enabled: userId !== '' }
  );

  const summaryData = summary.data;
  const weakNodes = React.useMemo(
    () => leastStableNodes(Array.isArray(weakestNodeQuery.data) ? weakestNodeQuery.data : []),
    [weakestNodeQuery.data]
  );
  const dueConceptList = dueConcepts.data?.data.concepts ?? [];
  const strongestDomains = React.useMemo(
    () =>
      summaryData?.domains
        .slice()
        .sort((a, b) => b.stabilityRatio - a.stabilityRatio)
        .slice(0, 5) ?? [],
    [summaryData?.domains]
  );
  const weakestDomains = React.useMemo(
    () =>
      summaryData?.domains
        .slice()
        .sort((a, b) => a.stabilityRatio - b.stabilityRatio)
        .slice(0, 5) ?? [],
    [summaryData?.domains]
  );
  const schedulerRecommendations =
    dueConceptList.length > 0
      ? [
          {
            action: 'review_due_concepts',
            headline: 'Review due concepts',
            explanation:
              'The scheduler has concepts ready now; start a session to generate step-level practice for them.',
            suggestedStepCount: Math.max(3, Math.min(12, dueConceptList.length)),
          },
        ]
      : [];
  const dailyTarget =
    summaryData !== undefined ? Math.max(3, Math.min(12, summaryData.unstableConcepts)) : 5;
  const campaignTarget = summaryData !== undefined ? summaryData.unstableConcepts : 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">Goals</h1>
          <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {getStudyModeShortLabel(activeStudyMode)} mode
          </span>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {getStudyModeDescription(activeStudyMode)} This workspace now reads the explicit stability
          model for {getStudyModeLabel(activeStudyMode).toLowerCase()} so your goals reflect the
          same mode-scoped progress as the rest of the app.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Next Recommendations
            </CardTitle>
            <CardDescription>
              Ordered, simple recommendations from the mode-scoped concept scheduler.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dueConcepts.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading study guidance…
              </div>
            ) : schedulerRecommendations.length > 0 ? (
              schedulerRecommendations.map(
                (recommendation: (typeof schedulerRecommendations)[number]) => (
                  <div
                    key={recommendation.action}
                    className="rounded-lg border border-border/70 bg-background/40 px-4 py-3"
                  >
                    <p className="text-sm font-medium text-foreground">{recommendation.headline}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {recommendation.explanation}
                    </p>
                    <p className="mt-2 text-xs font-medium text-foreground">
                      Suggested workload: {String(recommendation.suggestedStepCount)} steps
                    </p>
                  </div>
                )
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                Guidance is not available yet for this mode.
              </p>
            )}
            <Button asChild variant="outline" className="w-full">
              <Link href="/reviews">Open Reviews</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-primary" />
              Daily target
            </CardTitle>
            <CardDescription>
              Use unstable concepts as the simplest daily planning input.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-3xl font-semibold tracking-tight text-foreground">
                {summary.isLoading ? '…' : String(dailyTarget)}
              </p>
              <p className="text-sm text-muted-foreground">
                Suggested new targets for the current mode.
              </p>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link href="/session/new">Start a focused session</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarClock className="h-5 w-5 text-primary" />
              Weekly plan
            </CardTitle>
            <CardDescription>
              Balance active reviews with coverage growth in this mode.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-3xl font-semibold tracking-tight text-foreground">
                {summaryData !== undefined
                  ? `${String(summaryData.stableConcepts)}/${String(summaryData.totalConcepts)}`
                  : '—'}
              </p>
              <p className="text-sm text-muted-foreground">
                Concepts with a derived stability state this week&apos;s plan can build on.
              </p>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link href="/reviews">Open Reviews</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Flag className="h-5 w-5 text-primary" />
              Stability campaigns
            </CardTitle>
            <CardDescription>
              Track the nodes still moving from exposure toward durable recall.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-3xl font-semibold tracking-tight text-foreground">
                {summary.isLoading ? '…' : String(campaignTarget)}
              </p>
              <p className="text-sm text-muted-foreground">
                Unstable concepts in{' '}
                {getStudyModeShortLabel(activeStudyMode).toLowerCase()} mode.
              </p>
            </div>
            <Button asChild className="w-full">
              <Link href="/knowledge">Explore Knowledge Map</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-primary" />
              Mode-Scoped Stability
            </CardTitle>
            <CardDescription>
              This summary is served by the backend stability read model, not reconstructed in the
              browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading stability summary…
              </div>
            ) : summaryData === undefined ? (
              <p className="text-sm text-muted-foreground">
                We couldn&apos;t load the stability summary yet. You can still use the knowledge map
                and reviews while the read model catches up.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Tracked</p>
                    <p className="mt-2 text-2xl font-bold text-foreground">
                      {String(summaryData.totalConcepts)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      In-scope derived concept states
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Stable</p>
                    <p className="mt-2 text-2xl font-bold text-foreground">
                      {String(summaryData.stableConcepts)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {String(percent(summaryData.stableConcepts, summaryData.totalConcepts))}% of
                      derived concept states
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Unstable
                    </p>
                    <p className="mt-2 text-2xl font-bold text-foreground">
                      {String(summaryData.unstableConcepts)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Best source for review and prerequisite-gap goals
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Reasoning average
                    </p>
                    <p className="mt-2 text-2xl font-bold text-foreground">
                      {percentText(summaryData.averageReasoning)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Latest concept projections</p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                    <h2 className="text-sm font-semibold text-foreground">Strongest domains</h2>
                    <div className="mt-3 space-y-2">
                      {strongestDomains.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No domain rollups yet.</p>
                      ) : (
                        strongestDomains.map(
                          (entry: (typeof strongestDomains)[number]) => (
                            <div
                              key={`strong-${entry.domain}`}
                              className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2"
                            >
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  {entry.domain}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {String(entry.stableConcepts)}/{String(entry.totalConcepts)} stable
                                </p>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {percentText(entry.stabilityRatio)}
                              </p>
                            </div>
                          )
                        )
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                    <h2 className="text-sm font-semibold text-foreground">Weakest domains</h2>
                    <div className="mt-3 space-y-2">
                      {weakestDomains.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No weak spots identified yet.
                        </p>
                      ) : (
                        weakestDomains.map(
                          (entry: (typeof weakestDomains)[number]) => (
                            <div
                              key={`weak-${entry.domain}`}
                              className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2"
                            >
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  {entry.domain}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {String(entry.unstableConcepts)} unstable of{' '}
                                  {String(entry.totalConcepts)}
                                </p>
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {daysText(entry.averageFsrsStability)}
                              </p>
                            </div>
                          )
                        )
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Focus Candidates
            </CardTitle>
            <CardDescription>
              Combine node-level weak spots with concept readiness so the next study action is
              concrete.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-3">
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Least stable nodes</h2>
                {weakestNodeQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading low-stability nodes…
                  </div>
                ) : weakNodes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tracked nodes yet in this mode. Start a session or add some study targets
                    first.
                  </p>
                ) : (
                  weakNodes.map((node) => (
                    <div
                      key={node.id}
                      className="rounded-lg border border-border/70 bg-background/40 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{node.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {node.domain ?? 'general'}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-foreground">
                          {node.stabilityLevel !== undefined && node.stabilityLevel !== null
                            ? percentText(node.stabilityLevel)
                            : '—'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2 border-t border-border/60 pt-3">
                <h2 className="text-sm font-semibold text-foreground">Due concepts</h2>
                {dueConcepts.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading scheduler focus…
                  </div>
                ) : dueConceptList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No due concepts identified yet in this mode.
                  </p>
                ) : (
                  dueConceptList.map((concept) => (
                    <div
                      key={concept.conceptId}
                      className="rounded-lg border border-border/70 bg-background/40 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{concept.conceptId}</p>
                          <p className="text-xs text-muted-foreground">
                            {concept.algorithm} · {concept.queue} · due{' '}
                            {new Date(concept.dueAt).toLocaleDateString()}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-foreground">
                          {concept.stability !== null
                            ? `${concept.stability.toFixed(1)}d`
                            : `${String(concept.reviewCount)} reviews`}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <Button asChild variant="outline" className="flex-1">
                <Link href="/knowledge">Open knowledge graph</Link>
              </Button>
              <Button asChild className="flex-1">
                <Link href="/reviews">Review due concepts</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
