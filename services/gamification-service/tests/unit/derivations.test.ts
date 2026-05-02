import { describe, expect, it } from 'vitest';
import {
  computeCapabilityTier,
  computeCurrentStreak,
  computeMemoryIntegrityScore,
  determineLevel,
  updateAchievements,
} from '../../src/domain/gamification-service/derivations.js';

describe('gamification derivations', () => {
  it('does not qualify low reasoning for streak math', () => {
    const streak = computeCurrentStreak([
      {
        day: '2026-05-01',
        qualified: false,
        qualifyingEvaluationCount: 0,
        totalEvaluationCount: 1,
        sessionCompletionCount: 1,
      },
    ]);

    expect(streak.currentStreak).toBe(0);
  });

  it('calculates monotonic xp levels', () => {
    expect(determineLevel(50, [0, 100, 250])).toBe(1);
    expect(determineLevel(260, [0, 100, 250])).toBe(3);
  });

  it('honors capability tier thresholds', () => {
    const tier = computeCapabilityTier(
      {
        userId: 'user_ABCDEFGHIJKLMNOPQRSTU',
        studyMode: 'knowledge_gaining',
        totalXp: 400,
        level: 4,
        currentStreak: 3,
        longestStreak: 3,
        lastQualifiedDay: '2026-05-03',
        sessionsCompleted: 4,
        totalStepsCompleted: 20,
        qualifyingEvaluations: 10,
        averageReasoning: 0.6,
        stableConcepts: 3,
        activeDays: 5,
        engagedCategories: ['a', 'b'],
        capabilityTier: 0,
        memoryIntegrityScore: 0,
        lastUnstableFlipAt: null,
      },
      [
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
          minStepsCompleted: 10,
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
      ]
    );

    expect(tier).toBe(2);
  });

  it('changes memory integrity with stability and reasoning', () => {
    const low = computeMemoryIntegrityScore({
      userId: 'user_ABCDEFGHIJKLMNOPQRSTU',
      studyMode: 'knowledge_gaining',
      totalXp: 0,
      level: 1,
      currentStreak: 0,
      longestStreak: 0,
      lastQualifiedDay: null,
      sessionsCompleted: 0,
      totalStepsCompleted: 0,
      qualifyingEvaluations: 0,
      averageReasoning: 0.2,
      stableConcepts: 1,
      activeDays: 0,
      engagedCategories: [],
      capabilityTier: 0,
      memoryIntegrityScore: 0,
      lastUnstableFlipAt: new Date().toISOString(),
    });
    const high = computeMemoryIntegrityScore({
      userId: 'user_ABCDEFGHIJKLMNOPQRSTU',
      studyMode: 'knowledge_gaining',
      totalXp: 0,
      level: 1,
      currentStreak: 0,
      longestStreak: 0,
      lastQualifiedDay: null,
      sessionsCompleted: 0,
      totalStepsCompleted: 0,
      qualifyingEvaluations: 0,
      averageReasoning: 0.8,
      stableConcepts: 8,
      activeDays: 0,
      engagedCategories: [],
      capabilityTier: 0,
      memoryIntegrityScore: 0,
      lastUnstableFlipAt: null,
    });

    expect(high).toBeGreaterThan(low);
  });

  it('unlocks stable-five when stable concept count grows', () => {
    const achievements = updateAchievements({
      projection: {
        userId: 'user_ABCDEFGHIJKLMNOPQRSTU',
        studyMode: 'knowledge_gaining',
        totalXp: 0,
        level: 1,
        currentStreak: 1,
        longestStreak: 1,
        lastQualifiedDay: '2026-05-03',
        sessionsCompleted: 2,
        totalStepsCompleted: 12,
        qualifyingEvaluations: 3,
        averageReasoning: 0.65,
        stableConcepts: 5,
        activeDays: 3,
        engagedCategories: ['a'],
        capabilityTier: 1,
        memoryIntegrityScore: 0,
        lastUnstableFlipAt: null,
      },
      streakDays: [],
      badges: [],
      achievements: [],
    });

    expect(achievements.find((item) => item.achievementId === 'stable-five')?.status).toBe(
      'active'
    );
  });
});
