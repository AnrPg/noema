/**
 * @noema/scheduler-service - User Deleted Event Consumer (T2.3)
 *
 * Handles 'user.deleted' events from the user-service stream.
 * - Soft delete (payload.soft === true): Suspends all SchedulerCards for the user
 * - Hard delete (payload.soft === false): Permanently deletes all SchedulerCards,
 *   Reviews, and CalibrationData for the user (GDPR erasure)
 *
 * @see SchedulerBaseConsumer   — reliability, observability, inbox dedup
 * @see ADR-003                 — Event consumer architecture unification
 */

import type { IEventConsumerConfig, IStreamEventEnvelope } from '@noema/events/consumer';
import type { UserId } from '@noema/types';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { z } from 'zod';

import { SchedulerBaseConsumer } from './scheduler-base-consumer.js';

// ============================================================================
// Default config
// ============================================================================

function buildConfig(overrides: {
  sourceStreamKey: string;
  consumerName: string;
}): IEventConsumerConfig {
  return {
    sourceStreamKey: overrides.sourceStreamKey,
    consumerGroup: 'scheduler-service:user-deleted',
    consumerName: overrides.consumerName,
    batchSize: 10,
    blockMs: 5000,
    retryBaseDelayMs: 500,
    maxProcessAttempts: 5,
    pendingIdleMs: 60_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 15_000,
    deadLetterStreamKey: 'noema:dlq:scheduler-service:user-deleted',
  };
}

// ============================================================================
// Payload schema
// ============================================================================

const UserDeletedPayloadSchema = z
  .object({
    soft: z.boolean().default(true),
  })
  .passthrough();

// ============================================================================
// Consumer
// ============================================================================

export class UserDeletedConsumer extends SchedulerBaseConsumer {
  constructor(redis: Redis, logger: Logger, consumerName: string, sourceStreamKey?: string) {
    super(
      redis,
      buildConfig({
        sourceStreamKey: sourceStreamKey ?? 'noema:events:user-service',
        consumerName,
      }),
      logger
    );
  }

  protected async dispatchEvent(envelope: IStreamEventEnvelope): Promise<void> {
    if (envelope.eventType !== 'user.deleted') {
      return;
    }

    await this.handleUserDeleted(envelope);
  }

  private async handleUserDeleted(envelope: IStreamEventEnvelope): Promise<void> {
    const parsed = UserDeletedPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      this.logger.warn({ eventType: envelope.eventType }, 'Skipping invalid user.deleted payload');
      return;
    }

    const userId = (envelope.aggregateId ?? envelope.metadata?.['userId']) as UserId | undefined;
    if (userId === undefined || userId === '') {
      this.logger.warn({ eventType: envelope.eventType }, 'user.deleted missing userId; skipping');
      return;
    }

    if (parsed.data.soft) {
      await this.handleSoftDelete(userId);
    } else {
      await this.handleHardDelete(userId);
    }
  }

  // --------------------------------------------------------------------------
  // Soft delete — suspend all scheduler cards
  // --------------------------------------------------------------------------

  private async handleSoftDelete(userId: UserId): Promise<void> {
    const cards = await this.dependencies.schedulerCardRepository.findByUser(userId);
    if (cards.length === 0) {
      this.logger.debug({ userId }, 'No SchedulerCards found for soft-deleted user');
      return;
    }

    let suspendedCount = 0;
    for (const card of cards) {
      try {
        await this.dependencies.schedulerCardRepository.update(
          userId,
          card.cardId,
          {
            suspendedUntil: new Date('9999-12-31T23:59:59.999Z').toISOString(),
            suspendedReason: 'user_soft_deleted',
            state: 'suspended',
          },
          card.version
        );
        suspendedCount++;
      } catch (error: unknown) {
        this.logger.warn(
          { userId, cardId: card.cardId, error },
          'Failed to suspend SchedulerCard during user soft-delete'
        );
      }
    }

    this.logger.info(
      { userId, totalCards: cards.length, suspendedCount },
      'Soft-deleted user: suspended all SchedulerCards'
    );
  }

  // --------------------------------------------------------------------------
  // Hard delete — GDPR erasure of all scheduler data
  // --------------------------------------------------------------------------

  private async handleHardDelete(userId: UserId): Promise<void> {
    // Bulk delete all scheduler data for the user
    const deletedCardCount = await this.dependencies.schedulerCardRepository.deleteByUser(userId);
    const deletedReviewCount = await this.dependencies.reviewRepository.deleteByUser(userId);
    const deletedCalibrationCount =
      await this.dependencies.calibrationDataRepository.deleteByUser(userId);

    this.logger.info(
      {
        userId,
        deletedCardCount,
        deletedReviewCount,
        deletedCalibrationCount,
      },
      'Hard-deleted user: purged all scheduler data (GDPR erasure)'
    );
  }
}
