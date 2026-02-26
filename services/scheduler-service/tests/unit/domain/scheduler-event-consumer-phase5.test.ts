import type { Redis } from 'ioredis';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';

import type {
  ICalibrationDataRepository,
  IReviewRepository,
  ISchedulerCardRepository,
  ISchedulerEventReliabilityRepository,
} from '../../../src/domain/scheduler-service/scheduler.repository.js';
import type { IEventPublisher } from '../../../src/domain/shared/event-publisher.js';
import type { BaseEventConsumer } from '../../../src/infrastructure/events/consumers/base-consumer.js';
import { ReviewRecordedConsumer } from '../../../src/infrastructure/events/consumers/review-recorded.consumer.js';
import { SessionCohortConsumer } from '../../../src/infrastructure/events/consumers/session-cohort.consumer.js';

function createRedisStub() {
  return {
    xgroup: vi.fn().mockResolvedValue('OK'),
    xreadgroup: vi.fn().mockResolvedValue(null),
    xack: vi.fn().mockResolvedValue(1),
    xadd: vi.fn().mockResolvedValue('1-0'),
    xautoclaim: vi.fn().mockResolvedValue(['0-0', []]),
  };
}

function createConsumerDeps<T extends BaseEventConsumer>(
  ConsumerClass: new (...args: ConstructorParameters<typeof ReviewRecordedConsumer>) => T,
  overrides?: {
    reliability?: Partial<ISchedulerEventReliabilityRepository>;
    redis?: ReturnType<typeof createRedisStub>;
  },
) {
  const redisStub = overrides?.redis ?? createRedisStub();

  const schedulerCardRepository = {
    findByCard: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
  } as unknown as ISchedulerCardRepository;

  const reviewRepository = {
    findByAttemptId: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
  } as unknown as IReviewRepository;

  const calibrationDataRepository = {
    upsert: vi.fn(),
  } as unknown as ICalibrationDataRepository;

  const reliabilityRepository: ISchedulerEventReliabilityRepository = {
    claimInbox: vi.fn().mockResolvedValue({ status: 'claimed' }),
    markInboxProcessed: vi.fn().mockResolvedValue(undefined),
    markInboxFailed: vi.fn().mockResolvedValue(undefined),
    readLatestSessionRevision: vi.fn().mockResolvedValue(null),
    applyHandshakeTransition: vi.fn().mockResolvedValue(undefined),
    ...overrides?.reliability,
  };

  const eventPublisher: IEventPublisher = {
    publish: vi.fn().mockResolvedValue(undefined),
    publishBatch: vi.fn().mockResolvedValue(undefined),
  };

  const consumer = new ConsumerClass(
    redisStub as unknown as Redis,
    {
      sourceStreamKey: 'noema:events:session-service',
      consumerGroup: 'scheduler-service-group',
      consumerName: 'scheduler-service-1',
      blockMs: 5,
      batchSize: 5,
      retryBaseDelayMs: 1,
      maxProcessAttempts: 3,
      pendingIdleMs: 1,
      pendingBatchSize: 5,
      drainTimeoutMs: 100,
      deadLetterStreamKey: 'noema:events:scheduler-service:dlq',
    },
    {
      schedulerCardRepository,
      reviewRepository,
      calibrationDataRepository,
      reliabilityRepository,
      eventPublisher,
    },
    pino({ enabled: false }),
  );

  return {
    consumer,
    redisStub,
    schedulerCardRepository,
    reviewRepository,
    calibrationDataRepository,
    reliabilityRepository,
    eventPublisher,
  };
}

describe('scheduler event consumer phase 5 reliability', () => {
  it('acks duplicate deliveries without reprocessing', async () => {
    const { consumer, redisStub, reliabilityRepository } = createConsumerDeps(
      ReviewRecordedConsumer,
      {
        reliability: {
          claimInbox: vi.fn().mockResolvedValue({ status: 'duplicate_processed' }),
        },
      },
    );

    const envelope = {
      eventType: 'attempt.recorded',
      aggregateType: 'Attempt',
      aggregateId: 'att_1',
      payload: { attemptId: 'att_1' },
      metadata: { correlationId: 'cor_1', userId: 'usr_1' },
    };

    await (consumer as unknown as { handleStreamMessage: (id: string, fields: string[]) => Promise<void> }).handleStreamMessage('1-0', [
      'event',
      JSON.stringify(envelope),
    ]);

    expect(reliabilityRepository.claimInbox).toHaveBeenCalledTimes(1);
    expect(redisStub.xack).toHaveBeenCalledTimes(1);
  });

  it('marks stale replayed revisions as processed and skips transition logic', async () => {
    const applyHandshakeTransition = vi.fn().mockResolvedValue(undefined);
    const markInboxProcessed = vi.fn().mockResolvedValue(undefined);

    const { consumer, redisStub, reliabilityRepository } = createConsumerDeps(
      SessionCohortConsumer,
      {
        reliability: {
          claimInbox: vi.fn().mockResolvedValue({ status: 'claimed' }),
          readLatestSessionRevision: vi.fn().mockResolvedValue(4),
          applyHandshakeTransition,
          markInboxProcessed,
        },
      },
    );

    const envelope = {
      eventType: 'session.cohort.accepted',
      aggregateType: 'Session',
      aggregateId: 'ses_1',
      payload: {
        userId: 'usr_1',
        linkage: {
          proposalId: 'prop_1',
          decisionId: 'dec_1',
          sessionId: 'ses_1',
          sessionRevision: 3,
          correlationId: 'cor_1',
        },
        acceptedCardIds: ['card_1'],
        excludedCardIds: [],
      },
      metadata: { correlationId: 'cor_1', userId: 'usr_1' },
    };

    await (consumer as unknown as { handleStreamMessage: (id: string, fields: string[]) => Promise<void> }).handleStreamMessage('2-0', [
      'event',
      JSON.stringify(envelope),
    ]);

    expect(reliabilityRepository.readLatestSessionRevision).toHaveBeenCalledWith('ses_1', 'prop_1');
    expect(markInboxProcessed).toHaveBeenCalledTimes(1);
    expect(applyHandshakeTransition).not.toHaveBeenCalled();
    expect(redisStub.xack).toHaveBeenCalledTimes(1);
  });

  it('recovers pending messages on startup using xautoclaim', async () => {
    const redisStub = createRedisStub();
    redisStub.xautoclaim
      .mockResolvedValueOnce([
        '1-1',
        [
          [
            '3-0',
            [
              'event',
              JSON.stringify({
                eventType: 'session.cohort.proposed',
                aggregateType: 'Session',
                aggregateId: 'ses_1',
                payload: {
                  userId: 'usr_1',
                  linkage: {
                    proposalId: 'prop_1',
                    decisionId: 'dec_1',
                    sessionId: 'ses_1',
                    sessionRevision: 1,
                    correlationId: 'cor_1',
                  },
                  candidateCardIds: ['card_1'],
                },
                metadata: { correlationId: 'cor_1', userId: 'usr_1' },
              }),
            ],
          ],
        ],
      ])
      .mockResolvedValueOnce(['1-1', []]);

    const { consumer } = createConsumerDeps(SessionCohortConsumer, { redis: redisStub });

    await (
      consumer as unknown as {
        recoverPendingMessages: () => Promise<void>;
      }
    ).recoverPendingMessages();

    expect(redisStub.xautoclaim).toHaveBeenCalled();
    expect(redisStub.xack).toHaveBeenCalled();
  });
});
