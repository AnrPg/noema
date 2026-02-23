import { describe, expect, it, vi } from 'vitest';

import {
    buildExecutionContext,
    type ISchedulerServiceRepositories,
    SchedulerService,
} from '../../../src/domain/scheduler-service/scheduler.service.js';
import type { IEventPublisher } from '../../../src/domain/shared/event-publisher.js';
import type {
    CardId,
    CorrelationId,
    ICardScheduleDecision,
    UserId,
} from '../../../src/types/scheduler.types.js';

const TEST_USER_ID = 'user_abcdefghijklmnopqrstu' as UserId;
const TEST_CORRELATION_ID = 'correlation_abcdefghijkl' as CorrelationId;

function createPublisher(): IEventPublisher {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

function ctx() {
  return buildExecutionContext(TEST_USER_ID, TEST_CORRELATION_ID);
}

function cardId(prefix: string): CardId {
  return `card_${prefix.padEnd(21, 'a').slice(0, 21)}` as CardId;
}

function makeRepositories(
  overrides?: Partial<ISchedulerServiceRepositories['schedulerCardRepository']>
): ISchedulerServiceRepositories {
  const schedulerCardRepository: ISchedulerServiceRepositories['schedulerCardRepository'] = {
    findByCard: vi.fn().mockResolvedValue(null),
    getByCard: vi.fn(),
    findByUser: vi.fn(),
    findDueCards: vi.fn(),
    findByLane: vi.fn(),
    findByState: vi.fn(),
    count: vi.fn(),
    countDue: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createBatch: vi.fn(),
    ...overrides,
  };

  return {
    schedulerCardRepository,
    reviewRepository: {} as ISchedulerServiceRepositories['reviewRepository'],
    calibrationDataRepository: {} as ISchedulerServiceRepositories['calibrationDataRepository'],
  };
}

function makeProvenanceRepositories(): ISchedulerServiceRepositories {
  return {
    ...makeRepositories(),
    provenanceRepository: {
      recordProposal: vi.fn().mockResolvedValue(undefined),
      recordCommit: vi.fn().mockResolvedValue(undefined),
      recordCohortLineage: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('SchedulerService Phase 2 methods', () => {
  it('proposeReviewWindows returns deterministic decisions and emits proposal event', async () => {
    const publisher = createPublisher();
    const repositories = makeProvenanceRepositories();
    const service = new SchedulerService(publisher, repositories);

    const input = {
      userId: TEST_USER_ID,
      asOf: '2026-02-23T12:00:00.000Z',
      cards: [
        {
          cardId: cardId('reviewwindow000000001'),
          algorithm: 'fsrs',
          stability: 6,
        },
        {
          cardId: cardId('reviewwindow000000002'),
          algorithm: 'hlr',
          stability: 4,
        },
      ],
    };

    const result = await service.proposeReviewWindows(input, ctx());

    expect(result.data.decisions).toHaveLength(2);
    expect(result.data.decisions[0]?.intervalDays).toBe(6);
    expect(result.data.decisions[0]?.lane).toBe('retention');
    expect(result.data.decisions[1]?.intervalDays).toBe(3);
    expect(result.data.decisions[1]?.lane).toBe('calibration');
    expect(result.data.policyVersion.version).toBe('scheduler.policy.v1');

    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(repositories.provenanceRepository?.recordProposal).toHaveBeenCalledTimes(1);
    expect(repositories.provenanceRepository?.recordCohortLineage).toHaveBeenCalledTimes(1);
  });

  it('proposeSessionCandidates is deterministic and stable for tie breaks', async () => {
    const publisher = createPublisher();
    const service = new SchedulerService(publisher);

    const input = {
      userId: TEST_USER_ID,
      cards: [
        {
          cardId: cardId('candidate00000000001'),
          lane: 'retention' as const,
          dueAt: '2026-02-20T00:00:00.000Z',
          retentionProbability: 0.2,
        },
        {
          cardId: cardId('candidate00000000002'),
          lane: 'retention' as const,
          dueAt: '2026-02-20T00:00:00.000Z',
          retentionProbability: 0.2,
        },
        {
          cardId: cardId('candidate00000000003'),
          lane: 'calibration' as const,
          dueAt: '2026-02-20T00:00:00.000Z',
          retentionProbability: 0.4,
        },
      ],
      constraints: {
        targetCards: 2,
      },
    };

    const first = await service.proposeSessionCandidates(input, ctx());
    const second = await service.proposeSessionCandidates(input, ctx());

    expect(first.data.selectedCardIds).toEqual(second.data.selectedCardIds);
    expect(first.data.scores).toEqual(second.data.scores);
    expect(first.data.selectedCardIds).toEqual([
      cardId('candidate00000000001'),
      cardId('candidate00000000002'),
    ]);
    expect(publisher.publish).toHaveBeenCalledTimes(2);
  });

  it('simulateSessionCandidates is side-effect free', async () => {
    const publisher = createPublisher();
    const repositories = makeProvenanceRepositories();
    const service = new SchedulerService(publisher, repositories);

    const input = {
      userId: TEST_USER_ID,
      cards: [
        {
          cardId: cardId('sim000000000000001'),
          lane: 'retention' as const,
          dueAt: '2026-02-20T00:00:00.000Z',
          retentionProbability: 0.3,
        },
      ],
      constraints: {
        targetCards: 1,
      },
    };

    const result = await service.simulateSessionCandidates(input, ctx());

    expect(result.data.sideEffectFree).toBe(true);
    expect(result.data.selectedCardIds).toEqual([cardId('sim000000000000001')]);
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(repositories.provenanceRepository?.recordProposal).not.toHaveBeenCalled();
    expect(repositories.provenanceRepository?.recordCommit).not.toHaveBeenCalled();
    expect(repositories.provenanceRepository?.recordCohortLineage).not.toHaveBeenCalled();
  });

  it('commitCardSchedule creates scheduler card when missing', async () => {
    const publisher = createPublisher();
    const repositories = {
      ...makeRepositories({
      findByCard: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ version: 1 }),
      }),
      provenanceRepository: {
        recordProposal: vi.fn().mockResolvedValue(undefined),
        recordCommit: vi.fn().mockResolvedValue(undefined),
        recordCohortLineage: vi.fn().mockResolvedValue(undefined),
      },
    };
    const service = new SchedulerService(publisher, repositories);

    const decision: ICardScheduleDecision = {
      cardId: cardId('commit0000000000001'),
      nextReviewAt: '2026-02-24T12:00:00.000Z',
      intervalDays: 2,
      lane: 'retention',
      algorithm: 'fsrs',
      rationale: 'test',
    };

    const result = await service.commitCardSchedule(
      {
        userId: TEST_USER_ID,
        decision,
        policyVersion: { version: 'scheduler.policy.v1' },
        orchestration: {
          proposalId: 'prop_test',
          decisionId: 'dec_test',
          sessionRevision: 1,
        },
      },
      ctx()
    );

    expect(repositories.schedulerCardRepository.create).toHaveBeenCalledTimes(1);
    expect(result.data.status).toBe('committed');
    expect(result.data.cardId).toBe(decision.cardId);
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(repositories.provenanceRepository.recordCommit).toHaveBeenCalledTimes(1);
    expect(repositories.provenanceRepository.recordCohortLineage).toHaveBeenCalledTimes(1);
  });

  it('commitCardScheduleBatch updates existing cards and returns counts', async () => {
    const publisher = createPublisher();
    const repositories = makeRepositories({
      findByCard: vi.fn().mockResolvedValue({ version: 3 }),
      update: vi.fn().mockResolvedValue({ version: 4 }),
    });
    const service = new SchedulerService(publisher, repositories);

    const decisions: ICardScheduleDecision[] = [
      {
        cardId: cardId('batchcommit00000001'),
        nextReviewAt: '2026-02-24T12:00:00.000Z',
        intervalDays: 2,
        lane: 'retention',
        algorithm: 'fsrs',
        rationale: 'test-a',
      },
      {
        cardId: cardId('batchcommit00000002'),
        nextReviewAt: '2026-02-25T12:00:00.000Z',
        intervalDays: 3,
        lane: 'calibration',
        algorithm: 'hlr',
        rationale: 'test-b',
      },
    ];

    const result = await service.commitCardScheduleBatch(
      {
        userId: TEST_USER_ID,
        decisions,
        source: 'agent',
        policyVersion: { version: 'scheduler.policy.v1' },
        orchestration: {
          proposalId: 'prop_batch',
          decisionId: 'dec_batch',
          sessionRevision: 2,
        },
      },
      ctx()
    );

    expect(repositories.schedulerCardRepository.update).toHaveBeenCalledTimes(2);
    expect(result.data.accepted).toBe(2);
    expect(result.data.rejected).toBe(0);
    expect(result.data.updatedCardIds).toEqual([
      cardId('batchcommit00000001'),
      cardId('batchcommit00000002'),
    ]);
    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });
});
