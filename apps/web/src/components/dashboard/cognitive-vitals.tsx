/**
 * Cognitive Vitals Row
 *
 * Four MetricTile widgets wired to live data from 4 services.
 * Each tile is independently error-isolated.
 */

'use client';

import {
  type GamificationSummaryDto,
  useDueConcepts,
  useGamificationSummary,
  useMisconceptions,
  useStabilitySummary,
  type UserDto,
} from '@noema/api-client';
import type { StudyMode } from '@noema/types';
import { MetricTile, NeuralGauge, Skeleton } from '@noema/ui';
import { SectionErrorBoundary } from '@/components/section-error-boundary';

type UserId = UserDto['id'];

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isGamificationSummary(value: unknown): value is GamificationSummaryDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['currentStreak'] === 'number' &&
    typeof candidate['longestStreak'] === 'number' &&
    typeof candidate['level'] === 'number' &&
    typeof candidate['memoryIntegrityScore'] === 'number' &&
    typeof candidate['activeBadgeCount'] === 'number'
  );
}

// ============================================================================
// Sub-tile: Concepts Due
// ============================================================================

function CardsDueTile({
  userId,
  studyMode,
}: {
  userId: UserId;
  studyMode: StudyMode;
}): React.JSX.Element {
  const dueConcepts = useDueConcepts({ studyMode, limit: 200 }, { enabled: userId !== '' });

  if (dueConcepts.isLoading) {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  const concepts = dueConcepts.data?.data.concepts ?? [];
  const total = concepts.length;
  const overdue = concepts.filter(
    (concept) => new Date(concept.dueAt).getTime() < Date.now()
  ).length;
  const sparklineData = [overdue, total];

  return (
    <MetricTile
      label="Concepts Due"
      value={total}
      colorFamily="synapse"
      sparklineData={sparklineData}
      trend={
        total > 0
          ? {
              direction: 'up',
              delta: `${String(overdue)} overdue`,
            }
          : {
              direction: 'flat',
              delta: 'Clear',
            }
      }
    />
  );
}

// ============================================================================
// Sub-tile: Concept Stability
// ============================================================================

function ConceptStabilityTile({
  userId,
  studyMode,
}: {
  userId: UserId;
  studyMode: StudyMode;
}): React.JSX.Element {
  const summary = useStabilitySummary(userId, { studyMode });

  if (summary.isLoading) {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  const data = summary.data;
  const ratio = data?.stabilityRatio ?? 0;
  const stable = data?.stableConcepts ?? 0;
  const total = data?.totalConcepts ?? 0;
  const averageReasoning = data?.averageReasoning;

  return (
    <MetricTile
      label="Concept Stability"
      value={`${String(stable)}/${String(total)}`}
      colorFamily="dendrite"
      icon={<NeuralGauge value={ratio} size="sm" showValue={false} />}
      trend={{
        direction: ratio >= 0.7 ? 'up' : ratio >= 0.4 ? 'flat' : 'down',
        delta:
          averageReasoning === null || averageReasoning === undefined
            ? 'Reasoning trend pending'
            : `Reasoning ${String(Math.round(averageReasoning * 100))}%`,
      }}
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
 * Dashboard streak/progression now comes from the derived gamification
 * projection instead of inferring readiness from queue state.
 */
function StudyStreakTile({
  userId,
  studyMode,
}: {
  userId: UserId;
  studyMode: StudyMode;
}): React.JSX.Element {
  const summary = useGamificationSummary(
    userId,
    { studyMode },
    { enabled: userId !== '', retry: false }
  );

  if (summary.isLoading) {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  if (userId === '') {
    return <Skeleton variant="metric-tile" className="h-32" />;
  }

  if (summary.isError || !isGamificationSummary(summary.data)) {
    return (
      <MetricTile
        label="Learning Streak"
        value="0d"
        colorFamily="myelin"
        trend={{ direction: 'flat', delta: 'Projection pending' }}
      />
    );
  }

  const data = summary.data;
  const streak = data.currentStreak;
  const memoryIntegrity = Math.round(data.memoryIntegrityScore);
  const direction = streak > 0 ? 'up' : 'flat';
  const delta =
    data.activeBadgeCount > 0
      ? `Lvl ${String(data.level)} · ${String(data.activeBadgeCount)} active badges`
      : `Lvl ${String(data.level)} · MIS ${String(memoryIntegrity)}`;

  return (
    <MetricTile
      label="Learning Streak"
      value={`${String(streak)}d`}
      colorFamily="myelin"
      sparklineData={[data.currentStreak, data.longestStreak, data.level]}
      trend={{ direction, delta }}
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
        <ConceptStabilityTile userId={userId} studyMode={studyMode} />
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
