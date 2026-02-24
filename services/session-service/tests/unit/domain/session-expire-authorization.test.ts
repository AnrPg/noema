import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import { AuthorizationError } from '../../../src/domain/session-service/errors/index.js';
import type { IOutboxRepository } from '../../../src/domain/session-service/outbox.repository.js';
import type { ISessionRepository } from '../../../src/domain/session-service/session.repository.js';
import { SessionService } from '../../../src/domain/session-service/session.service.js';
import type { IEventPublisher } from '../../../src/domain/shared/event-publisher.js';
import type { ISession } from '../../../src/types/session.types.js';
import { createEmptyStats } from '../../../src/types/session.types.js';

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
    id: 'sess_aaaaaaaaaaaaaaaaaaaaa' as ISession['id'],
    userId: 'usr_owneraaaaaaaaaaaaaaaa' as ISession['userId'],
    deckQueryId: 'dql_aaaaaaaaaaaaaaaaaaaaa' as ISession['deckQueryId'],
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

describe('SessionService expireSession authorization', () => {
  it('rejects expiring a session owned by another user', async () => {
    const session = createSessionFixture();

    const repository = {
      findSessionById: vi.fn(async () => session),
      updateSession: vi.fn(async () => session),
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

    const prisma = {
      $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation({})),
    } as unknown as PrismaClient;

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
      }
    );

    await expect(
      service.expireSession(session.id, {
        userId: 'usr_not_owneraaaaaaaaaaaaa' as never,
        correlationId: 'cor_aaaaaaaaaaaaaaaaaaaaa' as never,
      })
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(
      (repository.findSessionById as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
    expect(
      (repository.updateSession as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(0);
    expect(
      (outboxRepository.enqueue as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(0);
  });

  it('allows the session owner to expire their own session', async () => {
    const session = createSessionFixture();
    const expiredSession = {
      ...session,
      state: 'expired' as ISession['state'],
      completedAt: new Date().toISOString(),
      terminationReason: 'auto_expired',
      version: 2,
    };

    const repository = {
      findSessionById: vi.fn(async () => session),
      updateSession: vi.fn(async () => expiredSession),
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

    const prisma = {
      $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation({})),
    } as unknown as PrismaClient;

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
      }
    );

    const result = await service.expireSession(session.id, {
      userId: session.userId as never,
      correlationId: 'cor_aaaaaaaaaaaaaaaaaaaaa' as never,
    });

    expect(result.data.state).toBe('expired');
    expect(
      (repository.updateSession as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
    expect(
      (outboxRepository.enqueue as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
  });

  it('allows system expiration without ownership via expireSessionSystem', async () => {
    const session = createSessionFixture();
    const expiredSession = {
      ...session,
      state: 'expired' as ISession['state'],
      completedAt: new Date().toISOString(),
      terminationReason: 'auto_expired',
      version: 2,
    };

    const repository = {
      findSessionById: vi.fn(async () => session),
      updateSession: vi.fn(async () => expiredSession),
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

    const prisma = {
      $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation({})),
    } as unknown as PrismaClient;

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
      }
    );

    // Call as a completely different user — system expiration skips ownership
    const result = await service.expireSessionSystem(session.id, {
      userId: 'usr_system_serviceaaaaaa' as never,
      correlationId: 'cor_aaaaaaaaaaaaaaaaaaaaa' as never,
    });

    expect(result.data.state).toBe('expired');
    expect(
      (repository.findSessionById as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
    expect(
      (repository.updateSession as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
    expect(
      (outboxRepository.enqueue as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
  });
});
