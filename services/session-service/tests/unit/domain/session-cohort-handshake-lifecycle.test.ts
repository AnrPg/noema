import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import {
    BusinessRuleError,
    VersionConflictError,
} from '../../../src/domain/session-service/errors/index.js';
import type { IOutboxRepository } from '../../../src/domain/session-service/outbox.repository.js';
import type { ISessionRepository } from '../../../src/domain/session-service/session.repository.js';
import { SessionService } from '../../../src/domain/session-service/session.service.js';
import type { IEventPublisher } from '../../../src/domain/shared/event-publisher.js';
import type {
    ISession,
    ISessionCohortHandshake,
    SessionCohortHandshakeStatus,
} from '../../../src/types/session.types.js';
import {
    SessionCohortHandshakeStatus as CohortStatuses,
    createEmptyStats,
} from '../../../src/types/session.types.js';

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
    initialQueueSize: 2,
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

type CohortStore = Map<string, ISessionCohortHandshake>;

function storeKey(sessionId: string, proposalId: string, revision: number): string {
  return `${sessionId}:${proposalId}:${String(revision)}`;
}

function createRepositoryMock(session: ISession, store: CohortStore) {
  const replacePendingQueueItems = vi.fn(async (_sessionId: string, _committedCardIds: string[]) => undefined);

  const repository = {
    findSessionById: vi.fn(async () => session),
    findLatestCohortHandshake: vi.fn(async (sessionId: string, proposalId: string) => {
      const rows = [...store.values()]
        .filter((row) => row.sessionId === sessionId && row.proposalId === proposalId)
        .sort((a, b) => b.revision - a.revision);
      return rows[0] ?? null;
    }),
    findCohortHandshake: vi.fn(async (sessionId: string, proposalId: string, revision: number) => {
      return store.get(storeKey(sessionId, proposalId, revision)) ?? null;
    }),
    createCohortHandshake: vi.fn(
      async (
        sessionId: string,
        input: {
          linkage: { proposalId: string; decisionId: string };
          revision?: number;
          newRevision?: number;
          candidateCardIds: string[];
          metadata?: Record<string, unknown>;
        },
        status: SessionCohortHandshakeStatus
      ) => {
        const revision = 'newRevision' in input ? input.newRevision! : input.revision!;
        const now = new Date().toISOString();
        const row: ISessionCohortHandshake = {
          id: crypto.randomUUID(),
          sessionId: sessionId as never,
          proposalId: input.linkage.proposalId,
          decisionId: input.linkage.decisionId,
          revision,
          status,
          candidateCardIds: input.candidateCardIds as never,
          acceptedCardIds: null,
          rejectedCardIds: null,
          metadata: input.metadata ?? {},
          createdAt: now,
          updatedAt: now,
        };
        store.set(storeKey(sessionId, row.proposalId, row.revision), row);
        return row;
      }
    ),
    updateCohortHandshake: vi.fn(
      async (
        sessionId: string,
        proposalId: string,
        revision: number,
        expectedStatus: SessionCohortHandshakeStatus,
        input: {
          acceptedCardIds: string[];
          rejectedCardIds: string[];
          metadata?: Record<string, unknown>;
        },
        nextStatus: SessionCohortHandshakeStatus
      ) => {
        const key = storeKey(sessionId, proposalId, revision);
        const current = store.get(key);
        if (!current || current.status !== expectedStatus) {
          throw new VersionConflictError(revision, revision + 1);
        }
        const updated: ISessionCohortHandshake = {
          ...current,
          status: nextStatus,
          acceptedCardIds: input.acceptedCardIds as never,
          rejectedCardIds: input.rejectedCardIds as never,
          metadata: input.metadata ?? {},
          updatedAt: new Date().toISOString(),
        };
        store.set(key, updated);
        return updated;
      }
    ),
    replacePendingQueueItems,
  } as unknown as ISessionRepository;

  return { repository, replacePendingQueueItems };
}

