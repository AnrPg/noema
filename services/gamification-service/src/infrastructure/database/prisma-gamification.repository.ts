import {
  GamificationAchievementStatus,
  GamificationBadgeStatus,
  type IAchievementProjectionDto,
  type IBadgeProjectionDto,
  type ICapabilityTierProgressDto,
  type ICapabilityTierRequirementDto,
  type IGamificationSummaryDto,
  type IStreakStatusDto,
} from '@noema/contracts';
import type {
  IConceptStateChangedPayload,
  IGamificationBadgePayload,
  IMetacognitionEvaluationRecordedPayload,
} from '@noema/events';
import type { ISessionCompletedPayload } from '@noema/events/session';
import { ID_PREFIXES, type ConceptId, type StudyMode, type UserId } from '@noema/types';
import { nanoid } from 'nanoid';
import type { Prisma, PrismaClient } from '../../../generated/prisma/index.js';
import {
  buildConceptStabilityBadge,
  computeAverageReasoning,
  computeCapabilityTier,
  computeCurrentStreak,
  computeMemoryIntegrityScore,
  determineLevel,
  isoDay,
  updateAchievements,
} from '../../domain/gamification-service/derivations.js';
import { ProjectionNotFoundError } from '../../domain/gamification-service/errors.js';
import type {
  BadgeRecord,
  IGamificationConfig,
  IGamificationReadModel,
  IGamificationRepository,
  IProcessingContext,
  IProjectionSnapshot,
  IProjectionState,
} from '../../domain/gamification-service/types.js';

function id(prefix: string): string {
  return `${prefix}${nanoid(21)}`;
}

function toPrismaStudyMode(studyMode: StudyMode): 'LANGUAGE_LEARNING' | 'KNOWLEDGE_GAINING' {
  return studyMode === 'language_learning' ? 'LANGUAGE_LEARNING' : 'KNOWLEDGE_GAINING';
}

