/**
 * Unit tests for SessionStartedConsumer.
 *
 * Tests the domain logic in handleSessionStarted:
 * - Creates SchedulerCard records for each card in initialCardIds
 * - Skips cards that already have a SchedulerCard record (idempotency)
 * - Does nothing when initialCardIds is empty or absent
 * - Ignores non-session.started events
 */

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
import type { ISchedulerConsumerDependencies } from '../../../src/events/consumers/scheduler-base-consumer.js';
import { SessionStartedConsumer } from '../../../src/events/consumers/session-started.consumer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRedis() {
  return {
    xgroup: vi.fn().mockResolvedValue('OK'),
    xreadgroup: vi.fn().mockResolvedValue(null),
    xack: vi.fn().mockResolvedValue(1),
    xadd: vi.fn().mockResolvedValue('1-0'),
    xautoclaim: vi.fn().mockResolvedValue(['0-0', []]),
  } as unknown as Redis;
}

type CardRepoOverride = Partial<ISchedulerCardRepository>;

function createConsumer(cardRepoOverrides?: CardRepoOverride) {
  const schedulerCardRepository: ISchedulerCardRepository = {
    findByCard: vi.fn().mockResolvedValue(null),
    getByCard: vi.fn(),
    findByUser: vi.fn(),
    findDueCards: vi.fn(),
    findByLane: vi.fn(),
    findByState: vi.fn(),
    count: vi.fn(),
    countDue: vi.fn(),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn(),
    delete: vi.fn(),
    deleteByUser: vi.fn(),
    createBatch: vi.fn(),
    findByUserPaginated: vi.fn(),
    countByUserFiltered: vi.fn(),
    findReviewableByUser: vi.fn(),
    ...cardRepoOverrides,
  };

  const reliabilityRepository: ISchedulerEventReliabilityRepository = {
    claimInbox: vi.fn().mockResolvedValue({ status: 'claimed' }),
    markInboxProcessed: vi.fn().mockResolvedValue(undefined),
    markInboxFailed: vi.fn().mockResolvedValue(undefined),
    readLatestSessionRevision: vi.fn().mockResolvedValue(null),
    applyHandshakeTransition: vi.fn().mockResolvedValue(undefined),
  };

  const deps: ISchedulerConsumerDependencies = {
    schedulerCardRepository,
    reviewRepository: {} as IReviewRepository,
    calibrationDataRepository: {} as ICalibrationDataRepository,
    reliabilityRepository,
    eventPublisher: { publish: vi.fn(), publishBatch: vi.fn() } as IEventPublisher,
  };

  const consumer = new SessionStartedConsumer(
    createRedis(),
    pino({ enabled: false }),
    'test-consumer'
  );
  consumer.setDependencies(deps);

  return { consumer, schedulerCardRepository, reliabilityRepository };
}

