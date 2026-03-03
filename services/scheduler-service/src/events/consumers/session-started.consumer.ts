/**
 * @noema/scheduler-service - Session Started Event Consumer
 *
 * Handles 'session.started' events. Bootstraps scheduler cards
 * for the initial card IDs included in the session.
 *
 * @see SchedulerBaseConsumer   — reliability, observability, inbox dedup
 * @see ADR-003                 — Event consumer architecture unification
 */

import type { IEventConsumerConfig, IStreamEventEnvelope } from '@noema/events/consumer';
import type { CardId, UserId } from '@noema/types';
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
    consumerGroup: 'scheduler-service:session-started',
    consumerName: overrides.consumerName,
    batchSize: 20,
    blockMs: 5000,
    retryBaseDelayMs: 250,
    maxProcessAttempts: 5,
    pendingIdleMs: 30_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 15_000,
    deadLetterStreamKey: 'noema:dlq:scheduler-service:session-started',
  };
}

// ============================================================================
// Payload schema
// ============================================================================

const SessionStartedPayloadSchema = z
  .object({
    userId: z.string().min(1),
    initialQueueSize: z.number().int().nonnegative(),
    initialCardIds: z.array(z.string().min(1)).optional(),
  })
  .passthrough();

// ============================================================================
// Consumer
// ============================================================================

export class SessionStartedConsumer extends SchedulerBaseConsumer {
  constructor(redis: Redis, logger: Logger, consumerName: string, sourceStreamKey?: string) {
    super(
      redis,
      buildConfig({
        sourceStreamKey: sourceStreamKey ?? 'noema:events:session-service',
        consumerName,
      }),
      logger
    );
  }

  protected async dispatchEvent(envelope: IStreamEventEnvelope): Promise<void> {
    if (envelope.eventType !== 'session.started') {
      return;
    }

    await this.handleSessionStarted(envelope);
  }

  private async handleSessionStarted(envelope: IStreamEventEnvelope): Promise<void> {
    const parsed = SessionStartedPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      this.logger.warn(
        { eventType: envelope.eventType },
        'Skipping invalid session.started payload'
      );
      return;
    }

    const userId = parsed.data.userId as UserId;
    const cardIds = this.readCardIds(parsed.data.initialCardIds);
    if (cardIds.length === 0) {
      this.logger.debug(
        { eventType: envelope.eventType, initialQueueSize: parsed.data.initialQueueSize },
        'session.started has no initialCardIds; skipping card bootstrap'
      );
      return;
    }

    await Promise.all(
      cardIds.map(async (rawCardId) => {
        const cardId = rawCardId as CardId;
        const existing = await this.dependencies.schedulerCardRepository.findByCard(userId, cardId);
        if (existing !== null) {
          return;
        }

        await this.dependencies.schedulerCardRepository.create({
          id: `sc_${crypto.randomUUID()}`,
          cardId,
          userId,
          lane: 'retention',
          stability: null,
          difficultyParameter: null,
          halfLife: null,
          interval: 0,
          nextReviewDate: new Date().toISOString(),
          lastReviewedAt: null,
          reviewCount: 0,
          lapseCount: 0,
          consecutiveCorrect: 0,
          schedulingAlgorithm: 'fsrs',
          cardType: null,
          difficulty: null,
          knowledgeNodeIds: [],
          state: 'new',
          suspendedUntil: null,
          suspendedReason: null,
          version: 1,
        });
      })
    );
  }
}