export class PrismaGamificationRepository implements IGamificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async applyEvaluation(
    payload: IMetacognitionEvaluationRecordedPayload,
    context: IProcessingContext,
    config: IGamificationConfig
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.claimEvent(tx, context))) return;
      const snapshot = await this.ensureSnapshot(
        tx,
        payload.userId,
        payload.studyMode ?? 'knowledge_gaining'
      );
      const day = isoDay(new Date().toISOString());
      const streakDay = await tx.gamificationStreakDay.upsert({
        where: {
          projectionId_day: {
            projectionId: snapshot.projection.id,
            day,
          },
        },
        create: {
          id: id(ID_PREFIXES.StreakId),
          projectionId: snapshot.projection.id,
          day,
          totalEvaluationCount: 1,
          qualifyingEvaluationCount: payload.reasoningQuality >= config.streakThreshold ? 1 : 0,
          qualified: payload.reasoningQuality >= config.streakThreshold,
        },
        update: {
          totalEvaluationCount: { increment: 1 },
          ...(payload.reasoningQuality >= config.streakThreshold
            ? {
                qualifyingEvaluationCount: { increment: 1 },
                qualified: true,
              }
            : {}),
        },
      });

      const xpDelta = Math.max(1, Math.round(payload.combinedScore * config.xpMultiplier));
      const average = computeAverageReasoning(
        snapshot.projection.averageReasoning,
        snapshot.projection.reasoningSampleCount,
        payload.reasoningQuality
      );
      const updatedProjectionBase = {
        totalXp: snapshot.projection.totalXp + xpDelta,
        qualifyingEvaluations:
          snapshot.projection.qualifyingEvaluations +
          (payload.reasoningQuality >= config.streakThreshold ? 1 : 0),
        totalStepsCompleted: snapshot.projection.totalStepsCompleted + 1,
        averageReasoning: average.average,
        reasoningSampleCount: average.samples,
      };
      const streakDays = [
        ...snapshot.streakDays.filter((entry) => entry.day !== day),
        {
          day,
          qualified: streakDay.qualified,
          qualifyingEvaluationCount: streakDay.qualifyingEvaluationCount,
          totalEvaluationCount: streakDay.totalEvaluationCount,
          sessionCompletionCount: streakDay.sessionCompletionCount,
        },
      ];

      const streakStats = computeCurrentStreak(streakDays);
      const projectionCandidate: IProjectionState = {
        userId: snapshot.projection.userId,
        studyMode: snapshot.projection.studyMode,
        totalXp: updatedProjectionBase.totalXp,
        level: determineLevel(updatedProjectionBase.totalXp, config.levelThresholds),
        currentStreak: streakStats.currentStreak,
        longestStreak: Math.max(snapshot.projection.longestStreak, streakStats.longestStreak),
        lastQualifiedDay: streakStats.lastQualifiedDay,
        sessionsCompleted: snapshot.projection.sessionsCompleted,
        totalStepsCompleted: updatedProjectionBase.totalStepsCompleted,
        qualifyingEvaluations: updatedProjectionBase.qualifyingEvaluations,
        averageReasoning: average.average,
        stableConcepts: snapshot.projection.stableConcepts,
        activeDays: snapshot.projection.activeDays,
        engagedCategories: snapshot.projection.engagedCategories,
        capabilityTier: snapshot.projection.capabilityTier,
        memoryIntegrityScore: snapshot.projection.memoryIntegrityScore,
        lastUnstableFlipAt: snapshot.projection.lastUnstableFlipAt,
      };
      projectionCandidate.capabilityTier = computeCapabilityTier(
        projectionCandidate,
        config.capabilityTierThresholds
      );
      projectionCandidate.memoryIntegrityScore = computeMemoryIntegrityScore(projectionCandidate);

      const achievements = updateAchievements({
        projection: projectionCandidate,
        streakDays,
        badges: snapshot.badges,
        achievements: snapshot.achievements,
      });

      await tx.userGamificationProjection.update({
        where: { id: snapshot.projection.id },
        data: {
          totalXp: projectionCandidate.totalXp,
          level: projectionCandidate.level,
          currentStreak: projectionCandidate.currentStreak,
          longestStreak: projectionCandidate.longestStreak,
          lastQualifiedDay: projectionCandidate.lastQualifiedDay,
          qualifyingEvaluations: projectionCandidate.qualifyingEvaluations,
          totalStepsCompleted: projectionCandidate.totalStepsCompleted,
          averageReasoning: projectionCandidate.averageReasoning,
          reasoningSampleCount: average.samples,
          capabilityTier: projectionCandidate.capabilityTier,
          memoryIntegrityScore: projectionCandidate.memoryIntegrityScore,
        },
      });

      await this.persistAchievements(tx, snapshot.projection.id, achievements);
    });
  }

  async applyConceptStateChange(
    payload: IConceptStateChangedPayload,
    context: IProcessingContext,
    config: IGamificationConfig
  ): Promise<IGamificationBadgePayload[]> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.claimEvent(tx, context))) return [];
      const snapshot = await this.ensureSnapshot(tx, payload.userId, payload.studyMode);
      const badgeId = `concept-stability:${payload.conceptId}`;
      const existingBadge = snapshot.badges.find((badge) => badge.badgeId === badgeId);
      const shouldBeActive = payload.toState === 'stable';
      const nextBadge = buildConceptStabilityBadge(payload.conceptId, shouldBeActive);

      if (existingBadge?.status === nextBadge.status) {
        return [];
      }

      await tx.gamificationBadgeProjection.upsert({
        where: {
          projectionId_badgeId: {
            projectionId: snapshot.projection.id,
            badgeId,
          },
        },
        create: {
          id: id(ID_PREFIXES.EventId),
          projectionId: snapshot.projection.id,
          badgeId,
          name: nextBadge.name,
          description: nextBadge.description,
          status: shouldBeActive ? 'ACTIVE' : 'REVOKED',
          reason: nextBadge.reason,
          conceptId: payload.conceptId,
          awardedAt: shouldBeActive
            ? new Date(nextBadge.awardedAt ?? new Date().toISOString())
            : null,
          revokedAt: shouldBeActive
            ? null
            : new Date(nextBadge.revokedAt ?? new Date().toISOString()),
        },
        update: {
          name: nextBadge.name,
          description: nextBadge.description,
          status: shouldBeActive ? 'ACTIVE' : 'REVOKED',
          reason: nextBadge.reason,
          conceptId: payload.conceptId,
          ...(shouldBeActive
            ? {
                awardedAt: new Date(nextBadge.awardedAt ?? new Date().toISOString()),
                revokedAt: null,
              }
            : {
                awardedAt: null,
                revokedAt: new Date(nextBadge.revokedAt ?? new Date().toISOString()),
              }),
        },
      });

      const stableConcepts =
        snapshot.projection.stableConcepts +
        (payload.toState === 'stable' && payload.fromState !== 'stable'
          ? 1
          : payload.fromState === 'stable' && payload.toState !== 'stable'
            ? -1
            : 0);

      const projectionCandidate: IProjectionState = {
        ...snapshot.projection,
        stableConcepts: Math.max(0, stableConcepts),
        lastUnstableFlipAt:
          payload.fromState === 'stable' && payload.toState !== 'stable'
            ? payload.changedAt
            : snapshot.projection.lastUnstableFlipAt,
      };
      projectionCandidate.capabilityTier = computeCapabilityTier(
        projectionCandidate,
        config.capabilityTierThresholds
      );
      projectionCandidate.memoryIntegrityScore = computeMemoryIntegrityScore(projectionCandidate);

      const badgeSnapshot: BadgeRecord[] = [
        ...snapshot.badges.filter((badge) => badge.badgeId !== badgeId),
        nextBadge,
      ];
      const achievements = updateAchievements({
        projection: projectionCandidate,
        streakDays: snapshot.streakDays,
        badges: badgeSnapshot,
        achievements: snapshot.achievements,
      });

      await tx.userGamificationProjection.update({
        where: { id: snapshot.projection.id },
        data: {
          stableConcepts: projectionCandidate.stableConcepts,
          capabilityTier: projectionCandidate.capabilityTier,
          memoryIntegrityScore: projectionCandidate.memoryIntegrityScore,
          lastUnstableFlipAt:
            projectionCandidate.lastUnstableFlipAt === null
              ? null
              : new Date(projectionCandidate.lastUnstableFlipAt),
        },
      });

      await this.persistAchievements(tx, snapshot.projection.id, achievements);

      return [
        {
          userId: payload.userId,
          badgeId,
          reason: nextBadge.reason,
          conceptId: payload.conceptId,
        },
      ];
    });
  }

  async applySessionCompleted(
    payload: ISessionCompletedPayload,
    context: IProcessingContext,
    config: IGamificationConfig
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.claimEvent(tx, context))) return;
      const snapshot = await this.ensureSnapshot(tx, payload.userId, payload.studyMode);
      const day = isoDay(payload.completedAt);

      await tx.gamificationStreakDay.upsert({
        where: {
          projectionId_day: {
            projectionId: snapshot.projection.id,
            day,
          },
        },
        create: {
          id: id(ID_PREFIXES.StreakId),
          projectionId: snapshot.projection.id,
          day,
          sessionCompletionCount: 1,
        },
        update: {
          sessionCompletionCount: { increment: 1 },
        },
      });

      const engagedCategories = Array.from(
        new Set([...snapshot.projection.engagedCategories, ...(payload.sourceCategories ?? [])])
      );
      const existingDay = snapshot.streakDays.find((entry) => entry.day === day);
      const activeDays =
        existingDay === undefined
          ? snapshot.projection.activeDays + 1
          : snapshot.projection.activeDays;

      const projectionCandidate: IProjectionState = {
        ...snapshot.projection,
        sessionsCompleted: snapshot.projection.sessionsCompleted + 1,
        activeDays,
        engagedCategories,
      };
      projectionCandidate.capabilityTier = computeCapabilityTier(
        projectionCandidate,
        config.capabilityTierThresholds
      );
      projectionCandidate.memoryIntegrityScore = computeMemoryIntegrityScore(projectionCandidate);

      const achievements = updateAchievements({
        projection: projectionCandidate,
        streakDays: snapshot.streakDays,
        badges: snapshot.badges,
        achievements: snapshot.achievements,
      });

      await tx.userGamificationProjection.update({
        where: { id: snapshot.projection.id },
        data: {
          sessionsCompleted: projectionCandidate.sessionsCompleted,
          activeDays: projectionCandidate.activeDays,
          engagedCategories,
          capabilityTier: projectionCandidate.capabilityTier,
          memoryIntegrityScore: projectionCandidate.memoryIntegrityScore,
        },
      });

      if (projectionCandidate.capabilityTier !== snapshot.projection.capabilityTier) {
        await tx.capabilityTierHistory.create({
          data: {
            id: id(ID_PREFIXES.EventId),
            projectionId: snapshot.projection.id,
            tier: projectionCandidate.capabilityTier,
            reason: 'Session completion advanced capability progress.',
          },
        });
      }

      await this.persistAchievements(tx, snapshot.projection.id, achievements);
    });
  }

  async getReadModel(userId: UserId, studyMode: StudyMode): Promise<IGamificationReadModel> {
    const snapshot = await this.fetchSnapshot(this.prisma, userId, studyMode);
    if (snapshot === null) {
      throw new ProjectionNotFoundError(userId, studyMode);
    }

    const requirements: ICapabilityTierRequirementDto[] = [
      {
        tier: 0,
        minStepsCompleted: 0,
        minCategoriesEngaged: 0,
        minDaysActive: 0,
        minSessionsCompleted: 0,
        minAverageReasoning: 0,
      },
      {
        tier: 1,
        minStepsCompleted: 5,
        minCategoriesEngaged: 1,
        minDaysActive: 2,
        minSessionsCompleted: 1,
        minAverageReasoning: 0.45,
      },
      {
        tier: 2,
        minStepsCompleted: 15,
        minCategoriesEngaged: 2,
        minDaysActive: 4,
        minSessionsCompleted: 3,
        minAverageReasoning: 0.55,
      },
      {
        tier: 3,
        minStepsCompleted: 30,
        minCategoriesEngaged: 3,
        minDaysActive: 7,
        minSessionsCompleted: 5,
        minAverageReasoning: 0.65,
      },
    ];

    const summary: IGamificationSummaryDto = {
      userId,
      studyMode,
      totalXp: snapshot.projection.totalXp,
      level: snapshot.projection.level,
      currentStreak: snapshot.projection.currentStreak,
      longestStreak: snapshot.projection.longestStreak,
      sessionsCompleted: snapshot.projection.sessionsCompleted,
      totalStepsCompleted: snapshot.projection.totalStepsCompleted,
      qualifyingEvaluations: snapshot.projection.qualifyingEvaluations,
      averageReasoning: snapshot.projection.averageReasoning,
      stableConcepts: snapshot.projection.stableConcepts,
      activeDays: snapshot.projection.activeDays,
      engagedCategories: snapshot.projection.engagedCategories,
      capabilityTier: snapshot.projection.capabilityTier,
      memoryIntegrityScore: snapshot.projection.memoryIntegrityScore,
      activeBadgeCount: snapshot.badges.filter(
        (badge) => badge.status === GamificationBadgeStatus.ACTIVE
      ).length,
      updatedAt: snapshot.projection.updatedAt,
    };

    const streak: IStreakStatusDto = {
      userId,
      studyMode,
      currentStreak: snapshot.projection.currentStreak,
      longestStreak: snapshot.projection.longestStreak,
      lastQualifiedDay: snapshot.projection.lastQualifiedDay,
      todayQualified: snapshot.streakDays.some(
        (day) => day.day === isoDay(new Date().toISOString()) && day.qualified
      ),
      days: snapshot.streakDays.sort((a, b) => a.day.localeCompare(b.day)),
    };

    const progression: ICapabilityTierProgressDto = {
      userId,
      studyMode,
      currentTier: snapshot.projection.capabilityTier,
      nextTier:
        requirements.find((requirement) => requirement.tier > snapshot.projection.capabilityTier)
          ?.tier ?? null,
      progressRatio:
        requirements.length === 0
          ? 0
          : Number((snapshot.projection.capabilityTier / (requirements.length - 1)).toFixed(2)),
      categoriesEngaged: snapshot.projection.engagedCategories.length,
      activeDays: snapshot.projection.activeDays,
      requirements,
      achievements: snapshot.achievements,
    };

    return {
      summary,
      streak,
      badges: snapshot.badges,
      progression,
    };
  }

  private async claimEvent(
    tx: Prisma.TransactionClient,
    context: IProcessingContext
  ): Promise<boolean> {
    const existing = await tx.processedGamificationEvent.findUnique({
      where: { id: context.eventId },
    });
    if (existing !== null) return false;
    await tx.processedGamificationEvent.create({
      data: {
        id: context.eventId,
        eventType: context.eventType,
        aggregateId: context.eventId,
      },
    });
    return true;
  }

  private async ensureSnapshot(
    tx: Prisma.TransactionClient,
    userId: UserId,
    studyMode: StudyMode
  ): Promise<
    IProjectionSnapshot & {
      projection: IProjectionState & {
        id: string;
        averageReasoning: number | null;
        reasoningSampleCount: number;
        updatedAt: string;
      };
    }
  > {
    const existing = await this.fetchSnapshot(tx, userId, studyMode);
    if (existing !== null) return existing;

    const projection = await tx.userGamificationProjection.create({
      data: {
        id: id(ID_PREFIXES.EventId),
        userId,
        studyMode: toPrismaStudyMode(studyMode),
      },
    });
    return {
      projection: {
        id: projection.id,
        userId,
        studyMode,
        totalXp: 0,
        level: 1,
        currentStreak: 0,
        longestStreak: 0,
        lastQualifiedDay: null,
        sessionsCompleted: 0,
        totalStepsCompleted: 0,
        qualifyingEvaluations: 0,
        averageReasoning: null,
        reasoningSampleCount: 0,
        stableConcepts: 0,
        activeDays: 0,
        engagedCategories: [],
        capabilityTier: 0,
        memoryIntegrityScore: 0,
        lastUnstableFlipAt: null,
        updatedAt: projection.updatedAt.toISOString(),
      },
      streakDays: [],
      badges: [],
      achievements: [],
    };
  }

  private async fetchSnapshot(
    db: PrismaClient | Prisma.TransactionClient,
    userId: UserId,
    studyMode: StudyMode
  ): Promise<
    | (IProjectionSnapshot & {
        projection: IProjectionState & {
          id: string;
          averageReasoning: number | null;
          reasoningSampleCount: number;
          updatedAt: string;
        };
      })
    | null
  > {
    const projection = await db.userGamificationProjection.findUnique({
      where: {
        userId_studyMode: {
          userId,
          studyMode: toPrismaStudyMode(studyMode),
        },
      },
      include: {
        streakDays: true,
        badges: true,
        achievements: true,
      },
    });
    if (projection === null) return null;

    return {
      projection: {
        id: projection.id,
        userId,
        studyMode,
        totalXp: projection.totalXp,
        level: projection.level,
        currentStreak: projection.currentStreak,
        longestStreak: projection.longestStreak,
        lastQualifiedDay: projection.lastQualifiedDay,
        sessionsCompleted: projection.sessionsCompleted,
        totalStepsCompleted: projection.totalStepsCompleted,
        qualifyingEvaluations: projection.qualifyingEvaluations,
        averageReasoning: projection.averageReasoning,
        reasoningSampleCount: projection.reasoningSampleCount,
        stableConcepts: projection.stableConcepts,
        activeDays: projection.activeDays,
        engagedCategories: projection.engagedCategories,
        capabilityTier: projection.capabilityTier,
        memoryIntegrityScore: projection.memoryIntegrityScore,
        lastUnstableFlipAt: projection.lastUnstableFlipAt?.toISOString() ?? null,
        updatedAt: projection.updatedAt.toISOString(),
      },
      streakDays: projection.streakDays.map((day) => ({
        day: day.day,
        qualified: day.qualified,
        qualifyingEvaluationCount: day.qualifyingEvaluationCount,
        totalEvaluationCount: day.totalEvaluationCount,
        sessionCompletionCount: day.sessionCompletionCount,
      })),
      badges: projection.badges.map((badge): IBadgeProjectionDto => {
        const record: IBadgeProjectionDto = {
          badgeId: badge.badgeId,
          name: badge.name,
          description: badge.description,
          status:
            badge.status === 'ACTIVE'
              ? GamificationBadgeStatus.ACTIVE
              : GamificationBadgeStatus.REVOKED,
          reason: badge.reason,
          awardedAt: badge.awardedAt?.toISOString() ?? null,
          revokedAt: badge.revokedAt?.toISOString() ?? null,
          updatedAt: badge.updatedAt.toISOString(),
        };
        if (badge.conceptId !== null) {
          record.conceptId = badge.conceptId as unknown as ConceptId;
        }
        return record;
      }),
      achievements: projection.achievements.map(
        (achievement): IAchievementProjectionDto => ({
          achievementId: achievement.achievementId,
          name: achievement.name,
          description: achievement.description,
          status:
            achievement.status === 'ACTIVE'
              ? GamificationAchievementStatus.ACTIVE
              : GamificationAchievementStatus.LOCKED,
          progress: achievement.progress,
          unlockedAt: achievement.unlockedAt?.toISOString() ?? null,
          updatedAt: achievement.updatedAt.toISOString(),
        })
      ),
    };
  }

  private async persistAchievements(
    tx: Prisma.TransactionClient,
    projectionId: string,
    achievements: IAchievementProjectionDto[]
  ): Promise<void> {
    await Promise.all(
      achievements.map((achievement) =>
        tx.gamificationAchievementProjection.upsert({
          where: {
            projectionId_achievementId: {
              projectionId,
              achievementId: achievement.achievementId,
            },
          },
          create: {
            id: id(ID_PREFIXES.AchievementId),
            projectionId,
            achievementId: achievement.achievementId,
            name: achievement.name,
            description: achievement.description,
            status:
              achievement.status === GamificationAchievementStatus.ACTIVE ? 'ACTIVE' : 'LOCKED',
            progress: achievement.progress,
            unlockedAt: achievement.unlockedAt === null ? null : new Date(achievement.unlockedAt),
          },
          update: {
            name: achievement.name,
            description: achievement.description,
            status:
              achievement.status === GamificationAchievementStatus.ACTIVE ? 'ACTIVE' : 'LOCKED',
            progress: achievement.progress,
            unlockedAt: achievement.unlockedAt === null ? null : new Date(achievement.unlockedAt),
          },
        })
      )
    );
  }
}
