import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import type { IOutboxRepository } from '../../../src/domain/session-service/outbox.repository.js';
import type { ISessionRepository } from '../../../src/domain/session-service/session.repository.js';
import { SessionService } from '../../../src/domain/session-service/session.service.js';
import type { IEventPublisher } from '../../../src/domain/shared/event-publisher.js';
import type { ISession } from '../../../src/types/session.types.js';

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

describe('SessionService blueprint fidelity', () => {
  it('rejects startSession when blueprint card order does not match initialCardIds', async () => {
    const deckQueryId = makeId('deck_');
    const cardA = makeId('card_');
    const cardB = `${'card_'}${'b'.repeat(21)}`;

    const prisma = {
      $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation({})),
    } as unknown as PrismaClient;

    const repository = {
      countActiveSessionsForUpdate: vi.fn(async () => 0),
      createSession: vi.fn(),
      createQueueItemsBatch: vi.fn(),
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
      }
    );

    await expect(
      service.startSession(
        {
          deckQueryId,
          learningMode: 'goal_driven',
          config: { sessionTimeoutHours: 24 },
          initialCardIds: [cardA, cardB],
          blueprint: {
            blueprintVersion: 'v1',
            generatedAt: new Date().toISOString(),
            generatedBy: 'agent',
            deckQueryId,
            initialCardIds: [cardB, cardA],
            laneMix: { retention: 0.7, calibration: 0.3 },
            checkpointSignals: ['manual'],
            policySnapshot: {
              pacingPolicy: {
                targetSecondsPerCard: 30,
                hardCapSecondsPerCard: 90,
                slowdownOnError: true,
              },
              hintPolicy: {
                maxHintsPerCard: 2,
                progressiveHintsOnly: true,
                allowAnswerReveal: false,
              },
              commitPolicy: {
                requireConfidenceBeforeCommit: true,
                requireVerificationGate: false,
              },
              reflectionPolicy: {
                postAttemptReflection: true,
                postSessionReflection: true,
              },
            },
            assumptions: [],
          },
        },
        {
          userId: makeId('user_') as never,
          correlationId: makeId('cor_') as never,
        }
      )
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    expect(
      (repository.createSession as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts startSession when blueprint card order exactly matches initialCardIds', async () => {
    const deckQueryId = makeId('deck_');
    const cardA = makeId('card_');
    const cardB = `${'card_'}${'b'.repeat(21)}`;

    const txClient = { __tx: 'blueprint-order' };
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
      }
    );

    const result = await service.startSession(
      {
        deckQueryId,
        learningMode: 'goal_driven',
        config: { sessionTimeoutHours: 24 },
        initialCardIds: [cardA, cardB],
        blueprint: {
          blueprintVersion: 'v1',
          generatedAt: new Date().toISOString(),
          generatedBy: 'agent',
          deckQueryId,
          initialCardIds: [cardA, cardB],
          laneMix: { retention: 0.7, calibration: 0.3 },
          checkpointSignals: ['manual'],
          policySnapshot: {
            pacingPolicy: {
              targetSecondsPerCard: 30,
              hardCapSecondsPerCard: 90,
              slowdownOnError: true,
            },
            hintPolicy: {
              maxHintsPerCard: 2,
              progressiveHintsOnly: true,
              allowAnswerReveal: false,
            },
            commitPolicy: {
              requireConfidenceBeforeCommit: true,
              requireVerificationGate: false,
            },
            reflectionPolicy: {
              postAttemptReflection: true,
              postSessionReflection: true,
            },
          },
          assumptions: [],
        },
      },
      {
        userId: makeId('user_') as never,
        correlationId: makeId('cor_') as never,
      }
    );

    expect(result.data.state).toBe('active');
    expect(
      (repository.countActiveSessionsForUpdate as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    ).toEqual([expect.any(String), txClient]);
    expect(
      (repository.createSession as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(1);
  });
});
