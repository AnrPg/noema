/**
 * Cognitive Vitals Row
 *
 * Four MetricTile widgets wired to live data from 4 services.
 * Each tile is independently error-isolated.
 */

'use client';

import {
  useForecast,
  useMisconceptions,
  useReviewQueue,
  useSessions,
  useStructuralHealth,
  type UserDto,
} from '@noema/api-client';
import { MetricTile, NeuralGauge, Skeleton } from '@noema/ui';
import { Flame } from 'lucide-react';
import { SectionErrorBoundary } from '@/components/section-error-boundary';

type UserId = UserDto['id'];

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

// Returns YYYY-MM-DD in local timezone (not UTC) for consistent day bucketing
function localDateStr(d: Date): string {
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Maximum look-back for streak calculation. Streak will be capped if exceeded.
const STREAK_LOOKBACK_DAYS = 30;

// ============================================================================
// Sub-tile: Cards Due
// ============================================================================

function CardsDueTile({ userId }: { userId: UserId }): React.JSX.Element {
  const queue = useReviewQueue({ limit: 500 }, { enabled: userId !== '' });
  const forecast = useForecast({ userId, days: 7, includeOverdue: true }, { enabled: userId !== '' });

  if (queue.isLoading || forecast.isLoading) {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  const queueData = queue.data?.data;
  const total = queueData?.totalDue ?? 0;

  const forecastDays = ensureArray<{ combined: { total: number } }>(forecast.data?.data.days);
  const sparklineData = forecastDays.map((day) => day.combined.total);

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

  const all = ensureArray<{ status: string }>(misc.data?.data);
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

/**
 * userId is used only to ensure this tile renders only when auth is settled.
 * useSessions is auth-scoped server-side and does not accept a userId filter.
 */
function StudyStreakTile({ userId }: { userId: UserId }): React.JSX.Element {
  const sessions = useSessions({ state: 'COMPLETED', limit: STREAK_LOOKBACK_DAYS });

  if (sessions.isLoading) {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  if (userId === '') {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  const list = ensureArray<{ startedAt: string }>(sessions.data?.data);

  // Compute consecutive days with at least one completed session.
  // If the user has not yet studied today, begin the check from yesterday so
  // that a prior streak is not zeroed out before the first session of the day.
  const completedDays = new Set(list.map((s) => localDateStr(new Date(s.startedAt))));
  const check = new Date();
  const today = localDateStr(check);
  if (!completedDays.has(today)) {
    check.setDate(check.getDate() - 1);
  }
  let streak = 0;
  while (completedDays.has(localDateStr(check))) {
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
