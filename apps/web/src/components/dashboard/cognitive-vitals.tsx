/**
 * Cognitive Vitals Row
 *
 * Four MetricTile widgets wired to live data from 4 services.
 * Each tile is independently error-isolated.
 */

'use client';

import {
  useDualLanePlan,
  useMisconceptions,
  useReviewWindows,
  useSessions,
  useStructuralHealth,
  type UserDto,
} from '@noema/api-client';
import { MetricTile, NeuralGauge, Skeleton } from '@noema/ui';
import { Flame } from 'lucide-react';
import { SectionErrorBoundary } from '@/components/section-error-boundary';

type UserId = UserDto['id'];

// ============================================================================
// Sub-tile: Cards Due
// ============================================================================

function CardsDueTile({ userId }: { userId: UserId }): React.JSX.Element {
  const plan = useDualLanePlan({ userId });
  const windows = useReviewWindows({ userId });

  if (plan.isLoading || windows.isLoading) {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  const planData = plan.data?.data;
  const total = (planData?.totalRetention ?? 0) + (planData?.totalCalibration ?? 0);

  // Build 7-day sparkline from review windows (forward-looking approximation)
  const windowData = windows.data?.data ?? [];
  const byDay = new Map<string, number>();
  for (const w of windowData) {
    const day = w.startAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + w.cardsDue);
  }
  const sparklineData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return byDay.get(d.toISOString().slice(0, 10)) ?? 0;
  });

  return (
    <MetricTile
      label="Cards Due"
      value={total}
      colorFamily="synapse"
      sparklineData={sparklineData}
    />
  );
}

// ============================================================================
// Sub-tile: Knowledge Health
// ============================================================================

function KnowledgeHealthTile({ userId }: { userId: UserId }): React.JSX.Element {
  const health = useStructuralHealth(userId);

  if (health.isLoading) {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  const data = health.data?.data;
  const score = data?.score ?? 0;
  const grade = data?.grade ?? '—';

  return (
    <MetricTile
      label="Knowledge Health"
      value={grade.charAt(0).toUpperCase() + grade.slice(1)}
      colorFamily="dendrite"
      icon={<NeuralGauge value={score} size="sm" showValue={false} />}
    />
  );
}

// ============================================================================
// Sub-tile: Active Misconceptions
// ============================================================================

function MisconceptionsTile({ userId }: { userId: UserId }): React.JSX.Element {
  const misc = useMisconceptions(userId);

  if (misc.isLoading) {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  const all = misc.data?.data ?? [];
  // Exclude both 'resolved' and 'dismissed' — dismissed = user-acknowledged, not an active concern
  const active = all.filter((m) => m.status !== 'resolved' && m.status !== 'dismissed');
  const detected = active.filter((m) => m.status === 'detected').length;
  const confirmed = active.filter((m) => m.status === 'confirmed').length;

  const subtitle =
    active.length > 0
      ? `${String(confirmed)} confirmed · ${String(detected)} detected`
      : 'None active';

  return (
    <MetricTile
      label="Misconceptions"
      value={active.length}
      colorFamily="cortex"
      trend={
        active.length > 0
          ? { direction: 'down', delta: subtitle }
          : { direction: 'flat', delta: 'Clean' }
      }
    />
  );
}

// ============================================================================
// Sub-tile: Study Streak
// ============================================================================

function StudyStreakTile({ userId: _userId }: { userId: UserId }): React.JSX.Element {
  const sessions = useSessions({ state: 'COMPLETED', limit: 30 });

  if (sessions.isLoading) {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  const list = sessions.data?.data ?? [];

  // Compute consecutive days with at least one completed session
  const completedDays = new Set(list.map((s) => new Date(s.startedAt).toISOString().slice(0, 10)));
  let streak = 0;
  const check = new Date();
  while (completedDays.has(check.toISOString().slice(0, 10))) {
    streak += 1;
    check.setDate(check.getDate() - 1);
  }

  return (
    <MetricTile
      label="Study Streak"
      value={`${String(streak)}d`}
      colorFamily="myelin"
      icon={streak > 7 ? <Flame className="h-4 w-4 text-myelin-400" /> : undefined}
      trend={streak > 0 ? { direction: 'up', delta: 'Keep it up!' } : { direction: 'flat' }}
    />
  );
}

// ============================================================================
// Exported Row
// ============================================================================

export function CognitiveVitals({ userId }: { userId: UserId }): React.JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SectionErrorBoundary>
        <CardsDueTile userId={userId} />
      </SectionErrorBoundary>
      <SectionErrorBoundary>
        <KnowledgeHealthTile userId={userId} />
      </SectionErrorBoundary>
      <SectionErrorBoundary>
        <MisconceptionsTile userId={userId} />
      </SectionErrorBoundary>
      <SectionErrorBoundary>
        <StudyStreakTile userId={userId} />
      </SectionErrorBoundary>
    </div>
  );
}
