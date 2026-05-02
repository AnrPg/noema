import {
  GamificationAchievementStatus,
  GamificationBadgeStatus,
  type IAchievementProjectionDto,
  type ICapabilityTierRequirementDto,
} from '@noema/contracts';
import type { ConceptId } from '@noema/types';
import type {
  AchievementRecord,
  BadgeRecord,
  IProjectionSnapshot,
  IProjectionState,
  IStreakDayRecord,
} from './types.js';

export const DEFAULT_ACHIEVEMENTS: Pick<
  IAchievementProjectionDto,
  'achievementId' | 'name' | 'description'
>[] = [
  {
    achievementId: 'quality-day',
    name: 'Quality Day',
    description: 'Earn one streak-qualified evaluation day.',
  },
  {
    achievementId: 'stable-five',
    name: 'Stable Five',
    description: 'Keep five concepts stable at once.',
  },
  {
    achievementId: 'reasoning-consistency',
    name: 'Reasoning Consistency',
    description: 'Sustain strong reasoning quality across recent Steps.',
  },
];

export function isoDay(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

export function determineLevel(totalXp: number, thresholds: number[]): number {
  let level = 1;
  thresholds.forEach((threshold, index) => {
    if (totalXp >= threshold) {
      level = index + 1;
    }
  });
  return level;
}

export function computeAverageReasoning(
  currentAverage: number | null,
  currentSamples: number,
  nextScore: number
): { average: number; samples: number } {
  const safeAverage = currentAverage ?? 0;
  const samples = currentSamples + 1;
  return {
    average: (safeAverage * currentSamples + nextScore) / samples,
    samples,
  };
}

export function computeCurrentStreak(days: IStreakDayRecord[]): {
  currentStreak: number;
  longestStreak: number;
  lastQualifiedDay: string | null;
} {
  const qualifiedDays = days
    .filter((day) => day.qualified)
    .map((day) => day.day)
    .sort();

  if (qualifiedDays.length === 0) {
    return { currentStreak: 0, longestStreak: 0, lastQualifiedDay: null };
  }

  let longest = 1;
  let currentRun = 1;
  for (let index = 1; index < qualifiedDays.length; index += 1) {
    const previousDay = qualifiedDays[index - 1];
    const currentDay = qualifiedDays[index];
    if (previousDay === undefined || currentDay === undefined) {
      continue;
    }
    const previous = new Date(`${previousDay}T00:00:00.000Z`);
    const current = new Date(`${currentDay}T00:00:00.000Z`);
    const diffDays = Math.round((current.getTime() - previous.getTime()) / 86_400_000);
    if (diffDays === 1) {
      currentRun += 1;
    } else {
      currentRun = 1;
    }
    longest = Math.max(longest, currentRun);
  }

  let trailing = 1;
  for (let index = qualifiedDays.length - 1; index > 0; index -= 1) {
    const currentDay = qualifiedDays[index];
    const previousDay = qualifiedDays[index - 1];
    if (currentDay === undefined || previousDay === undefined) {
      continue;
    }
    const current = new Date(`${currentDay}T00:00:00.000Z`);
    const previous = new Date(`${previousDay}T00:00:00.000Z`);
    const diffDays = Math.round((current.getTime() - previous.getTime()) / 86_400_000);
    if (diffDays === 1) {
      trailing += 1;
    } else {
      break;
    }
  }

  return {
    currentStreak: trailing,
    longestStreak: longest,
    lastQualifiedDay: qualifiedDays.at(-1) ?? null,
  };
}

export function computeMemoryIntegrityScore(projection: IProjectionState): number {
  const stableConceptScore = Math.min(1, projection.stableConcepts / 10);
  const reasoningScore = projection.averageReasoning ?? 0;
  const daysSinceUnstableFlip =
    projection.lastUnstableFlipAt === null
      ? 30
      : Math.max(
          0,
          Math.floor((Date.now() - new Date(projection.lastUnstableFlipAt).getTime()) / 86_400_000)
        );
  const recencyScore = Math.min(1, daysSinceUnstableFlip / 14);
  return Number(
    ((stableConceptScore * 0.45 + reasoningScore * 0.35 + recencyScore * 0.2) * 100).toFixed(2)
  );
}

export function computeCapabilityTier(
  projection: IProjectionState,
  thresholds: ICapabilityTierRequirementDto[]
): number {
  let tier = 0;
  thresholds.forEach((requirement) => {
    if (
      projection.totalStepsCompleted >= requirement.minStepsCompleted &&
      projection.engagedCategories.length >= requirement.minCategoriesEngaged &&
      projection.activeDays >= requirement.minDaysActive &&
      projection.sessionsCompleted >= requirement.minSessionsCompleted &&
      (projection.averageReasoning ?? 0) >= requirement.minAverageReasoning
    ) {
      tier = requirement.tier;
    }
  });
  return tier;
}

export function updateAchievements(snapshot: IProjectionSnapshot): AchievementRecord[] {
  const now = new Date().toISOString();
  const records: AchievementRecord[] = DEFAULT_ACHIEVEMENTS.map((definition) => {
    const existing = snapshot.achievements.find(
      (achievement) => achievement.achievementId === definition.achievementId
    );
    return {
      achievementId: definition.achievementId,
      name: definition.name,
      description: definition.description,
      status: existing?.status ?? GamificationAchievementStatus.LOCKED,
      progress: existing?.progress ?? 0,
      unlockedAt: existing?.unlockedAt ?? null,
      updatedAt: existing?.updatedAt ?? now,
    };
  });

  const qualityDay = records.find((achievement) => achievement.achievementId === 'quality-day');
  if (qualityDay !== undefined) {
    qualityDay.progress = Math.min(1, snapshot.projection.currentStreak > 0 ? 1 : 0);
    if (qualityDay.progress >= 1) {
      qualityDay.status = GamificationAchievementStatus.ACTIVE;
      qualityDay.unlockedAt ??= now;
    }
    qualityDay.updatedAt = now;
  }

  const stableFive = records.find((achievement) => achievement.achievementId === 'stable-five');
  if (stableFive !== undefined) {
    stableFive.progress = Math.min(1, snapshot.projection.stableConcepts / 5);
    if (stableFive.progress >= 1) {
      stableFive.status = GamificationAchievementStatus.ACTIVE;
      stableFive.unlockedAt ??= now;
    }
    stableFive.updatedAt = now;
  }

  const consistency = records.find(
    (achievement) => achievement.achievementId === 'reasoning-consistency'
  );
  if (consistency !== undefined) {
    const readiness =
      snapshot.projection.totalStepsCompleted >= 10 &&
      (snapshot.projection.averageReasoning ?? 0) >= 0.6
        ? 1
        : Math.min(
            1,
            ((snapshot.projection.averageReasoning ?? 0) / 0.6) *
              Math.min(1, snapshot.projection.totalStepsCompleted / 10)
          );
    consistency.progress = Number(readiness.toFixed(2));
    if (consistency.progress >= 1) {
      consistency.status = GamificationAchievementStatus.ACTIVE;
      consistency.unlockedAt ??= now;
    }
    consistency.updatedAt = now;
  }

  return records;
}

export function buildConceptStabilityBadge(conceptId: ConceptId, active: boolean): BadgeRecord {
  const now = new Date().toISOString();
  return {
    badgeId: `concept-stability:${conceptId}`,
    name: 'Stable Concept',
    description: 'Granted while a concept remains stable.',
    status: active ? GamificationBadgeStatus.ACTIVE : GamificationBadgeStatus.REVOKED,
    reason: active ? 'Concept reached stable state.' : 'Concept returned to unstable state.',
    conceptId,
    awardedAt: active ? now : null,
    revokedAt: active ? null : now,
    updatedAt: now,
  };
}
