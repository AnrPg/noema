/**
 * Unit tests for ContentSeededConsumer.
 *
 * Tests the domain logic in handleContentSeeded covering:
 * - Creates a SchedulerCard for each cardId in the 'cardIds' array field
 * - Creates a SchedulerCard from the singular 'cardId' field
 * - Handles both fields together, deduplicating via existing-card check
 * - Skips payloads where 'lane' is invalid or absent
 * - Skips payloads that fail Zod validation entirely
 * - Skips cards that already have a SchedulerCard (idempotency)
 * - Ignores non-content.seeded event types
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
import { ContentSeededConsumer } from '../../../src/events/consumers/content-seeded.consumer.js';
import type { ISchedulerConsumerDependencies } from '../../../src/events/consumers/scheduler-base-consumer.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'usr_abcdefghijklmnopqrstu';
const CARD_A = 'card_aaaaaaaaaaaaaaaaaaaaa';
const CARD_B = 'card_bbbbbbbbbbbbbbbbbbbbb';
const CARD_C = 'card_ccccccccccccccccccccc';

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

function createConsumer(cardRepoOverrides: Partial<ISchedulerCardRepository> = {}) {
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

  const consumer = new ContentSeededConsumer(
    createRedis(),
    pino({ enabled: false }),
    'test-consumer'
  );
  consumer.setDependencies(deps);

  return { consumer, schedulerCardRepository };
}

async function dispatch(
  consumer: ContentSeededConsumer,
  payload: unknown,
  eventType = 'content.seeded',
  messageId = '1-0'
) {
  const envelope = {
    eventType,
    aggregateType: 'Content',
    aggregateId: 'cnt_test001',
    payload,
    metadata: { correlationId: 'cor_test001' },
  };
  await (
    consumer as unknown as {
      handleStreamMessage(id: string, fields: string[]): Promise<void>;
    }
  ).handleStreamMessage(messageId, ['event', JSON.stringify(envelope)]);
}

// ---------------------------------------------------------------------------
// Tests — cardIds array field
// ---------------------------------------------------------------------------

describe('ContentSeededConsumer — cardIds array', () => {
  it('creates a SchedulerCard for each cardId in the cardIds array', async () => {
    const { consumer, schedulerCardRepository } = createConsumer();

    await dispatch(consumer, {
      userId: USER_ID,
      cardIds: [CARD_A, CARD_B, CARD_C],
      lane: 'retention',
    });

    expect(schedulerCardRepository.create).toHaveBeenCalledTimes(3);

    const ids = (schedulerCardRepository.create as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0].cardId as string
    );
    expect(ids).toContain(CARD_A);
    expect(ids).toContain(CARD_B);
    expect(ids).toContain(CARD_C);
  });

  it('assigns lane and schedulingAlgorithm correctly for retention', async () => {
    const { consumer, schedulerCardRepository } = createConsumer();

    await dispatch(consumer, { userId: USER_ID, cardIds: [CARD_A], lane: 'retention' });

    const created = (schedulerCardRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.lane).toBe('retention');
    expect(created.schedulingAlgorithm).toBe('fsrs');
    expect(created.userId).toBe(USER_ID);
  });

  it('assigns lane and schedulingAlgorithm correctly for calibration', async () => {
    const { consumer, schedulerCardRepository } = createConsumer();

    await dispatch(consumer, { userId: USER_ID, cardIds: [CARD_A], lane: 'calibration' });

    const created = (schedulerCardRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.lane).toBe('calibration');
    expect(created.schedulingAlgorithm).toBe('hlr');
  });

  it('initialises new cards with state "new" and reviewCount 0', async () => {
    const { consumer, schedulerCardRepository } = createConsumer();

    await dispatch(consumer, { userId: USER_ID, cardIds: [CARD_A], lane: 'retention' });

    const created = (schedulerCardRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.state).toBe('new');
    expect(created.reviewCount).toBe(0);
    expect(created.lapseCount).toBe(0);
    expect(created.interval).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — singular cardId field
// ---------------------------------------------------------------------------

describe('ContentSeededConsumer — singular cardId field', () => {
  it('creates a SchedulerCard from the singular cardId field', async () => {
    const { consumer, schedulerCardRepository } = createConsumer();

    await dispatch(consumer, { userId: USER_ID, cardId: CARD_A, lane: 'retention' });

    expect(schedulerCardRepository.create).toHaveBeenCalledTimes(1);
    const created = (schedulerCardRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.cardId).toBe(CARD_A);
  });

  it('creates cards for both cardIds array AND singular cardId', async () => {
    const { consumer, schedulerCardRepository } = createConsumer();

    await dispatch(consumer, {
      userId: USER_ID,
      cardIds: [CARD_A, CARD_B],
      cardId: CARD_C,
      lane: 'retention',
    });

    expect(schedulerCardRepository.create).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Tests — idempotency
// ---------------------------------------------------------------------------

describe('ContentSeededConsumer — idempotency (card already exists)', () => {
  it('skips a cardId that already has a SchedulerCard record', async () => {
    const existingCard = { id: 'sc_existing', cardId: CARD_A, version: 1 };
    const { consumer, schedulerCardRepository } = createConsumer({
      findByCard: vi.fn().mockResolvedValue(existingCard),
    });

    await dispatch(consumer, { userId: USER_ID, cardIds: [CARD_A], lane: 'retention' });

    expect(schedulerCardRepository.create).not.toHaveBeenCalled();
  });

  it('creates only new cards when mixed with existing ones', async () => {
    const existingCard = { id: 'sc_existing', cardId: CARD_A, version: 1 };
    const { consumer, schedulerCardRepository } = createConsumer({
      findByCard: vi
        .fn()
        .mockResolvedValueOnce(existingCard) // CARD_A: exists
        .mockResolvedValueOnce(null), // CARD_B: new
    });

    await dispatch(consumer, { userId: USER_ID, cardIds: [CARD_A, CARD_B], lane: 'retention' });

    expect(schedulerCardRepository.create).toHaveBeenCalledTimes(1);
    const created = (schedulerCardRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.cardId).toBe(CARD_B);
  });
});

// ---------------------------------------------------------------------------
// Tests — invalid payloads
// ---------------------------------------------------------------------------

describe('ContentSeededConsumer — invalid / missing payloads', () => {
  it('skips when lane is invalid', async () => {
    const { consumer, schedulerCardRepository } = createConsumer();

    await dispatch(consumer, { userId: USER_ID, cardIds: [CARD_A], lane: 'turbo' });

    expect(schedulerCardRepository.create).not.toHaveBeenCalled();
  });

  it('skips when both cardIds and cardId are absent', async () => {
    const { consumer, schedulerCardRepository } = createConsumer();

    await dispatch(consumer, { userId: USER_ID, lane: 'retention' });

    expect(schedulerCardRepository.create).not.toHaveBeenCalled();
  });

  it('skips entirely when userId is missing (Zod parse fails)', async () => {
    const { consumer, schedulerCardRepository } = createConsumer();

    // userId is required (min-length 1 string)
    await dispatch(consumer, { cardIds: [CARD_A], lane: 'retention' });

    expect(schedulerCardRepository.create).not.toHaveBeenCalled();
  });

  it('ignores non-content.seeded event types', async () => {
    const { consumer, schedulerCardRepository } = createConsumer();

    await dispatch(
      consumer,
      { userId: USER_ID, cardIds: [CARD_A], lane: 'retention' },
      'content.updated'
    );

    expect(schedulerCardRepository.create).not.toHaveBeenCalled();
  });
});
