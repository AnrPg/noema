/**
 * @noema/session-service - User Deleted Event Consumer (T2.3)
 *
 * Listens for 'user.deleted' events from the user-service stream.
 *
 * - Soft delete (payload.soft === true):
 *   → Abandons any active/paused sessions for the user.
 *
 * - Hard delete (payload.soft === false):
 *   → Abandons active/paused sessions.
 *   → Permanently deletes all sessions, attempts, queue items,
 *     cohort handshakes, and outbox entries for GDPR erasure.
 *
 * Uses BaseEventConsumer directly (no session-specific subclass needed)
 * since session-service does not require inbox dedup or scheduler
 * observability wrappers.
 *
 * @see BaseEventConsumer  — shared XREADGROUP lifecycle
 * @see ADR-003            — Event consumer architecture unification
 */

import type { IEventConsumerConfig, IStreamEventEnvelope } from '@noema/events/consumer';
import { BaseEventConsumer } from '@noema/events/consumer';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { PrismaClient } from '../../../generated/prisma/index.js';

// ============================================================================
// Default config
// ============================================================================

function buildConfig(overrides: {
  sourceStreamKey: string;
  consumerName: string;
}): IEventConsumerConfig {
  return {
    sourceStreamKey: overrides.sourceStreamKey,
    consumerGroup: 'session-service:user-deleted',
    consumerName: overrides.consumerName,
    batchSize: 10,
    blockMs: 5000,
    retryBaseDelayMs: 500,
    maxProcessAttempts: 5,
    pendingIdleMs: 60_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 10_000,
    deadLetterStreamKey: 'noema:dlq:session-service:user-deleted',
  };
}

// ============================================================================
// Consumer
// ============================================================================

export class UserDeletedConsumer extends BaseEventConsumer {
  private readonly prisma: PrismaClient;

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    logger: Logger,
    consumerName: string,
    sourceStreamKey = 'noema:events:user-service'
  ) {
    super(redis, buildConfig({ sourceStreamKey, consumerName }), logger);
    this.prisma = prisma;
  }

  protected async handleEvent(envelope: IStreamEventEnvelope): Promise<boolean> {
    if (envelope.eventType !== 'user.deleted') {
      return true; // Not our event — acknowledge
    }

    const userId = envelope.aggregateId;
    if (userId === '') {
      this.logger.warn({ envelope }, 'user.deleted event missing aggregateId');
      return true;
    }

    const isSoft = (envelope.payload as { soft?: boolean }).soft !== false;

    this.logger.info({ userId, soft: isSoft }, 'Processing user.deleted — cleaning session data');

    // Both soft and hard: abandon active sessions
    await this.abandonActiveSessions(userId);

    // Hard delete only: purge all historical data (GDPR)
    if (!isSoft) {
      await this.hardDeleteUserData(userId);
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // Abandon active/paused sessions
  // --------------------------------------------------------------------------

  private async abandonActiveSessions(userId: string): Promise<void> {
    const now = new Date();

    const result = await this.prisma.session.updateMany({
      where: {
        userId,
        state: { in: ['ACTIVE', 'PAUSED'] },
      },
      data: {
        state: 'ABANDONED',
        completedAt: now,
        lastActivityAt: now,
        terminationReason: 'USER_DELETED',
      },
    });

    if (result.count > 0) {
      this.logger.info(
        { userId, sessionsAbandoned: result.count },
        'Active/paused sessions abandoned due to user deletion'
      );
    }
  }

  // --------------------------------------------------------------------------
  // Hard delete — permanent removal (GDPR)
  // --------------------------------------------------------------------------

  private async hardDeleteUserData(userId: string): Promise<void> {
    // Order matters: delete children before parents (FK constraints).
    // Queue items and attempts reference sessions.
    // Outbox entries and cohort handshakes also reference sessions.

    // Step 1: Get all session IDs for the user
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      select: { id: true },
    });

    const sessionIds = sessions.map((s) => s.id);

    if (sessionIds.length === 0) {
      this.logger.debug({ userId }, 'No sessions found for hard delete');
      return;
    }

    // Step 2: Delete child records referencing sessions
    const [queueResult, attemptResult, handshakeResult, outboxResult] = await Promise.all([
      this.prisma.sessionQueueItem.deleteMany({
        where: { sessionId: { in: sessionIds } },
      }),
      this.prisma.attempt.deleteMany({
        where: { userId },
      }),
      // SessionCohortHandshake may not yet be in generated client —
      // use runtime-safe access (model added in latest schema migration).
      'sessionCohortHandshake' in this.prisma
        ? (
            this.prisma as unknown as Record<
              string,
              { deleteMany: (args: unknown) => Promise<{ count: number }> }
            >
          )['sessionCohortHandshake']!.deleteMany({ where: { sessionId: { in: sessionIds } } })
        : Promise.resolve({ count: 0 }),
      this.prisma.eventOutbox.deleteMany({
        where: { aggregateId: { in: sessionIds } },
      }),
    ]);

    // Step 3: Delete sessions themselves
    const sessionResult = await this.prisma.session.deleteMany({
      where: { userId },
    });

    // Step 4: Delete streak cache (Phase 5)
    const streakResult = await this.prisma.userStreak.deleteMany({ where: { userId } });
    const streakDeleted = streakResult.count;

    this.logger.info(
      {
        userId,
        sessionsDeleted: sessionResult.count,
        attemptsDeleted: attemptResult.count,
        queueItemsDeleted: queueResult.count,
        handshakesDeleted: handshakeResult.count,
        outboxEventsDeleted: outboxResult.count,
        streakDeleted,
      },
      'User session data hard-deleted (GDPR)'
    );
  }
}