describe('SessionService cohort handshake lifecycle', () => {
  it('proposes, accepts, and commits cohort with durable events and queue materialization', async () => {
    const session = createSessionFixture();
    const store: CohortStore = new Map();
    const { repository, replacePendingQueueItems } = createRepositoryMock(session, store);

    const outboxEvents: string[] = [];
    const outboxRepository = {
      enqueue: vi.fn(async (event) => {
        outboxEvents.push(event.eventType);
        return undefined;
      }),
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

    const userId = session.userId;
    const correlationId = makeId('cor_');
    const proposalId = 'proposal-1';
    const decisionId = 'decision-1';
    const cardA = makeId('card_');
    const cardB = `card_${'b'.repeat(21)}`;

    const proposed = await service.proposeCohort(
      session.id,
      {
        linkage: { proposalId, decisionId },
        revision: 1,
        candidateCardIds: [cardA, cardB],
      },
      { userId: userId as never, correlationId: correlationId as never }
    );

    const accepted = await service.acceptCohort(
      session.id,
      {
        linkage: { proposalId, decisionId },
        expectedRevision: 1,
        acceptedCardIds: [cardA],
        rejectedCardIds: [cardB],
      },
      { userId: userId as never, correlationId: correlationId as never }
    );

    const committed = await service.commitCohort(
      session.id,
      {
        linkage: { proposalId, decisionId },
        expectedRevision: 1,
        committedCardIds: [cardA],
        rejectedCardIds: [cardB],
      },
      { userId: userId as never, correlationId: correlationId as never }
    );

    expect(proposed.data.status).toBe(CohortStatuses.PROPOSED);
    expect(accepted.data.status).toBe(CohortStatuses.ACCEPTED);
    expect(committed.data.status).toBe(CohortStatuses.COMMITTED);

    expect(outboxEvents).toEqual([
      'session.cohort.proposed',
      'session.cohort.accepted',
      'session.cohort.committed',
    ]);

    expect(replacePendingQueueItems).toHaveBeenCalledTimes(1);
    expect(replacePendingQueueItems).toHaveBeenCalledWith(session.id, [cardA], expect.anything());
  });

  it('rejects stale acceptCohort revision with version conflict', async () => {
    const session = createSessionFixture();
    const store: CohortStore = new Map();
    const { repository } = createRepositoryMock(session, store);

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

    const proposalId = 'proposal-2';
    const decisionId = 'decision-2';
    const cardA = makeId('card_');

    await service.proposeCohort(
      session.id,
      {
        linkage: { proposalId, decisionId },
        revision: 1,
        candidateCardIds: [cardA],
      },
      { userId: session.userId as never, correlationId: makeId('cor_') as never }
    );

    await expect(
      service.acceptCohort(
        session.id,
        {
          linkage: { proposalId, decisionId },
          expectedRevision: 2,
          acceptedCardIds: [cardA],
          rejectedCardIds: [],
        },
        { userId: session.userId as never, correlationId: makeId('cor_') as never }
      )
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('rejects commit when cohort was not accepted', async () => {
    const session = createSessionFixture();
    const store: CohortStore = new Map();
    const { repository } = createRepositoryMock(session, store);

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

    const proposalId = 'proposal-3';
    const decisionId = 'decision-3';
    const cardA = makeId('card_');

    await service.proposeCohort(
      session.id,
      {
        linkage: { proposalId, decisionId },
        revision: 1,
        candidateCardIds: [cardA],
      },
      { userId: session.userId as never, correlationId: makeId('cor_') as never }
    );

    await expect(
      service.commitCohort(
        session.id,
        {
          linkage: { proposalId, decisionId },
          expectedRevision: 1,
          committedCardIds: [cardA],
          rejectedCardIds: [],
        },
        { userId: session.userId as never, correlationId: makeId('cor_') as never }
      )
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('supports full revision flow: propose → accept → revise → accept → commit', async () => {
    const session = createSessionFixture();
    const store: CohortStore = new Map();
    const { repository, replacePendingQueueItems } = createRepositoryMock(session, store);

    const outboxEvents: string[] = [];
    const outboxRepository = {
      enqueue: vi.fn(async (event) => {
        outboxEvents.push(event.eventType);
        return undefined;
      }),
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

    const userId = session.userId;
    const proposalId = 'proposal-revise';
    const decisionId = 'decision-revise';
    const cardA = makeId('card_');
    const cardB = `card_${'b'.repeat(21)}`;
    const cardC = `card_${'c'.repeat(21)}`;

    // Step 1: propose
    const proposed = await service.proposeCohort(
      session.id,
      {
        linkage: { proposalId, decisionId },
        revision: 1,
        candidateCardIds: [cardA, cardB],
      },
      { userId: userId as never, correlationId: makeId('cor_') as never }
    );
    expect(proposed.data.status).toBe(CohortStatuses.PROPOSED);

    // Step 2: accept
    const accepted = await service.acceptCohort(
      session.id,
      {
        linkage: { proposalId, decisionId },
        expectedRevision: 1,
        acceptedCardIds: [cardA],
        rejectedCardIds: [cardB],
      },
      { userId: userId as never, correlationId: makeId('cor_') as never }
    );
    expect(accepted.data.status).toBe(CohortStatuses.ACCEPTED);

    // Step 3: revise (creates revision 2 from accepted revision 1)
    const revised = await service.reviseCohort(
      session.id,
      {
        linkage: { proposalId, decisionId },
        expectedRevision: 1,
        newRevision: 2,
        candidateCardIds: [cardA, cardC],
        reason: 'Agent determined cardB too easy; substituted cardC',
      },
      { userId: userId as never, correlationId: makeId('cor_') as never }
    );
    expect(revised.data.status).toBe(CohortStatuses.REVISED);
    expect(revised.data.revision).toBe(2);

    // Step 4: accept revision 2
    const acceptedR2 = await service.acceptCohort(
      session.id,
      {
        linkage: { proposalId, decisionId },
        expectedRevision: 2,
        acceptedCardIds: [cardA, cardC],
        rejectedCardIds: [],
      },
      { userId: userId as never, correlationId: makeId('cor_') as never }
    );
    expect(acceptedR2.data.status).toBe(CohortStatuses.ACCEPTED);

    // Step 5: commit revision 2
    const committed = await service.commitCohort(
      session.id,
      {
        linkage: { proposalId, decisionId },
        expectedRevision: 2,
        committedCardIds: [cardA, cardC],
        rejectedCardIds: [],
      },
      { userId: userId as never, correlationId: makeId('cor_') as never }
    );
    expect(committed.data.status).toBe(CohortStatuses.COMMITTED);

    expect(outboxEvents).toEqual([
      'session.cohort.proposed',
      'session.cohort.accepted',
      'session.cohort.revised',
      'session.cohort.accepted',
      'session.cohort.committed',
    ]);

    expect(replacePendingQueueItems).toHaveBeenCalledTimes(1);
    expect(replacePendingQueueItems).toHaveBeenCalledWith(session.id, [cardA, cardC], expect.anything());
  });

  it('rejects revise from PROPOSED status (must be accepted first)', async () => {
    const session = createSessionFixture();
    const store: CohortStore = new Map();
    const { repository } = createRepositoryMock(session, store);

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

    const proposalId = 'proposal-bad-revise';
    const decisionId = 'decision-bad-revise';
    const cardA = makeId('card_');

    await service.proposeCohort(
      session.id,
      {
        linkage: { proposalId, decisionId },
        revision: 1,
        candidateCardIds: [cardA],
      },
      { userId: session.userId as never, correlationId: makeId('cor_') as never }
    );

    // Attempt revise directly from proposed — should fail
    await expect(
      service.reviseCohort(
        session.id,
        {
          linkage: { proposalId, decisionId },
          expectedRevision: 1,
          newRevision: 2,
          candidateCardIds: [cardA],
          reason: 'Should not work',
        },
        { userId: session.userId as never, correlationId: makeId('cor_') as never }
      )
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('rejects revise from COMMITTED status (committed is terminal)', async () => {
    const session = createSessionFixture();
    const store: CohortStore = new Map();
    const { repository } = createRepositoryMock(session, store);

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

    const proposalId = 'proposal-committed-revise';
    const decisionId = 'decision-committed-revise';
    const cardA = makeId('card_');

    // propose → accept → commit
    await service.proposeCohort(
      session.id,
      {
        linkage: { proposalId, decisionId },
        revision: 1,
        candidateCardIds: [cardA],
      },
      { userId: session.userId as never, correlationId: makeId('cor_') as never }
    );

    await service.acceptCohort(
      session.id,
      {
        linkage: { proposalId, decisionId },
        expectedRevision: 1,
        acceptedCardIds: [cardA],
        rejectedCardIds: [],
      },
      { userId: session.userId as never, correlationId: makeId('cor_') as never }
    );

    await service.commitCohort(
      session.id,
      {
        linkage: { proposalId, decisionId },
        expectedRevision: 1,
        committedCardIds: [cardA],
        rejectedCardIds: [],
      },
      { userId: session.userId as never, correlationId: makeId('cor_') as never }
    );

    // Attempt revise from committed — should fail
    await expect(
      service.reviseCohort(
        session.id,
        {
          linkage: { proposalId, decisionId },
          expectedRevision: 1,
          newRevision: 2,
          candidateCardIds: [cardA],
          reason: 'Should not work from committed',
        },
        { userId: session.userId as never, correlationId: makeId('cor_') as never }
      )
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});
