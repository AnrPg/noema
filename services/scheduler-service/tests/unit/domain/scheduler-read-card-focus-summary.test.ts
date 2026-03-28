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

describe('SchedulerReadService.getCardFocusSummary', () => {
  it('returns weakest and strongest tracked cards for the active mode', async () => {
    const now = new Date();
    const cards: ISchedulerCard[] = [
      buildCard({
        id: 'sch_fragile',
        cardId: 'crd_fragile',
        studyMode: 'language_learning',
        lane: 'calibration',
        stability: null,
        halfLife: 1,
        nextReviewDate: iso(new Date(now.getTime() - 2 * 86_400_000)),
        lastReviewedAt: iso(new Date(now.getTime() - 4 * 86_400_000)),
        schedulingAlgorithm: 'hlr',
      }),
      buildCard({
        id: 'sch_due_today',
        cardId: 'crd_due_today',
        studyMode: 'language_learning',
        nextReviewDate: iso(new Date(now.getTime() + 2 * 3_600_000)),
        lastReviewedAt: iso(new Date(now.getTime() - 2 * 86_400_000)),
        stability: 5,
      }),
      buildCard({
        id: 'sch_strong',
        cardId: 'crd_strong',
        studyMode: 'language_learning',
        nextReviewDate: iso(new Date(now.getTime() + 7 * 86_400_000)),
        lastReviewedAt: iso(new Date(now.getTime() - 6 * 3_600_000)),
        stability: 60,
        reviewCount: 12,
      }),
      buildCard({
        id: 'sch_new',
        cardId: 'crd_new',
        studyMode: 'language_learning',
        reviewCount: 0,
        lastReviewedAt: null,
        nextReviewDate: iso(new Date(now.getTime() + 3 * 86_400_000)),
        state: 'new',
      }),
    ];

    const service = new SchedulerReadService({
      schedulerCardRepository: {
        findByUser: vi.fn().mockResolvedValue(cards),
      } as never,
      reviewRepository: {} as never,
    });

    const result = await service.getCardFocusSummary(TEST_USER_ID, 'language_learning', 2);

    expect(result.data.weakestCards).toHaveLength(2);
    expect(result.data.strongestCards).toHaveLength(2);
    expect(result.data.weakestCards[0]?.cardId).toBe('crd_fragile');
    expect(result.data.weakestCards[0]?.focusReason).toContain('Overdue');
    expect(result.data.strongestCards[0]?.cardId).toBe('crd_strong');
    expect(result.data.strongestCards[0]?.readinessBand).toBe('stable');
  });
});