async function dispatch(consumer: SessionStartedConsumer, payload: unknown, messageId = '1-0') {
  const envelope = {
    eventType: 'session.started',
    aggregateType: 'Session',
    aggregateId: 'ses_test001',
    payload,
    metadata: { correlationId: 'cor_test001', userId: 'usr_test001' },
  };
  await (
    consumer as unknown as {
      handleStreamMessage(id: string, fields: string[]): Promise<void>;
    }
  ).handleStreamMessage(messageId, ['event', JSON.stringify(envelope)]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionStartedConsumer — handleSessionStarted', () => {
  it('creates a SchedulerCard for each card in initialCardIds', async () => {
    const { consumer, schedulerCardRepository } = createConsumer();

    await dispatch(consumer, {
      userId: 'usr_abcdefghijklmnopqrstu',
      initialQueueSize: 3,
      initialCardIds: ['card_aaaaaaaaaaaaaaaaaaaaa', 'card_bbbbbbbbbbbbbbbbbbbbb'],
    });

    expect(schedulerCardRepository.create).toHaveBeenCalledTimes(2);

    const firstCall = (schedulerCardRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstCall.cardId).toBe('card_aaaaaaaaaaaaaaaaaaaaa');
    expect(firstCall.userId).toBe('usr_abcdefghijklmnopqrstu');
    expect(firstCall.lane).toBe('retention');
    expect(firstCall.schedulingAlgorithm).toBe('fsrs');
  });

  it('does NOT create a card that already has a SchedulerCard record', async () => {
    const existingCard = { id: 'sc_exists', cardId: 'card_aaaaaaaaaaaaaaaaaaaaa', version: 1 };
    const { consumer, schedulerCardRepository } = createConsumer({
      findByCard: vi.fn().mockResolvedValue(existingCard),
    });

    await dispatch(consumer, {
      userId: 'usr_abcdefghijklmnopqrstu',
      initialQueueSize: 1,
      initialCardIds: ['card_aaaaaaaaaaaaaaaaaaaaa'],
    });

    expect(schedulerCardRepository.create).not.toHaveBeenCalled();
  });

  it('creates for new cards and skips existing cards in the same batch', async () => {
    const existingCard = { id: 'sc_exists', cardId: 'card_bbbbbbbbbbbbbbbbbbbbb', version: 1 };
    const { consumer, schedulerCardRepository } = createConsumer({
      findByCard: vi
        .fn()
        .mockResolvedValueOnce(null) // card_a: new
        .mockResolvedValueOnce(existingCard), // card_b: exists
    });

    await dispatch(consumer, {
      userId: 'usr_abcdefghijklmnopqrstu',
      initialQueueSize: 2,
      initialCardIds: ['card_aaaaaaaaaaaaaaaaaaaaa', 'card_bbbbbbbbbbbbbbbbbbbbb'],
    });

    expect(schedulerCardRepository.create).toHaveBeenCalledTimes(1);
    const created = (schedulerCardRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.cardId).toBe('card_aaaaaaaaaaaaaaaaaaaaa');
  });

  it('skips processing when initialCardIds is empty', async () => {
    const { consumer, schedulerCardRepository } = createConsumer();

    await dispatch(consumer, {
      userId: 'usr_abcdefghijklmnopqrstu',
      initialQueueSize: 0,
      initialCardIds: [],
    });

    expect(schedulerCardRepository.create).not.toHaveBeenCalled();
  });

  it('skips processing when initialCardIds is absent', async () => {
    const { consumer, schedulerCardRepository } = createConsumer();

    await dispatch(consumer, {
      userId: 'usr_abcdefghijklmnopqrstu',
      initialQueueSize: 0,
      // initialCardIds omitted
    });

    expect(schedulerCardRepository.create).not.toHaveBeenCalled();
  });

  it('skips unknown event types without touching the card repository', async () => {
    const { consumer, schedulerCardRepository } = createConsumer();

    const envelope = {
      eventType: 'session.ended',
      aggregateType: 'Session',
      aggregateId: 'ses_001',
      payload: {
        userId: 'usr_abcdefghijklmnopqrstu',
        initialCardIds: ['card_aaaaaaaaaaaaaaaaaaaaa'],
      },
      metadata: {},
    };
    await (
      consumer as unknown as {
        handleStreamMessage(id: string, fields: string[]): Promise<void>;
      }
    ).handleStreamMessage('1-0', ['event', JSON.stringify(envelope)]);

    expect(schedulerCardRepository.create).not.toHaveBeenCalled();
  });

  it('ACKs to Redis stream after processing', async () => {
    const redis = createRedis();
    const consumer = new SessionStartedConsumer(redis, pino({ enabled: false }), 'test-consumer');
    consumer.setDependencies({
      schedulerCardRepository: {
        findByCard: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined),
      } as unknown as ISchedulerCardRepository,
      reviewRepository: {} as IReviewRepository,
      calibrationDataRepository: {} as ICalibrationDataRepository,
      reliabilityRepository: {
        claimInbox: vi.fn().mockResolvedValue({ status: 'claimed' }),
        markInboxProcessed: vi.fn().mockResolvedValue(undefined),
        markInboxFailed: vi.fn().mockResolvedValue(undefined),
        readLatestSessionRevision: vi.fn().mockResolvedValue(null),
        applyHandshakeTransition: vi.fn().mockResolvedValue(undefined),
      },
      eventPublisher: { publish: vi.fn(), publishBatch: vi.fn() } as IEventPublisher,
    });

    const envelope = {
      eventType: 'session.started',
      aggregateType: 'Session',
      aggregateId: 'ses_001',
      payload: {
        userId: 'usr_abcdefghijklmnopqrstu',
        initialQueueSize: 1,
        initialCardIds: ['card_aaaaaaaaaaaaaaaaaaaaa'],
      },
      metadata: { correlationId: 'cor_001' },
    };
    await (
      consumer as unknown as {
        handleStreamMessage(id: string, fields: string[]): Promise<void>;
      }
    ).handleStreamMessage('5-0', ['event', JSON.stringify(envelope)]);

    expect((redis as unknown as { xack: ReturnType<typeof vi.fn> }).xack).toHaveBeenCalledTimes(1);
  });
});
