'use client';

import { useStabilitySummary, type UserDto } from '@noema/api-client';
import type { StudyMode } from '@noema/types';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@noema/ui';
import { TrendingUp } from 'lucide-react';

type UserId = UserDto['id'];

interface IDomainReasoningEntry {
  domain: string;
  averageReasoning: number | null;
  totalConcepts: number;
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? 'pending' : `${String(Math.round(value * 100))}%`;
}

export function ReasoningTrend({
  userId,
  studyMode,
}: {
  userId: UserId;
  studyMode: StudyMode;
}): React.JSX.Element {
  const summary = useStabilitySummary(userId, { studyMode });

  if (summary.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Reasoning Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton variant="rect" className="h-36 w-full" />
        </CardContent>
      </Card>
    );
  }

  const domains = ((summary.data?.domains ?? []) as IDomainReasoningEntry[])
    .filter((domain) => domain.totalConcepts > 0)
    .slice(0, 5);
  const averageReasoning = summary.data?.averageReasoning ?? null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-synapse-400" aria-hidden="true" />
          Reasoning Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="text-3xl font-semibold tabular-nums text-foreground">
            {formatPercent(averageReasoning)}
          </div>
          <div className="text-xs text-muted-foreground">rolling concept signal</div>
        </div>
        <div className="space-y-2">
          {domains.length === 0 ? (
            <div className="rounded-md border border-border/70 bg-muted/25 px-3 py-4 text-sm text-muted-foreground">
              No reasoning windows yet.
            </div>
          ) : (
            domains.map((domain) => {
              const value = domain.averageReasoning ?? 0;
              return (
                <div key={domain.domain} className="grid grid-cols-[minmax(0,1fr)_4rem] gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium capitalize text-foreground">
                        {domain.domain}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-sm bg-muted">
                      <div
                        className="h-full rounded-sm bg-synapse-400"
                        style={{ width: `${String(Math.round(value * 100))}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-right text-xs tabular-nums text-muted-foreground">
                    {formatPercent(domain.averageReasoning)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
