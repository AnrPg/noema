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
  useSchedulerProgressSummary,
  useStudyStreak,
  useStructuralHealth,
  type UserDto,
} from '@noema/api-client';
import type { StudyMode } from '@noema/types';
import { MetricTile, NeuralGauge, Skeleton } from '@noema/ui';
import { Flame } from 'lucide-react';
import { SectionErrorBoundary } from '@/components/section-error-boundary';

type UserId = UserDto['id'];

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

// ============================================================================
// Sub-tile: Cards Due
// ============================================================================

function CardsDueTile({
  userId,
  studyMode,
}: {
  userId: UserId;
  studyMode: StudyMode;
}): React.JSX.Element {
  const progress = useSchedulerProgressSummary({ studyMode }, { enabled: userId !== '' });
  const forecast = useForecast(
    { userId, days: 7, includeOverdue: true, studyMode },
    { enabled: userId !== '' }
  );

  if (progress.isLoading || forecast.isLoading) {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  const summary = progress.data?.data;
  const total = summary?.dueNow ?? 0;

  const forecastDays = ensureArray<{ combined: { total: number } }>(forecast.data?.data.days);
  const sparklineData = forecastDays.map((day) => day.combined.total);

  return (
    <MetricTile
      label="Cards Due"
      value={total}
      colorFamily="synapse"
      sparklineData={sparklineData}
      trend={
        total > 0
          ? {
              direction: 'up',
              delta: `${String(summary?.overdueCards ?? 0)} overdue`,
            }
          : {
              direction: 'flat',
              delta: `${String(summary?.matureCards ?? 0)} mature`,
            }
      }
    />
  );
}

// ============================================================================
// Sub-tile: Knowledge Health
// ============================================================================

function KnowledgeHealthTile({
  userId,
  studyMode,
}: {
  userId: UserId;
  studyMode: StudyMode;
}): React.JSX.Element {
  const health = useStructuralHealth(userId, { studyMode });

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

function MisconceptionsTile({
  userId,
  studyMode,
}: {
  userId: UserId;
  studyMode: StudyMode;
}): React.JSX.Element {
  const misc = useMisconceptions(userId, { studyMode });

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
 * Streaks are now read from the dedicated session-service streak endpoint so
 * dashboard analytics stay aligned with mode-scoped scheduling state.
 */
function StudyStreakTile({
  userId,
  studyMode,
}: {
  userId: UserId;
  studyMode: StudyMode;
}): React.JSX.Element {
  const streak = useStudyStreak({ studyMode, days: 30 });

  if (streak.isLoading) {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  if (userId === '') {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  const streakDays = streak.data?.data.currentStreak ?? 0;

  return (
    <MetricTile
      label="Study Streak"
      value={`${String(streakDays)}d`}
      colorFamily="myelin"
      icon={streakDays > 7 ? <Flame className="h-4 w-4 text-myelin-400" /> : undefined}
      trend={
        streakDays > 0
          ? { direction: 'up', delta: 'Keep it up!' }
          : { direction: 'flat', delta: 'Start a streak' }
      }
    />
  );
}

// ============================================================================
// Exported Row
// ============================================================================

export function CognitiveVitals({
  userId,
  studyMode,
}: {
  userId: UserId;
  studyMode: StudyMode;
}): React.JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SectionErrorBoundary>
        <CardsDueTile userId={userId} studyMode={studyMode} />
      </SectionErrorBoundary>
      <SectionErrorBoundary>
        <KnowledgeHealthTile userId={userId} studyMode={studyMode} />
      </SectionErrorBoundary>
      <SectionErrorBoundary>
        <MisconceptionsTile userId={userId} studyMode={studyMode} />
      </SectionErrorBoundary>
      <SectionErrorBoundary>
        <StudyStreakTile userId={userId} studyMode={studyMode} />
      </SectionErrorBoundary>
    </div>
  );
}
