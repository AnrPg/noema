/**
 * @noema/session-service - User Deleted Event Consumer (T2.3)
 *
 * Listens for 'user.deleted' events from the user-service stream.
 *
 * - Soft delete (payload.soft === true):
 *   → Moves active sessions to lifecycle completion for the user.
 *
 * - Hard delete (payload.soft === false):
 *   → Moves active sessions to lifecycle completion.
 *   → Permanently deletes sessions and cascaded Step-loop data for GDPR erasure.
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

    // Both soft and hard: close active sessions
    await this.completeActiveSessions(userId);

    // Hard delete only: purge all historical data (GDPR)
    if (!isSoft) {
      await this.hardDeleteUserData(userId);
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // Complete active sessions
  // --------------------------------------------------------------------------

  private async completeActiveSessions(userId: string): Promise<void> {
    const now = new Date();

    const result = await this.prisma.session.updateMany({
      where: {
        userId,
        lifecycleState: { in: ['PLANNING', 'EXECUTION', 'DIAGNOSIS', 'ADAPTATION', 'EVALUATION'] },
      },
      data: {
        lifecycleState: 'COMPLETION',
        completedAt: now,
        lastActivityAt: now,
        terminationReason: 'USER_DELETED',
      },
    });

    if (result.count > 0) {
      this.logger.info(
        { userId, sessionsAbandoned: result.count },
        'Active sessions completed due to user deletion'
      );
    }
  }

  // --------------------------------------------------------------------------
  // Hard delete — permanent removal (GDPR)
  // --------------------------------------------------------------------------

  private async hardDeleteUserData(userId: string): Promise<void> {
    // Step-loop data cascades from sessions; outbox entries are cleaned separately.

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

    const [outboxResult] = await Promise.all([
      this.prisma.eventOutbox.deleteMany({
        where: { aggregateId: { in: sessionIds } },
      }),
    ]);

    const sessionResult = await this.prisma.session.deleteMany({
      where: { userId },
    });

    this.logger.info(
      {
        userId,
        sessionsDeleted: sessionResult.count,
        outboxEventsDeleted: outboxResult.count,
      },
      'User session data hard-deleted (GDPR)'
    );
  }
}
