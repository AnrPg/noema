import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../../../generated/prisma/index.js';
import type { IOutboxRepository } from '../../../src/domain/session-service/outbox.repository.js';
import type { ISessionRepository } from '../../../src/domain/session-service/session.repository.js';
import { SessionService } from '../../../src/domain/session-service/session.service.js';
import type { IEventPublisher } from '../../../src/domain/shared/event-publisher.js';

type ReplayStatus = 'ISSUED' | 'CONSUMED' | 'EXPIRED';

type ReplayGuardRecord = {
  jti: string;
  userId: string;
  issuedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  status: ReplayStatus;
};

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

function createPrismaReplayGuardMock(seedJtis: string[] = []): PrismaClient {
  const replayGuards = new Map<string, ReplayGuardRecord>();

  for (const seedJti of seedJtis) {
    replayGuards.set(seedJti, {
      jti: seedJti,
      userId: 'user_aaaaaaaaaaaaaaaaaaaaa',
      issuedAt: new Date('2026-02-24T11:00:00.000Z'),
      expiresAt: new Date('2026-02-24T13:00:00.000Z'),
      consumedAt: null,
      status: 'ISSUED',
    });
  }

  const tx = {
    $executeRaw: vi.fn(async (query: unknown, ...values: unknown[]) => {
      const sql = String((query as { strings?: string[] })?.strings?.join(' ') ?? query);

      if (sql.includes('INSERT INTO offline_intent_token_replay_guard')) {
        const [jti, userId, issuedAt, expiresAt] = values as [string, string, Date, Date];
        if (replayGuards.has(jti)) {
          return 0;
        }

        replayGuards.set(jti, {
          jti,
          userId,
          issuedAt,
          expiresAt,
          consumedAt: null,
          status: 'ISSUED',
        });

        return 1;
      }

      if (
        sql.includes("SET\n        status = 'EXPIRED'::offline_intent_token_replay_guard_status")
      ) {
        const [now] = values as [Date];
        let updated = 0;
        for (const guard of replayGuards.values()) {
          if (guard.status !== 'EXPIRED' && guard.expiresAt.getTime() <= now.getTime()) {
            guard.status = 'EXPIRED';
            updated += 1;
          }
        }
        return updated;
      }

      if (sql.includes('SET\n          consumed_at =')) {
        const [now, jti, userId] = values as [Date, string, string];
        const guard = replayGuards.get(jti);
        if (
          guard &&
          guard.userId === userId &&
          guard.status === 'ISSUED' &&
          guard.consumedAt === null &&
          guard.expiresAt.getTime() > now.getTime()
        ) {
          guard.consumedAt = now;
          guard.status = 'CONSUMED';
          return 1;
        }
        return 0;
      }

      if (sql.includes('DELETE FROM offline_intent_token_replay_guard')) {
        const [retentionCutoff] = values as [Date];
        let deleted = 0;
        for (const [jti, guard] of replayGuards.entries()) {
          if (guard.expiresAt.getTime() < retentionCutoff.getTime()) {
            replayGuards.delete(jti);
            deleted += 1;
          }
        }
        return deleted;
      }

      return 0;
    }),
    $queryRaw: vi.fn(async (_query: unknown, ...values: unknown[]) => {
      const [jti, userId] = values as [string, string];
      const guard = replayGuards.get(jti);
      if (!guard || guard.userId !== userId) {
        return [];
      }
      return [
        {
          expiresAt: guard.expiresAt,
          consumedAt: guard.consumedAt,
          status: guard.status,
        },
      ];
    }),
  };

  const prisma = {
    $transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) =>
      operation(tx)
    ),
  } as unknown as PrismaClient;

  return prisma;
}

