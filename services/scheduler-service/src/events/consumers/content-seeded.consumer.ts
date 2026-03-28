/**
 * @noema/scheduler-service - Content Seeded Event Consumer
 *
 * Handles 'content.seeded' events. Creates scheduler cards for
 * newly seeded content with the appropriate lane assignment.
 *
 * @see SchedulerBaseConsumer   — reliability, observability, inbox dedup
 * @see ADR-003                 — Event consumer architecture unification
 */

import type { IEventConsumerConfig, IStreamEventEnvelope } from '@noema/events/consumer';
import type { CardId, StudyMode, UserId } from '@noema/types';
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
    consumerGroup: 'scheduler-service:content-seeded',
    consumerName: overrides.consumerName,
    batchSize: 20,
    blockMs: 5000,
    retryBaseDelayMs: 250,
    maxProcessAttempts: 5,
    pendingIdleMs: 30_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 15_000,
    deadLetterStreamKey: 'noema:dlq:scheduler-service:content-seeded',
  };
}

// ============================================================================
// Payload schema
// ============================================================================

const ContentSeededPayloadSchema = z
  .object({
    userId: z.string().min(1),
    cardIds: z.array(z.string().min(1)).optional(),
    cardId: z.string().min(1).optional(),
    lane: z.string().optional(),
    studyMode: z.enum(['language_learning', 'knowledge_gaining']).optional(),
    supportedStudyModes: z.array(z.enum(['language_learning', 'knowledge_gaining'])).optional(),
  })
  .passthrough();

// ============================================================================
// Consumer
// ============================================================================

export class ContentSeededConsumer extends SchedulerBaseConsumer {
  constructor(redis: Redis, logger: Logger, consumerName: string, sourceStreamKey?: string) {
    super(
      redis,
      buildConfig({
        sourceStreamKey: sourceStreamKey ?? 'noema:events:content-service',
        consumerName,
      }),
      logger
    );
  }

  protected async dispatchEvent(envelope: IStreamEventEnvelope): Promise<void> {
    if (envelope.eventType !== 'content.seeded') {
      return;
    }

    await this.handleContentSeeded(envelope);
  }

  private async handleContentSeeded(envelope: IStreamEventEnvelope): Promise<void> {
    const parsed = ContentSeededPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      this.logger.warn(
        { eventType: envelope.eventType },
        'Skipping invalid content.seeded payload'
      );
      return;
    }

    const lane = this.readLane(parsed.data.lane);
    if (lane === null) {
      this.logger.warn(
        { eventType: envelope.eventType },
        'Skipping content.seeded with invalid lane'
      );
      return;
    }

    const userId = parsed.data.userId as UserId;
    const studyModes = (parsed.data.supportedStudyModes ?? [
      parsed.data.studyMode ?? 'knowledge_gaining',
    ]) as StudyMode[];
    const cardIds: CardId[] = [
      ...(this.readCardIds(parsed.data.cardIds) as CardId[]),
      ...(parsed.data.cardId !== undefined ? [parsed.data.cardId as CardId] : []),
    ];

    if (cardIds.length === 0) {
      return;
    }

    await Promise.all(
      cardIds.map(async (cardId) => {
        for (const studyMode of studyModes) {
          const existing = await this.dependencies.schedulerCardRepository.findByCard(
            userId,
            cardId,
            studyMode
          );
          if (existing !== null) {
            continue;
          }

          await this.dependencies.schedulerCardRepository.create({
            id: `sc_${crypto.randomUUID()}`,
            cardId,
            userId,
            studyMode,
            lane,
            stability: null,
            difficultyParameter: null,
            halfLife: null,
            interval: 0,
            nextReviewDate: new Date().toISOString(),
            lastReviewedAt: null,
            reviewCount: 0,
            lapseCount: 0,
            consecutiveCorrect: 0,
            schedulingAlgorithm: lane === 'retention' ? 'fsrs' : 'hlr',
            cardType: null,
            difficulty: null,
            knowledgeNodeIds: [],
            state: 'new',
            suspendedUntil: null,
            suspendedReason: null,
            version: 1,
          });
        }
      })
    );
  }
}
