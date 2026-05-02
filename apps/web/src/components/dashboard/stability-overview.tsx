'use client';

import { useStabilitySummary, type UserDto } from '@noema/api-client';
import type { StudyMode } from '@noema/types';
import { Card, CardContent, CardHeader, CardTitle, NeuralGauge, Skeleton } from '@noema/ui';
import { ShieldCheck } from 'lucide-react';

type UserId = UserDto['id'];

export function StabilityOverview({
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
          <CardTitle className="text-sm">Stability Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton variant="rect" className="h-36 w-full" />
        </CardContent>
      </Card>
    );
  }

  const data = summary.data;
  const ratio = data?.stabilityRatio ?? 0;
  const stable = data?.stableConcepts ?? 0;
  const unstable = data?.unstableConcepts ?? 0;
  const total = data?.totalConcepts ?? 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-dendrite-400" aria-hidden="true" />
          Stability Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-5">
          <NeuralGauge value={ratio} size="lg" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-semibold tabular-nums text-foreground">{stable}</div>
                <div className="text-[11px] text-muted-foreground">stable</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums text-foreground">{unstable}</div>
                <div className="text-[11px] text-muted-foreground">unstable</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums text-foreground">{total}</div>
                <div className="text-[11px] text-muted-foreground">tracked</div>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-sm bg-muted">
              <div
                className="h-full rounded-sm bg-dendrite-400"
                style={{ width: `${String(Math.round(ratio * 100))}%` }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
