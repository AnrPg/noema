/**
 * @noema/content-service - User Deleted Event Consumer
 *
 * Listens for 'user.deleted' events from the user-service stream.
 * - Soft delete (payload.soft === true): soft-deletes all cards, templates,
 *   and media files owned by the user.
 * - Hard delete (payload.soft === false): hard-deletes all cards, templates,
 *   and media files owned by the user (GDPR erasure).
 */

import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import type { IEventConsumerConfig, IStreamEventEnvelope } from './base-consumer.js';
import { BaseEventConsumer } from './base-consumer.js';

// ============================================================================
// Default config
// ============================================================================

function buildConfig(overrides: {
  sourceStreamKey: string;
  consumerName: string;
}): IEventConsumerConfig {
  return {
    sourceStreamKey: overrides.sourceStreamKey,
    consumerGroup: 'content-service:user-deleted',
    consumerName: overrides.consumerName,
    batchSize: 10,
    blockMs: 5000,
    retryBaseDelayMs: 500,
    maxProcessAttempts: 5,
    pendingIdleMs: 60_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 10_000,
    deadLetterStreamKey: 'noema:dlq:content-service:user-deleted',
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
    sourceStreamKey = 'noema:events:user-service',
  ) {
    super(redis, buildConfig({ sourceStreamKey, consumerName }), logger);
    this.prisma = prisma;
  }

  protected async handleEvent(envelope: IStreamEventEnvelope): Promise<boolean> {
    if (envelope.eventType !== 'user.deleted') {
      return true; // Not our event — acknowledge it
    }

    const userId = envelope.aggregateId;
    if (userId === '') {
      this.logger.warn({ envelope }, 'user.deleted event missing aggregateId');
      return true;
    }

    const isSoft = (envelope.payload as { soft?: boolean }).soft !== false;

    this.logger.info(
      { userId, soft: isSoft },
      'Processing user.deleted — archiving user content',
    );

    if (isSoft) {
      await this.softDeleteUserContent(userId);
    } else {
      await this.hardDeleteUserContent(userId);
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // Soft delete — archive everything
  // --------------------------------------------------------------------------

  private async softDeleteUserContent(userId: string): Promise<void> {
    const now = new Date();

    const [cardResult, templateResult, mediaResult] = await Promise.all([
      this.prisma.card.updateMany({
        where: { userId, deletedAt: null },
        data: { deletedAt: now, state: 'ARCHIVED' },
      }),
      this.prisma.template.updateMany({
        where: { userId, deletedAt: null },
        data: { deletedAt: now },
      }),
      this.prisma.mediaFile.updateMany({
        where: { userId, deletedAt: null },
        data: { deletedAt: now },
      }),
    ]);

    this.logger.info(
      {
        userId,
        cardsArchived: cardResult.count,
        templatesDeleted: templateResult.count,
        mediaDeleted: mediaResult.count,
      },
      'User content soft-deleted',
    );
  }

  // --------------------------------------------------------------------------
  // Hard delete — permanent removal (GDPR)
  // --------------------------------------------------------------------------

  private async hardDeleteUserContent(userId: string): Promise<void> {
    const [cardResult, templateResult, mediaResult, historyResult] = await Promise.all([
      this.prisma.card.deleteMany({ where: { userId } }),
      this.prisma.template.deleteMany({ where: { userId } }),
      this.prisma.mediaFile.deleteMany({ where: { userId } }),
      this.prisma.cardHistory.deleteMany({ where: { userId } }),
    ]);

    this.logger.info(
      {
        userId,
        cardsDeleted: cardResult.count,
        templatesDeleted: templateResult.count,
        mediaDeleted: mediaResult.count,
        historyDeleted: historyResult.count,
      },
      'User content hard-deleted (GDPR)',
    );
  }
}
