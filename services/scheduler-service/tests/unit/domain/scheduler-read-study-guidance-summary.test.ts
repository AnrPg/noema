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

describe('SchedulerReadService.getStudyGuidanceSummary', () => {
  it('returns an ordered list of simple recommendations', async () => {
    const now = new Date();
    const cards: ISchedulerCard[] = [
      buildCard({
        id: 'sch_overdue',
        cardId: 'crd_overdue',
        nextReviewDate: iso(new Date(now.getTime() - 2 * 86_400_000)),
        stability: 2,
        lastReviewedAt: iso(new Date(now.getTime() - 4 * 86_400_000)),
      }),
      buildCard({
        id: 'sch_fragile',
        cardId: 'crd_fragile',
        lane: 'calibration',
        halfLife: 1,
        stability: null,
        schedulingAlgorithm: 'hlr',
        nextReviewDate: iso(new Date(now.getTime() + 2 * 3_600_000)),
        lastReviewedAt: iso(new Date(now.getTime() - 4 * 86_400_000)),
      }),
      buildCard({
        id: 'sch_due',
        cardId: 'crd_due',
        nextReviewDate: iso(new Date(now.getTime() + 3 * 3_600_000)),
        stability: 10,
      }),
    ];

    const service = new SchedulerReadService({
      schedulerCardRepository: {
        findByUser: vi.fn().mockResolvedValue(cards),
      } as never,
      reviewRepository: {} as never,
    });

    const result = await service.getStudyGuidanceSummary(TEST_USER_ID, 'knowledge_gaining');

    expect(result.data.recommendations.length).toBeGreaterThan(0);
    expect(result.data.recommendations[0]?.action).toBe('clear_overdue');
    expect(result.data.recommendations.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['clear_overdue', 'do_scheduled_reviews'])
    );
  });
});
