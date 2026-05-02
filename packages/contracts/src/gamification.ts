import type { ConceptId, StudyMode, UserId } from '@noema/types';

export const GamificationBadgeStatus = {
  ACTIVE: 'active',
  REVOKED: 'revoked',
} as const;

export type GamificationBadgeStatus =
  (typeof GamificationBadgeStatus)[keyof typeof GamificationBadgeStatus];

export const GamificationAchievementStatus = {
  LOCKED: 'locked',
  ACTIVE: 'active',
} as const;

export type GamificationAchievementStatus =
  (typeof GamificationAchievementStatus)[keyof typeof GamificationAchievementStatus];

export interface IGamificationSummaryDto {
  userId: UserId;
  studyMode: StudyMode;
  totalXp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  sessionsCompleted: number;
  totalStepsCompleted: number;
  qualifyingEvaluations: number;
  averageReasoning: number | null;
  stableConcepts: number;
  activeDays: number;
  engagedCategories: string[];
  capabilityTier: number;
  memoryIntegrityScore: number;
  activeBadgeCount: number;
  updatedAt: string;
}

export interface IStreakDayDto {
  day: string;
  qualified: boolean;
  qualifyingEvaluationCount: number;
  totalEvaluationCount: number;
  sessionCompletionCount: number;
}

export interface IStreakStatusDto {
  userId: UserId;
  studyMode: StudyMode;
  currentStreak: number;
  longestStreak: number;
  lastQualifiedDay: string | null;
  todayQualified: boolean;
  days: IStreakDayDto[];
}

export interface IBadgeProjectionDto {
  badgeId: string;
  name: string;
  description: string;
  status: GamificationBadgeStatus;
  reason: string;
  conceptId?: ConceptId;
  awardedAt: string | null;
  revokedAt: string | null;
  updatedAt: string;
}

export interface IAchievementProjectionDto {
  achievementId: string;
  name: string;
  description: string;
  status: GamificationAchievementStatus;
  progress: number;
  unlockedAt: string | null;
  updatedAt: string;
}

export interface ICapabilityTierRequirementDto {
  tier: number;
  minStepsCompleted: number;
  minCategoriesEngaged: number;
  minDaysActive: number;
  minSessionsCompleted: number;
  minAverageReasoning: number;
}

export interface ICapabilityTierProgressDto {
  userId: UserId;
  studyMode: StudyMode;
  currentTier: number;
  nextTier: number | null;
  progressRatio: number;
  categoriesEngaged: number;
  activeDays: number;
  requirements: ICapabilityTierRequirementDto[];
  achievements: IAchievementProjectionDto[];
}
