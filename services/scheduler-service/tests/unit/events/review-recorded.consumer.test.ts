/**
 * Unit tests for ReviewRecordedConsumer.
 *
 * Tests the domain logic in handleReviewRecorded covering:
 * - Creates a Review record + new SchedulerCard on first review
 * - Creates a Review record + updates existing SchedulerCard on re-review
 * - Idempotency: skips when findByAttemptId returns an existing review
 * - Skips payloads with invalid rating values
 * - Skips payloads with invalid lane values
 * - Handles both 'attempt.recorded' and 'review.submitted' event types
 * - Ignores events with other eventType values
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
import { ReviewRecordedConsumer } from '../../../src/events/consumers/review-recorded.consumer.js';
import type { ISchedulerConsumerDependencies } from '../../../src/events/consumers/scheduler-base-consumer.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CARD_ID = 'card_aaaaaaaaaaaaaaaaaaaaa';
const USER_ID = 'usr_abcdefghijklmnopqrstu';
const SESSION_ID = 'ses_testaaaaaaaaaaaaaaaaaa';
const ATTEMPT_ID = 'att_testaaaaaaaaaaaaaaaaaa';

const MIN_VALID_PAYLOAD = {
  attemptId: ATTEMPT_ID,
  sessionId: SESSION_ID,
  cardId: CARD_ID,
  userId: USER_ID,
  rating: 'good',
  lane: 'retention',
  deltaDays: 1,
};

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

function buildExistingCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sc_existing001',
    cardId: CARD_ID,
    userId: USER_ID,
    lane: 'retention',
    stability: 4.5,
    difficultyParameter: 5.0,
    halfLife: null,
    interval: 4,
    reviewCount: 3,
    lapseCount: 0,
    consecutiveCorrect: 3,
    state: 'review',
    lastReviewedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    cardType: null,
    schedulingAlgorithm: 'fsrs',
    version: 3,
    ...overrides,
  };
}

type ConsumerOverrides = {
  findByAttemptId?: ReturnType<typeof vi.fn>;
  findByCard?: ReturnType<typeof vi.fn>;
  cardCreate?: ReturnType<typeof vi.fn>;
  cardUpdate?: ReturnType<typeof vi.fn>;
  reviewCreate?: ReturnType<typeof vi.fn>;
  calibrationUpsert?: ReturnType<typeof vi.fn>;
};

function createConsumer(overrides: ConsumerOverrides = {}) {
  const schedulerCardRepository: ISchedulerCardRepository = {
    findByCard: overrides.findByCard ?? vi.fn().mockResolvedValue(null),
    getByCard: vi.fn(),
    findByUser: vi.fn(),
    findDueCards: vi.fn(),
    findByLane: vi.fn(),
    findByState: vi.fn(),
    count: vi.fn(),
    countDue: vi.fn(),
    create: overrides.cardCreate ?? vi.fn().mockResolvedValue(undefined),
    update: overrides.cardUpdate ?? vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
    deleteByUser: vi.fn(),
    createBatch: vi.fn(),
    findByUserPaginated: vi.fn(),
    countByUserFiltered: vi.fn(),
    findReviewableByUser: vi.fn(),
  };

  const reviewRepository: IReviewRepository = {
    findById: vi.fn(),
    findByAttemptId: overrides.findByAttemptId ?? vi.fn().mockResolvedValue(null),
    create: overrides.reviewCreate ?? vi.fn().mockResolvedValue(undefined),
    createBatch: vi.fn(),
    findByCard: vi.fn(),
    findByUser: vi.fn(),
    findBySession: vi.fn(),
    countByCard: vi.fn(),
    countByUser: vi.fn(),
    delete: vi.fn(),
    deleteByUser: vi.fn(),
    findByUserPaginated: vi.fn(),
    countByUserFiltered: vi.fn(),
    aggregateStats: vi.fn(),
    reviewsByDay: vi.fn(),
  };

  const calibrationDataRepository: ICalibrationDataRepository = {
    findById: vi.fn(),
    findByCard: vi.fn(),
    findByCardType: vi.fn(),
    findByUser: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: overrides.calibrationUpsert ?? vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
    deleteByUser: vi.fn(),
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
    reviewRepository,
    calibrationDataRepository,
    reliabilityRepository,
    eventPublisher: { publish: vi.fn(), publishBatch: vi.fn() } as IEventPublisher,
  };

  const consumer = new ReviewRecordedConsumer(
    createRedis(),
    pino({ enabled: false }),
    'test-consumer'
  );
  consumer.setDependencies(deps);

  return { consumer, schedulerCardRepository, reviewRepository, calibrationDataRepository };
}

async function dispatch(
  consumer: ReviewRecordedConsumer,
  payload: unknown,
  eventType = 'attempt.recorded',
  messageId = '1-0'
) {
  const envelope = {
    eventType,
    aggregateType: 'Attempt',
    aggregateId: ATTEMPT_ID,
    payload,
    metadata: { correlationId: 'cor_test001', userId: USER_ID },
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

describe('ReviewRecordedConsumer — first review (no existing card)', () => {
  it('creates a Review record and a new SchedulerCard for attempt.recorded', async () => {
    const { consumer, reviewRepository, schedulerCardRepository } = createConsumer();

    await dispatch(consumer, MIN_VALID_PAYLOAD);

    expect(reviewRepository.create).toHaveBeenCalledTimes(1);
    expect(schedulerCardRepository.create).toHaveBeenCalledTimes(1);
    expect(schedulerCardRepository.update).not.toHaveBeenCalled();

    const reviewCall = (reviewRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(reviewCall.attemptId).toBe(ATTEMPT_ID);
    expect(reviewCall.cardId).toBe(CARD_ID);
    expect(reviewCall.userId).toBe(USER_ID);
    expect(reviewCall.lane).toBe('retention');
    expect(reviewCall.rating).toBe('good');

    const cardCall = (schedulerCardRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(cardCall.cardId).toBe(CARD_ID);
    expect(cardCall.userId).toBe(USER_ID);
    expect(cardCall.lane).toBe('retention');
    expect(cardCall.schedulingAlgorithm).toBe('fsrs');
    expect(cardCall.stability).toBeGreaterThan(0);
    expect(cardCall.reviewCount).toBe(1);
  });

  it('creates a new HLR card for calibration lane', async () => {
    const { consumer, schedulerCardRepository } = createConsumer();

    await dispatch(consumer, { ...MIN_VALID_PAYLOAD, lane: 'calibration' });

    const cardCall = (schedulerCardRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(cardCall.lane).toBe('calibration');
    expect(cardCall.schedulingAlgorithm).toBe('hlr');
    expect(cardCall.halfLife).toBeGreaterThan(0);
  });

  it('accepts review.submitted as an equivalent event type', async () => {
    const { consumer, reviewRepository } = createConsumer();

    await dispatch(consumer, MIN_VALID_PAYLOAD, 'review.submitted');

    expect(reviewRepository.create).toHaveBeenCalledTimes(1);
  });
});

describe('ReviewRecordedConsumer — re-review (existing card)', () => {
  it('creates a Review record and updates the existing SchedulerCard', async () => {
    const existing = buildExistingCard();
    const { consumer, reviewRepository, schedulerCardRepository } = createConsumer({
      findByCard: vi.fn().mockResolvedValue(existing),
    });

    await dispatch(consumer, { ...MIN_VALID_PAYLOAD, deltaDays: 4 });

    expect(reviewRepository.create).toHaveBeenCalledTimes(1);
    expect(schedulerCardRepository.create).not.toHaveBeenCalled();
    expect(schedulerCardRepository.update).toHaveBeenCalledTimes(1);

    const updateCall = (schedulerCardRepository.update as ReturnType<typeof vi.fn>).mock.calls[0];
    const [calledUserId, calledCardId, fields] = updateCall;
    expect(calledUserId).toBe(USER_ID);
    expect(calledCardId).toBe(CARD_ID);
    expect(fields.reviewCount).toBe(4); // was 3
    expect(typeof fields.stability).toBe('number');
  });

  it('increments lapseCount when rating is "again"', async () => {
    const existing = buildExistingCard({ lapseCount: 1 });
    const { consumer, schedulerCardRepository } = createConsumer({
      findByCard: vi.fn().mockResolvedValue(existing),
    });

    await dispatch(consumer, { ...MIN_VALID_PAYLOAD, rating: 'again', deltaDays: 1 });

    const updateCall = (schedulerCardRepository.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updateCall[2].lapseCount).toBe(2);
    expect(updateCall[2].consecutiveCorrect).toBe(0);
  });

  it('updates calibration data when lane is calibration', async () => {
    const existing = buildExistingCard({
      lane: 'calibration',
      schedulingAlgorithm: 'hlr',
      stability: null,
      difficultyParameter: null,
      halfLife: 5.0,
    });
    const calibrationUpsert = vi.fn().mockResolvedValue(undefined);
    const { consumer } = createConsumer({
      findByCard: vi.fn().mockResolvedValue(existing),
      calibrationUpsert,
    });

    await dispatch(consumer, { ...MIN_VALID_PAYLOAD, lane: 'calibration', deltaDays: 5 });

    expect(calibrationUpsert).toHaveBeenCalledTimes(1);
  });
});

describe('ReviewRecordedConsumer — idempotency', () => {
  it('skips processing when a review with the same attemptId already exists', async () => {
    const existingReview = { id: 'rev_existing', attemptId: ATTEMPT_ID };
    const { consumer, schedulerCardRepository } = createConsumer({
      findByAttemptId: vi.fn().mockResolvedValue(existingReview),
    });

    await dispatch(consumer, MIN_VALID_PAYLOAD);

    expect(schedulerCardRepository.create).not.toHaveBeenCalled();
    expect(schedulerCardRepository.update).not.toHaveBeenCalled();
  });

  it('skips when reliability inbox returns duplicate_processed', async () => {
    const { consumer, schedulerCardRepository, reviewRepository, calibrationDataRepository } =
      createConsumer();

    // Override reliability to simulate inbox dedup
    const reliabilityRepository: ISchedulerEventReliabilityRepository = {
      claimInbox: vi.fn().mockResolvedValue({ status: 'duplicate_processed' }),
      markInboxProcessed: vi.fn().mockResolvedValue(undefined),
      markInboxFailed: vi.fn().mockResolvedValue(undefined),
      readLatestSessionRevision: vi.fn().mockResolvedValue(null),
      applyHandshakeTransition: vi.fn().mockResolvedValue(undefined),
    };
    const consumerWithDupedInbox = new ReviewRecordedConsumer(
      createRedis(),
      pino({ enabled: false }),
      'test-dedup'
    );
    consumerWithDupedInbox.setDependencies({
      schedulerCardRepository,
      reviewRepository,
      calibrationDataRepository,
      reliabilityRepository,
      eventPublisher: { publish: vi.fn(), publishBatch: vi.fn() } as IEventPublisher,
    });

    await dispatch(consumerWithDupedInbox, MIN_VALID_PAYLOAD);

    expect(reviewRepository.create).not.toHaveBeenCalled();
    expect(schedulerCardRepository.create).not.toHaveBeenCalled();
  });
});

describe('ReviewRecordedConsumer — invalid payloads', () => {
  it('skips events with invalid / unknown rating', async () => {
    const { consumer, reviewRepository } = createConsumer();

    await dispatch(consumer, { ...MIN_VALID_PAYLOAD, rating: 'legendary' });

    expect(reviewRepository.create).not.toHaveBeenCalled();
  });

  it('skips events with invalid lane', async () => {
    const { consumer, reviewRepository } = createConsumer();

    await dispatch(consumer, { ...MIN_VALID_PAYLOAD, lane: 'superfast' });

    expect(reviewRepository.create).not.toHaveBeenCalled();
  });

  it('ignores unrelated eventType without touching repositories', async () => {
    const { consumer, reviewRepository, schedulerCardRepository } = createConsumer();

    await dispatch(consumer, MIN_VALID_PAYLOAD, 'session.started');

    expect(reviewRepository.create).not.toHaveBeenCalled();
    expect(schedulerCardRepository.create).not.toHaveBeenCalled();
  });
});
