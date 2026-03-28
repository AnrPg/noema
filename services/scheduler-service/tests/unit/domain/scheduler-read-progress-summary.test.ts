import type { UserId } from '@noema/types';
import { describe, expect, it, vi } from 'vitest';

import { SchedulerReadService } from '../../../src/domain/scheduler-service/scheduler-read.service.js';
import type { ISchedulerCard } from '../../../src/types/scheduler.types.js';

const TEST_USER_ID = 'usr_test' as UserId;

function iso(date: Date): string {
  return date.toISOString();
}

function buildCard(overrides: Partial<ISchedulerCard>): ISchedulerCard {
  const now = new Date();

  return {
    id: 'sch_default',
    cardId: 'crd_default',
    userId: TEST_USER_ID,
    studyMode: 'knowledge_gaining',
    lane: 'retention',
    stability: 12,
    difficultyParameter: 4,
    halfLife: null,
    interval: 7,
    nextReviewDate: iso(now),
    lastReviewedAt: iso(new Date(now.getTime() - 86_400_000)),
    reviewCount: 3,
    lapseCount: 0,
    consecutiveCorrect: 2,
    schedulingAlgorithm: 'fsrs',
    cardType: 'basic_recall',
    difficulty: 'medium',
    knowledgeNodeIds: [],
    state: 'review',
    suspendedUntil: null,
    suspendedReason: null,
    createdAt: iso(new Date(now.getTime() - 10 * 86_400_000)),
    updatedAt: iso(now),
    version: 1,
    ...overrides,
  };
}

describe('SchedulerReadService.getProgressSummary', () => {
  it('builds a mode-scoped readiness summary from scheduler cards', async () => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 86_400_000 - 1);

    const cards: ISchedulerCard[] = [
      buildCard({
        id: 'sch_strong',
        cardId: 'crd_strong',
        studyMode: 'language_learning',
        lane: 'retention',
        stability: 45,
        nextReviewDate: iso(new Date(endOfToday.getTime() - 3_600_000)),
        lastReviewedAt: iso(new Date(now.getTime() - 12 * 3_600_000)),
        state: 'review',
        schedulingAlgorithm: 'fsrs',
      }),
      buildCard({
        id: 'sch_fragile',
        cardId: 'crd_fragile',
        studyMode: 'language_learning',
        lane: 'calibration',
        halfLife: 1,
        stability: null,
        nextReviewDate: iso(new Date(startOfToday.getTime() - 3_600_000)),
        lastReviewedAt: iso(new Date(now.getTime() - 4 * 86_400_000)),
        state: 'review',
        schedulingAlgorithm: 'hlr',
      }),
      buildCard({
        id: 'sch_new',
        cardId: 'crd_new',
        studyMode: 'language_learning',
        lane: 'retention',
        reviewCount: 0,
        lastReviewedAt: null,
        nextReviewDate: iso(new Date(endOfToday.getTime() + 86_400_000)),
        state: 'new',
        schedulingAlgorithm: 'fsrs',
      }),
      buildCard({
        id: 'sch_learning',
        cardId: 'crd_learning',
        studyMode: 'language_learning',
        lane: 'retention',
        stability: 4,
        nextReviewDate: iso(new Date(now.getTime() - 30 * 60 * 1000)),
        lastReviewedAt: iso(new Date(now.getTime() - 12 * 3_600_000)),
        state: 'learning',
        schedulingAlgorithm: 'fsrs',
      }),
      buildCard({
        id: 'sch_suspended',
        cardId: 'crd_suspended',
        studyMode: 'language_learning',
        lane: 'calibration',
        halfLife: 8,
        stability: null,
        nextReviewDate: iso(new Date(startOfToday.getTime() - 2 * 3_600_000)),
        lastReviewedAt: iso(new Date(now.getTime() - 86_400_000)),
        state: 'suspended',
        schedulingAlgorithm: 'hlr',
      }),
    ];

    const findByUser = vi.fn().mockResolvedValue(cards);
    const service = new SchedulerReadService({
      schedulerCardRepository: {
        findByUser,
      } as never,
      reviewRepository: {} as never,
    });

    const result = await service.getProgressSummary(TEST_USER_ID, 'language_learning');

    expect(findByUser).toHaveBeenCalledWith(TEST_USER_ID, {
      studyMode: 'language_learning',
    });
    expect(result.data).toMatchObject({
      userId: TEST_USER_ID,
      studyMode: 'language_learning',
      totalCards: 5,
      trackedCards: 4,
      dueNow: 2,
      dueToday: 3,
      overdueCards: 1,
      newCards: 1,
      learningCards: 1,
      matureCards: 2,
      suspendedCards: 1,
      retentionCards: 3,
      calibrationCards: 2,
      fsrsCards: 3,
      hlrCards: 2,
      sm2Cards: 0,
      strongRecallCards: 2,
      fragileCards: 1,
    });
    expect(result.data.averageRecallProbability).not.toBeNull();
    expect(result.agentHints.reasoning).toContain('due now');
  });
});