function createService(prismaOverride?: PrismaClient): SessionService {
  const repository = {} as ISessionRepository;

  const outboxRepository = {
    enqueue: vi.fn(async () => ({
      id: 'event_aaaaaaaaaaaaaaaaaaaaa',
      eventType: 'session.intent_token.issued',
      aggregateType: 'Session',
      aggregateId: 'user_aaaaaaaaaaaaaaaaaaaaa',
      payload: {},
      metadata: { correlationId: 'cor_aaaaaaaaaaaaaaaaaaaaa' },
      publishedAt: null,
      attempts: 0,
      lastError: null,
      claimOwner: null,
      claimUntil: null,
      nextAttemptAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    enqueueBatch: vi.fn(async () => undefined),
    listPending: vi.fn(async () => []),
    claimPending: vi.fn(async () => []),
    releaseClaims: vi.fn(async () => 0),
    markPublished: vi.fn(async () => undefined),
    markPublishedClaimed: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    markFailedClaimed: vi.fn(async () => undefined),
  } as unknown as IOutboxRepository;

  const eventPublisher = {
    publish: vi.fn(async () => undefined),
    publishBatch: vi.fn(async () => undefined),
  } as unknown as IEventPublisher;

  const prisma = prismaOverride ?? createPrismaReplayGuardMock();
  const logger = createLoggerMock();

  return new SessionService(repository, eventPublisher, outboxRepository, prisma, logger as never, {
    security: {
      verifyOfflineIntentTokens: true,
      offlineIntentTokenActiveKeyId: 'v1',
      offlineIntentTokenKeys: {
        v1: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      offlineIntentTokenIssuer: 'noema.session',
      offlineIntentTokenAudience: 'noema.mobile',
    },
  });
}

describe('Offline intent token replay protection', () => {
  it('accepts first token use and rejects replay on second use', async () => {
    const service = createService();
    const ctx = {
      userId: 'user_aaaaaaaaaaaaaaaaaaaaa' as never,
      correlationId: 'cor_aaaaaaaaaaaaaaaaaaaaa' as never,
    };

    const issued = await service.issueOfflineIntentToken(
      {
        userId: ctx.userId,
        sessionBlueprint: { checkpointSignals: ['confidence_drift'] },
        expiresInSeconds: 300,
      },
      ctx
    );

    const first = await service.verifyOfflineIntentTokenPublic({ token: issued.data.token }, ctx);
    expect(first.data.valid).toBe(true);

    const second = await service.verifyOfflineIntentTokenPublic({ token: issued.data.token }, ctx);
    expect(second.data.valid).toBe(false);
    expect(second.data.reason).toBe('Offline intent token replay detected');
  });

  it('returns invalid for expired token', async () => {
    vi.useFakeTimers();
    const baseTime = new Date('2026-02-24T12:00:00.000Z');
    vi.setSystemTime(baseTime);

    try {
      const service = createService();
      const ctx = {
        userId: 'user_aaaaaaaaaaaaaaaaaaaaa' as never,
        correlationId: 'cor_aaaaaaaaaaaaaaaaaaaaa' as never,
      };

      const issued = await service.issueOfflineIntentToken(
        {
          userId: ctx.userId,
          sessionBlueprint: { checkpointSignals: [] },
          expiresInSeconds: 60,
        },
        ctx
      );

      vi.setSystemTime(new Date(baseTime.getTime() + 61_000));

      const result = await service.verifyOfflineIntentTokenPublic(
        { token: issued.data.token },
        ctx
      );
      expect(result.data.valid).toBe(false);
      expect(result.data.reason?.toLowerCase()).toContain('exp');
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries JTI registration on collision and still issues a token', async () => {
    const randomUuidSpy = vi.spyOn(crypto, 'randomUUID');
    randomUuidSpy.mockReturnValueOnce('jti_collision').mockReturnValueOnce('jti_after_retry');

    try {
      const service = createService(createPrismaReplayGuardMock(['jti_collision']));
      const ctx = {
        userId: 'user_aaaaaaaaaaaaaaaaaaaaa' as never,
        correlationId: 'cor_aaaaaaaaaaaaaaaaaaaaa' as never,
      };

      const issued = await service.issueOfflineIntentToken(
        {
          userId: ctx.userId,
          sessionBlueprint: { checkpointSignals: [] },
          expiresInSeconds: 120,
        },
        ctx
      );

      expect(issued.data.token.length).toBeGreaterThan(0);

      const verified = await service.verifyOfflineIntentTokenPublic(
        { token: issued.data.token },
        ctx
      );
      expect(verified.data.valid).toBe(true);
    } finally {
      randomUuidSpy.mockRestore();
    }
  });
});
