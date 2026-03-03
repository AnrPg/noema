/**
 * @noema/content-service - Attempt Recorded Event Consumer
 *
 * Listens for 'attempt.recorded' events from the session-service stream.
 * Updates the card's metadata with rolling review statistics so that
 * downstream agents and the scheduling layer can make informed decisions.
 *
 * Replaces the spec's SessionCompletedConsumer because:
 * - ISessionCompletedPayload contains only aggregate session stats,
 *   NOT per-card results.
 * - IAttemptRecordedPayload carries per-card data: cardId, rating,
 *   outcome, responseTimeMs, etc.
 * - Per-attempt granularity gives more accurate card-level insights.
 */

import type { IEventConsumerConfig, IStreamEventEnvelope } from '@noema/events/consumer';
import { BaseEventConsumer } from '@noema/events/consumer';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { PrismaClient } from '../../../generated/prisma/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Review statistics stored in a card's JSONB metadata field.
 * Uses index signature to satisfy Prisma's InputJsonObject constraint.
 */
interface ICardReviewStats {
  [key: string]: string | number;
  totalReviews: number;
  correctCount: number;
  accuracy: number;
  lastReviewedAt: string;
  lastRating: string;
  lastOutcome: string;
  lastResponseTimeMs: number;
  averageResponseTimeMs: number;
}

// ============================================================================
// Default config
// ============================================================================

function buildConfig(overrides: {
  sourceStreamKey: string;
  consumerName: string;
}): IEventConsumerConfig {
  return {
    sourceStreamKey: overrides.sourceStreamKey,
    consumerGroup: 'content-service:attempt-recorded',
    consumerName: overrides.consumerName,
    batchSize: 20,
    blockMs: 5000,
    retryBaseDelayMs: 500,
    maxProcessAttempts: 5,
    pendingIdleMs: 60_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 10_000,
    deadLetterStreamKey: 'noema:dlq:content-service:attempt-recorded',
  };
}

// ============================================================================
// Consumer
// ============================================================================

export class AttemptRecordedConsumer extends BaseEventConsumer {
  private readonly prisma: PrismaClient;

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    logger: Logger,
    consumerName: string,
    sourceStreamKey = 'noema:events:session-service'
  ) {
    super(redis, buildConfig({ sourceStreamKey, consumerName }), logger);
    this.prisma = prisma;
  }

  protected async handleEvent(envelope: IStreamEventEnvelope): Promise<boolean> {
    if (envelope.eventType !== 'attempt.recorded') {
      return true; // Not our event — acknowledge it
    }

    const payload = envelope.payload as {
      cardId?: string;
      userId?: string;
      rating?: string;
      outcome?: string;
      responseTimeMs?: number;
    };

    const cardId = payload.cardId;
    if (cardId === undefined || cardId === '') {
      this.logger.warn({ envelope }, 'attempt.recorded event missing cardId');
      return true;
    }

    this.logger.debug(
      { cardId, rating: payload.rating, outcome: payload.outcome },
      'Processing attempt.recorded — updating card review stats'
    );

    // Fetch the current card
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, deletedAt: null },
      select: { id: true, metadata: true, version: true },
    });

    if (!card) {
      this.logger.debug({ cardId }, 'Card not found or deleted — skipping');
      return true;
    }

    // Compute updated review stats
    const existingMetadata = (card.metadata ?? {}) as Record<string, unknown>;
    const existingStats = (existingMetadata['reviewStats'] ?? {}) as Partial<ICardReviewStats>;

    const totalReviews = (existingStats.totalReviews ?? 0) + 1;
    const isCorrect = payload.outcome === 'correct' || payload.outcome === 'pass';
    const correctCount = (existingStats.correctCount ?? 0) + (isCorrect ? 1 : 0);
    const responseTimeMs = payload.responseTimeMs ?? 0;

    const previousAvgResponseTime = existingStats.averageResponseTimeMs ?? 0;
    const previousTotal = existingStats.totalReviews ?? 0;
    const averageResponseTimeMs =
      previousTotal > 0
        ? Math.round((previousAvgResponseTime * previousTotal + responseTimeMs) / totalReviews)
        : responseTimeMs;

    const updatedStats: ICardReviewStats = {
      totalReviews,
      correctCount,
      accuracy: totalReviews > 0 ? Math.round((correctCount / totalReviews) * 1000) / 1000 : 0,
      lastReviewedAt: envelope.timestamp ?? new Date().toISOString(),
      lastRating: payload.rating ?? 'unknown',
      lastOutcome: payload.outcome ?? 'unknown',
      lastResponseTimeMs: responseTimeMs,
      averageResponseTimeMs,
    };

    // Merge updated stats into metadata
    const updatedMetadata = {
      ...existingMetadata,
      reviewStats: updatedStats,
    };

    await this.prisma.card.update({
      where: { id: card.id },
      data: {
        metadata: updatedMetadata,
        version: { increment: 1 },
      },
    });

    this.logger.debug(
      { cardId, totalReviews, accuracy: updatedStats.accuracy },
      'Card review stats updated'
    );
    return true;
  }
}
