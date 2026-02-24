import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import { BusinessRuleError } from '../../../src/domain/session-service/errors/index.js';
import type { IOutboxRepository } from '../../../src/domain/session-service/outbox.repository.js';
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

function createSessionFixture(overrides?: Partial<ISession>): ISession {
  const now = new Date().toISOString();
  return {
    id: makeId('sess_') as ISession['id'],
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
    ...overrides,
  };
}

describe('SessionService active session concurrency policy', () => {
  it('rejects startSession when active sessions already meet maxConcurrentSessions=1', async () => {
    const userId = makeId('user_');
    const deckQueryId = makeId('deck_');
    const cardId = makeId('card_');
    const correlationId = makeId('cor_');

    const txClient = { __tx: 'policy-check' };
    const prisma = {
      $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(txClient)
      ),
    } as unknown as PrismaClient;

    const repository = {
      countActiveSessionsForUpdate: vi.fn(async () => 1),
      createSession: vi.fn(async (sessionInput: Omit<ISession, 'createdAt' | 'updatedAt'>) => ({
        ...sessionInput,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      createQueueItemsBatch: vi.fn(async () => undefined),
    } as unknown as ISessionRepository;

    const outboxRepository = {
      enqueue: vi.fn(async () => undefined),
      markPublished: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      enqueueBatch: vi.fn(async () => undefined),
      listPending: vi.fn(async () => []),
    } as unknown as IOutboxRepository;

    const eventPublisher = {
      publish: vi.fn(async () => undefined),
      publishBatch: vi.fn(async () => undefined),
    } as unknown as IEventPublisher;

    const service = new SessionService(
      repository,
      eventPublisher,
      outboxRepository,
      prisma,
      createLoggerMock() as never,
      {
        security: {
          verifyOfflineIntentTokens: false,
          offlineIntentTokenActiveKeyId: 'default',
          offlineIntentTokenKeys: {},
          offlineIntentTokenIssuer: 'noema.session',
          offlineIntentTokenAudience: 'noema.mobile',
        },
        session: {
          maxConcurrentSessions: 1,
        },
      }
    );

    await expect(
      service.startSession(
        {
          deckQueryId,
          learningMode: 'goal_driven',
          config: { sessionTimeoutHours: 24 },
          initialCardIds: [cardId],
        },
        {
          userId: userId as never,
          correlationId: correlationId as never,
        }
      )
    ).rejects.toBeInstanceOf(BusinessRuleError);

    expect(
      (repository.countActiveSessionsForUpdate as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    ).toEqual([userId, txClient]);
    expect(
      (repository.createSession as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(0);
    expect(
      (outboxRepository.enqueue as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(0);
  });

  it('allows startSession when active sessions are below maxConcurrentSessions>1', async () => {
    const userId = makeId('user_');
    const deckQueryId = makeId('deck_');
    const cardId = makeId('card_');
    const correlationId = makeId('cor_');

    const txClient = { __tx: 'policy-check-allow' };
    const prisma = {
      $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(txClient)
      ),
    } as unknown as PrismaClient;

    const repository = {
      countActiveSessionsForUpdate: vi.fn(async () => 1),
      createSession: vi.fn(async (sessionInput: Omit<ISession, 'createdAt' | 'updatedAt'>) => ({
        ...sessionInput,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      createQueueItemsBatch: vi.fn(async () => undefined),
    } as unknown as ISessionRepository;

    const outboxRepository = {
      enqueue: vi.fn(async () => undefined),
      markPublished: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      enqueueBatch: vi.fn(async () => undefined),
      listPending: vi.fn(async () => []),
    } as unknown as IOutboxRepository;

    const eventPublisher = {
      publish: vi.fn(async () => undefined),
      publishBatch: vi.fn(async () => undefined),
    } as unknown as IEventPublisher;

    const service = new SessionService(
      repository,
      eventPublisher,
      outboxRepository,
      prisma,
      createLoggerMock() as never,
      {
        security: {
          verifyOfflineIntentTokens: false,
          offlineIntentTokenActiveKeyId: 'default',
          offlineIntentTokenKeys: {},
          offlineIntentTokenIssuer: 'noema.session',
          offlineIntentTokenAudience: 'noema.mobile',
        },
        session: {
          maxConcurrentSessions: 2,
        },
      }
    );

    const result = await service.startSession(
      {
        deckQueryId,
        learningMode: 'goal_driven',
        config: { sessionTimeoutHours: 24 },
        initialCardIds: [cardId],
      },
      {
        userId: userId as never,
        correlationId: correlationId as never,
      }
    );

    expect(result.data.state).toBe('active');
    expect(
      (repository.countActiveSessionsForUpdate as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
    expect(
      (repository.createSession as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
    expect(
      (outboxRepository.enqueue as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
  });

  it('allows startSession when policy=1 and 0 active sessions (happy path)', async () => {
    const userId = makeId('user_');
    const deckQueryId = makeId('deck_');
    const cardId = makeId('card_');
    const correlationId = makeId('cor_');

    const txClient = { __tx: 'happy-path' };
    const prisma = {
      $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(txClient)
      ),
    } as unknown as PrismaClient;

    const repository = {
      countActiveSessionsForUpdate: vi.fn(async () => 0),
      createSession: vi.fn(async (sessionInput: Omit<ISession, 'createdAt' | 'updatedAt'>) => ({
        ...sessionInput,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      createQueueItemsBatch: vi.fn(async () => undefined),
    } as unknown as ISessionRepository;

    const outboxRepository = {
      enqueue: vi.fn(async () => undefined),
      markPublished: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      enqueueBatch: vi.fn(async () => undefined),
      listPending: vi.fn(async () => []),
    } as unknown as IOutboxRepository;

    const eventPublisher = {
      publish: vi.fn(async () => undefined),
      publishBatch: vi.fn(async () => undefined),
    } as unknown as IEventPublisher;

    const service = new SessionService(
      repository,
      eventPublisher,
      outboxRepository,
      prisma,
      createLoggerMock() as never,
      {
        security: {
          verifyOfflineIntentTokens: false,
          offlineIntentTokenActiveKeyId: 'default',
          offlineIntentTokenKeys: {},
          offlineIntentTokenIssuer: 'noema.session',
          offlineIntentTokenAudience: 'noema.mobile',
        },
        session: {
          maxConcurrentSessions: 1,
        },
      }
    );

    const result = await service.startSession(
      {
        deckQueryId,
        learningMode: 'goal_driven',
        config: { sessionTimeoutHours: 24 },
        initialCardIds: [cardId],
      },
      {
        userId: userId as never,
        correlationId: correlationId as never,
      }
    );

    expect(result.data.state).toBe('active');
    expect(
      (repository.countActiveSessionsForUpdate as unknown as ReturnType<typeof vi.fn>).mock
        .calls[0]
    ).toEqual([userId, txClient]);
    expect(
      (repository.createSession as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
    expect(
      (outboxRepository.enqueue as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
  });

  it('allows startSession at boundary: policy=3, 2 active sessions', async () => {
    const userId = makeId('user_');
    const deckQueryId = makeId('deck_');
    const cardId = makeId('card_');
    const correlationId = makeId('cor_');

    const txClient = { __tx: 'boundary-allow' };
    const prisma = {
      $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(txClient)
      ),
    } as unknown as PrismaClient;

    const repository = {
      countActiveSessionsForUpdate: vi.fn(async () => 2),
      createSession: vi.fn(async (sessionInput: Omit<ISession, 'createdAt' | 'updatedAt'>) => ({
        ...sessionInput,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      createQueueItemsBatch: vi.fn(async () => undefined),
    } as unknown as ISessionRepository;

    const outboxRepository = {
      enqueue: vi.fn(async () => undefined),
      markPublished: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      enqueueBatch: vi.fn(async () => undefined),
      listPending: vi.fn(async () => []),
    } as unknown as IOutboxRepository;

    const eventPublisher = {
      publish: vi.fn(async () => undefined),
      publishBatch: vi.fn(async () => undefined),
    } as unknown as IEventPublisher;

    const service = new SessionService(
      repository,
      eventPublisher,
      outboxRepository,
      prisma,
      createLoggerMock() as never,
      {
        security: {
          verifyOfflineIntentTokens: false,
          offlineIntentTokenActiveKeyId: 'default',
          offlineIntentTokenKeys: {},
          offlineIntentTokenIssuer: 'noema.session',
          offlineIntentTokenAudience: 'noema.mobile',
        },
        session: {
          maxConcurrentSessions: 3,
        },
      }
    );

    const result = await service.startSession(
      {
        deckQueryId,
        learningMode: 'goal_driven',
        config: { sessionTimeoutHours: 24 },
        initialCardIds: [cardId],
      },
      {
        userId: userId as never,
        correlationId: correlationId as never,
      }
    );

    expect(result.data.state).toBe('active');
    expect(
      (repository.createSession as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
  });

  it('rejects startSession at boundary: policy=3, 3 active sessions', async () => {
    const userId = makeId('user_');
    const deckQueryId = makeId('deck_');
    const cardId = makeId('card_');
    const correlationId = makeId('cor_');

    const txClient = { __tx: 'boundary-reject' };
    const prisma = {
      $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(txClient)
      ),
    } as unknown as PrismaClient;

    const repository = {
      countActiveSessionsForUpdate: vi.fn(async () => 3),
      createSession: vi.fn(async (sessionInput: Omit<ISession, 'createdAt' | 'updatedAt'>) => ({
        ...sessionInput,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      createQueueItemsBatch: vi.fn(async () => undefined),
    } as unknown as ISessionRepository;

    const outboxRepository = {
      enqueue: vi.fn(async () => undefined),
      markPublished: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      enqueueBatch: vi.fn(async () => undefined),
      listPending: vi.fn(async () => []),
    } as unknown as IOutboxRepository;

    const eventPublisher = {
      publish: vi.fn(async () => undefined),
      publishBatch: vi.fn(async () => undefined),
    } as unknown as IEventPublisher;

    const service = new SessionService(
      repository,
      eventPublisher,
      outboxRepository,
      prisma,
      createLoggerMock() as never,
      {
        security: {
          verifyOfflineIntentTokens: false,
          offlineIntentTokenActiveKeyId: 'default',
          offlineIntentTokenKeys: {},
          offlineIntentTokenIssuer: 'noema.session',
          offlineIntentTokenAudience: 'noema.mobile',
        },
        session: {
          maxConcurrentSessions: 3,
        },
      }
    );

    await expect(
      service.startSession(
        {
          deckQueryId,
          learningMode: 'goal_driven',
          config: { sessionTimeoutHours: 24 },
          initialCardIds: [cardId],
        },
        {
          userId: userId as never,
          correlationId: correlationId as never,
        }
      )
    ).rejects.toBeInstanceOf(BusinessRuleError);

    expect(
      (repository.createSession as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(0);
  });
});
