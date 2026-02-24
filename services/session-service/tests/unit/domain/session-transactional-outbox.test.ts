import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import type {
  IOutboxEventInput,
  IOutboxRepository,
} from '../../../src/domain/session-service/outbox.repository.js';
import type { ISessionRepository } from '../../../src/domain/session-service/session.repository.js';
import { SessionService } from '../../../src/domain/session-service/session.service.js';
import type { IEventPublisher } from '../../../src/domain/shared/event-publisher.js';
import type { ISession } from '../../../src/types/session.types.js';
import { createEmptyStats } from '../../../src/types/session.types.js';

function makeId(prefix: string): string {
  return `${prefix}${'a'.repeat(21)}`;
}

function createLoggerMock() {
  const logger = {
    child: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

function createSessionFixture(): ISession {
  const now = new Date().toISOString();
  return {
    id: makeId('session_') as ISession['id'],
    userId: makeId('user_') as ISession['userId'],
    deckQueryId: makeId('deck_') as ISession['deckQueryId'],
    state: 'active',
    learningMode: 'goal_driven',
    teachingApproach: 'standard',
    schedulingAlgorithm: 'fsrs',
    loadoutId: null,
    loadoutArchetype: null,
    forceLevel: null,
    config: { sessionTimeoutHours: 24 },
    stats: createEmptyStats(),
    initialQueueSize: 1,
    pauseCount: 0,
    totalPausedDurationMs: 0,
    lastPausedAt: null,
    startedAt: now,
    lastActivityAt: now,
    completedAt: null,
    terminationReason: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

describe('SessionService transactional outbox guarantees', () => {
  it('uses a shared transaction client for startSession writes and outbox enqueue', async () => {
    const txClient = { __tx: 'session-start' };
    const prisma = {
      $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(txClient)
      ),
    } as unknown as PrismaClient;

    const repository = {
      countSessionsByUser: vi.fn(async () => 0),
      createSession: vi.fn(async (sessionInput: Omit<ISession, 'createdAt' | 'updatedAt'>) => ({
        ...sessionInput,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      createQueueItemsBatch: vi.fn(async () => undefined),
    } as unknown as ISessionRepository;

    const outboxRepository = {
      enqueue: vi.fn(async () => ({
        id: makeId('event_'),
        eventType: 'session.started',
        aggregateType: 'Session',
        aggregateId: makeId('session_'),
        payload: {},
        metadata: { correlationId: makeId('correlation_') },
        publishedAt: null,
        attempts: 0,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      markPublished: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      enqueueBatch: vi.fn(async () => undefined),
      listPending: vi.fn(async () => []),
    } as unknown as IOutboxRepository;

    const eventPublisher = {
      publish: vi.fn(async () => undefined),
      publishBatch: vi.fn(async () => undefined),
    } as unknown as IEventPublisher;

    const logger = createLoggerMock();

    const service = new SessionService(
      repository,
      eventPublisher,
      outboxRepository,
      prisma,
      logger as never,
      {
        security: {
          verifyOfflineIntentTokens: false,
          offlineIntentTokenActiveKeyId: 'default',
          offlineIntentTokenKeys: {},
          offlineIntentTokenIssuer: 'noema.session',
          offlineIntentTokenAudience: 'noema.mobile',
        },
      }
    );

    await service.startSession(
      {
        deckQueryId: makeId('deck_'),
        learningMode: 'goal_driven',
        config: { sessionTimeoutHours: 24 },
        initialCardIds: [makeId('card_')],
      },
      {
        userId: makeId('user_') as never,
        correlationId: makeId('correlation_') as never,
      }
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect((repository.createSession as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(
      txClient
    );
    expect(
      (repository.createQueueItemsBatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]
    ).toBe(txClient);
    expect((outboxRepository.enqueue as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(
      txClient
    );
    expect(eventPublisher.publish as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('immediately publishes and marks outbox event as published when no transaction client is provided', async () => {
    const prisma = {
      $transaction: vi.fn(),
    } as unknown as PrismaClient;

    const repository = {} as ISessionRepository;

    const outboxRepository = {
      enqueue: vi.fn(async () => ({
        id: makeId('event_'),
        eventType: 'session.pinged',
        aggregateType: 'Session',
        aggregateId: makeId('session_'),
        payload: {},
        metadata: { correlationId: makeId('correlation_') },
        publishedAt: null,
        attempts: 0,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      markPublished: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      enqueueBatch: vi.fn(async () => undefined),
      listPending: vi.fn(async () => []),
    } as unknown as IOutboxRepository;

    const eventPublisher = {
      publish: vi.fn(async () => undefined),
      publishBatch: vi.fn(async () => undefined),
    } as unknown as IEventPublisher;

    const logger = createLoggerMock();

    const service = new SessionService(
      repository,
      eventPublisher,
      outboxRepository,
      prisma,
      logger as never,
      {
        security: {
          verifyOfflineIntentTokens: false,
          offlineIntentTokenActiveKeyId: 'default',
          offlineIntentTokenKeys: {},
          offlineIntentTokenIssuer: 'noema.session',
          offlineIntentTokenAudience: 'noema.mobile',
        },
      }
    );

    const event: IOutboxEventInput = {
      id: makeId('event_') as IOutboxEventInput['id'],
      eventType: 'session.pinged',
      aggregateType: 'Session',
      aggregateId: makeId('session_'),
      payload: { ping: true },
      metadata: {
        correlationId: makeId('correlation_') as IOutboxEventInput['metadata']['correlationId'],
      },
    };

    await (
      service as unknown as { publishThroughOutbox: (event: IOutboxEventInput) => Promise<void> }
    ).publishThroughOutbox(event);

    expect(
      (outboxRepository.enqueue as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    ).toEqual(event);
    expect(
      (eventPublisher.publish as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    ).toEqual({
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
      metadata: event.metadata,
    });
    expect(
      (outboxRepository.markPublished as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    ).toBe(event.id);
    expect(
      outboxRepository.markFailed as unknown as ReturnType<typeof vi.fn>
    ).not.toHaveBeenCalled();

    const enqueueOrder = (outboxRepository.enqueue as unknown as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const publishOrder = (eventPublisher.publish as unknown as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const markPublishedOrder = (
      outboxRepository.markPublished as unknown as ReturnType<typeof vi.fn>
    ).mock.invocationCallOrder[0];

    expect(enqueueOrder).toBeLessThan(publishOrder);
    expect(publishOrder).toBeLessThan(markPublishedOrder);
  });

  it('marks outbox event as failed and rethrows when immediate publish fails', async () => {
    const prisma = {
      $transaction: vi.fn(),
    } as unknown as PrismaClient;

    const repository = {} as ISessionRepository;

    const outboxRepository = {
      enqueue: vi.fn(async () => ({
        id: makeId('event_'),
        eventType: 'session.pinged',
        aggregateType: 'Session',
        aggregateId: makeId('session_'),
        payload: {},
        metadata: { correlationId: makeId('correlation_') },
        publishedAt: null,
        attempts: 0,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      markPublished: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      enqueueBatch: vi.fn(async () => undefined),
      listPending: vi.fn(async () => []),
    } as unknown as IOutboxRepository;

    const eventPublisher = {
      publish: vi.fn(async () => {
        throw new Error('broker unavailable');
      }),
      publishBatch: vi.fn(async () => undefined),
    } as unknown as IEventPublisher;

    const logger = createLoggerMock();

    const service = new SessionService(
      repository,
      eventPublisher,
      outboxRepository,
      prisma,
      logger as never,
      {
        security: {
          verifyOfflineIntentTokens: false,
          offlineIntentTokenActiveKeyId: 'default',
          offlineIntentTokenKeys: {},
          offlineIntentTokenIssuer: 'noema.session',
          offlineIntentTokenAudience: 'noema.mobile',
        },
      }
    );

    const event: IOutboxEventInput = {
      id: makeId('event_') as IOutboxEventInput['id'],
      eventType: 'session.pinged',
      aggregateType: 'Session',
      aggregateId: makeId('session_'),
      payload: { ping: true },
      metadata: {
        correlationId: makeId('correlation_') as IOutboxEventInput['metadata']['correlationId'],
      },
    };

    await expect(
      (
        service as unknown as {
          publishThroughOutbox: (event: IOutboxEventInput) => Promise<void>;
        }
      ).publishThroughOutbox(event)
    ).rejects.toThrow('Failed to publish outbox event');

    expect(
      (outboxRepository.markFailed as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    ).toEqual([event.id, 'broker unavailable', undefined]);
    expect(
      outboxRepository.markPublished as unknown as ReturnType<typeof vi.fn>
    ).not.toHaveBeenCalled();

    const enqueueOrder = (outboxRepository.enqueue as unknown as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const publishOrder = (eventPublisher.publish as unknown as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const markFailedOrder = (outboxRepository.markFailed as unknown as ReturnType<typeof vi.fn>)
      .mock.invocationCallOrder[0];

    expect(enqueueOrder).toBeLessThan(publishOrder);
    expect(publishOrder).toBeLessThan(markFailedOrder);
  });

  it('uses a shared transaction client for recordAttempt aggregate writes and outbox enqueue', async () => {
    const txClient = { __tx: 'attempt-write' };
    const prisma = {
      $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(txClient)
      ),
    } as unknown as PrismaClient;

    const activeSession = createSessionFixture();
    const now = new Date().toISOString();

    const repository = {
      findSessionById: vi.fn(async () => activeSession),
      getNextSequenceNumber: vi.fn(async () => 1),
      createAttempt: vi.fn(async (attemptInput: Record<string, unknown>) => ({
        ...attemptInput,
        createdAt: now,
      })),
      findAttemptsByCard: vi.fn(async () => [{ id: makeId('attempt_') }]),
      updateSession: vi.fn(async () => ({ ...activeSession, version: 2 })),
      markQueueItemAnswered: vi.fn(async () => undefined),
    } as unknown as ISessionRepository;

    const outboxRepository = {
      enqueue: vi.fn(async () => ({
        id: makeId('event_'),
        eventType: 'attempt.recorded',
        aggregateType: 'Attempt',
        aggregateId: makeId('attempt_'),
        payload: {},
        metadata: { correlationId: makeId('correlation_') },
        publishedAt: null,
        attempts: 0,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      })),
      markPublished: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      enqueueBatch: vi.fn(async () => undefined),
      listPending: vi.fn(async () => []),
    } as unknown as IOutboxRepository;

    const eventPublisher = {
      publish: vi.fn(async () => undefined),
      publishBatch: vi.fn(async () => undefined),
    } as unknown as IEventPublisher;

    const logger = createLoggerMock();

    const service = new SessionService(
      repository,
      eventPublisher,
      outboxRepository,
      prisma,
      logger as never,
      {
        security: {
          verifyOfflineIntentTokens: false,
          offlineIntentTokenActiveKeyId: 'default',
          offlineIntentTokenKeys: {},
          offlineIntentTokenIssuer: 'noema.session',
          offlineIntentTokenAudience: 'noema.mobile',
        },
      }
    );

    await service.recordAttempt(
      activeSession.id,
      {
        cardId: makeId('card_'),
        outcome: 'correct',
        rating: 'good',
        ratingValue: 3,
        responseTimeMs: 1200,
        dwellTimeMs: 1800,
        wasRevisedBeforeCommit: false,
        hintDepthReached: 'none',
        contextSnapshot: {
          learningMode: 'goal_driven',
          teachingApproach: 'standard',
          activeInterventionIds: [],
        },
      },
      {
        userId: activeSession.userId,
        correlationId: makeId('correlation_') as never,
      }
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect((repository.createAttempt as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(
      txClient
    );
    expect((repository.updateSession as unknown as ReturnType<typeof vi.fn>).mock.calls[0][3]).toBe(
      txClient
    );
    expect(
      (repository.markQueueItemAnswered as unknown as ReturnType<typeof vi.fn>).mock.calls[0][2]
    ).toBe(txClient);
    expect((outboxRepository.enqueue as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(
      txClient
    );
    expect(eventPublisher.publish as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});
