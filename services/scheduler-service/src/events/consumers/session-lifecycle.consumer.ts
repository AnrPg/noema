/**
 * @noema/scheduler-service - Session Lifecycle Event Consumer (T2.4)
 *
 * Handles session completion and abandonment events:
 * - session.completed → Updates scheduler analytics for reviewed cards
 *   (records final session stats, updates lastReviewedAt for batch accuracy)
 * - session.abandoned → Partial commit: updates only cards that were
 *   actually reviewed before abandonment, logs unreviewed remainder
 *
 * These events carry aggregate session statistics that inform scheduler
 * analytics and calibration quality metrics. Unlike attempt.recorded
 * (which handles per-card scheduling), this consumer handles session-level
 * bookkeeping.
 *
 * @see SchedulerBaseConsumer   — reliability, observability, inbox dedup
 * @see ADR-003                 — Event consumer architecture unification
 */

import type { IEventConsumerConfig, IStreamEventEnvelope } from '@noema/events/consumer';
import type { CorrelationId, UserId } from '@noema/types';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { z } from 'zod';

import { schedulerObservability } from '../../infrastructure/observability/scheduler-observability.js';
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
    consumerGroup: 'scheduler-service:session-lifecycle',
    consumerName: overrides.consumerName,
    batchSize: 10,
    blockMs: 5000,
    retryBaseDelayMs: 500,
    maxProcessAttempts: 5,
    pendingIdleMs: 60_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 15_000,
    deadLetterStreamKey: 'noema:dlq:scheduler-service:session-lifecycle',
  };
}

// ============================================================================
// Payload schemas
// ============================================================================

const SessionStatsSchema = z
  .object({
    totalAttempts: z.number().int().nonnegative(),
    correctCount: z.number().int().nonnegative(),
    incorrectCount: z.number().int().nonnegative(),
    skippedCount: z.number().int().nonnegative(),
    averageResponseTimeMs: z.number().nonnegative(),
    averageConfidence: z.number().nullable(),
    retentionRate: z.number().min(0).max(1),
    uniqueCardsReviewed: z.number().int().nonnegative(),
    newCardsIntroduced: z.number().int().nonnegative(),
    lapsedCards: z.number().int().nonnegative(),
  })
  .passthrough();

const SessionCompletedPayloadSchema = z
  .object({
    userId: z.string().min(1),
    terminationReason: z.string().optional(),
    stats: SessionStatsSchema,
    totalDurationMs: z.number().nonnegative(),
    activeDurationMs: z.number().nonnegative(),
  })
  .passthrough();

const SessionAbandonedPayloadSchema = z
  .object({
    userId: z.string().min(1),
    reason: z.string().optional(),
    stats: SessionStatsSchema,
    activeDurationMs: z.number().nonnegative(),
    cardsRemaining: z.number().int().nonnegative(),
  })
  .passthrough();

// ============================================================================
// Consumer
// ============================================================================

export class SessionLifecycleConsumer extends SchedulerBaseConsumer {
  constructor(
    redis: Redis,
    logger: Logger,
    consumerName: string,
    sourceStreamKey?: string,
  ) {
    super(
      redis,
      buildConfig({
        sourceStreamKey: sourceStreamKey ?? 'noema:events:session-service',
        consumerName,
      }),
      logger,
    );
  }

  protected async dispatchEvent(envelope: IStreamEventEnvelope): Promise<void> {
    if (
      envelope.eventType !== 'session.completed' &&
      envelope.eventType !== 'session.abandoned'
    ) {
      return;
    }

    switch (envelope.eventType) {
      case 'session.completed':
        await this.handleSessionCompleted(envelope);
        break;
      case 'session.abandoned':
        await this.handleSessionAbandoned(envelope);
        break;
    }
  }

  // --------------------------------------------------------------------------
  // session.completed → Record final session statistics
  // --------------------------------------------------------------------------

  private async handleSessionCompleted(envelope: IStreamEventEnvelope): Promise<void> {
    const parsed = SessionCompletedPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      this.logger.warn(
        { eventType: envelope.eventType },
        'Skipping invalid session.completed payload',
      );
      return;
    }

    const userId = parsed.data.userId as UserId;
    const sessionId = envelope.aggregateId;
    const stats = parsed.data.stats;

    // Record latency metric for session-level processing
    const startedAt = Date.now();

    // Fetch reviews from this session to identify which cards were reviewed
    const sessionReviews = await this.dependencies.reviewRepository.findBySession(sessionId);

    if (sessionReviews.length === 0) {
      this.logger.debug(
        { sessionId, userId },
        'session.completed has no associated reviews; skipping scheduler update',
      );
      return;
    }

    // Log session analytics for observability
    this.logger.info(
      {
        sessionId,
        userId,
        terminationReason: parsed.data.terminationReason,
        totalDurationMs: parsed.data.totalDurationMs,
        activeDurationMs: parsed.data.activeDurationMs,
        totalAttempts: stats.totalAttempts,
        correctCount: stats.correctCount,
        retentionRate: stats.retentionRate,
        uniqueCardsReviewed: stats.uniqueCardsReviewed,
        newCardsIntroduced: stats.newCardsIntroduced,
        lapsedCards: stats.lapsedCards,
        reviewsFound: sessionReviews.length,
      },
      'Session completed: recorded scheduler analytics',
    );

    // Publish a scheduler-level session analytics event for downstream consumption
    await this.dependencies.eventPublisher.publish({
      eventType: 'scheduler.session.analytics',
      aggregateType: 'Schedule',
      aggregateId: sessionId,
      payload: {
        userId,
        sessionId,
        terminationReason: parsed.data.terminationReason,
        totalDurationMs: parsed.data.totalDurationMs,
        activeDurationMs: parsed.data.activeDurationMs,
        reviewCount: sessionReviews.length,
        retentionRate: stats.retentionRate,
        averageResponseTimeMs: stats.averageResponseTimeMs,
        newCardsIntroduced: stats.newCardsIntroduced,
        lapsedCards: stats.lapsedCards,
        averageConfidence: stats.averageConfidence,
      },
      metadata: {
        correlationId:
          (envelope.metadata?.['correlationId'] as CorrelationId | undefined) ?? (envelope.aggregateId as CorrelationId),
        userId,
      },
    });

    schedulerObservability.recordRecomputeLatency(Date.now() - startedAt);
  }

  // --------------------------------------------------------------------------
  // session.abandoned → Partial commit for reviewed cards
  // --------------------------------------------------------------------------

  private async handleSessionAbandoned(envelope: IStreamEventEnvelope): Promise<void> {
    const parsed = SessionAbandonedPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      this.logger.warn(
        { eventType: envelope.eventType },
        'Skipping invalid session.abandoned payload',
      );
      return;
    }

    const userId = parsed.data.userId as UserId;
    const sessionId = envelope.aggregateId;
    const stats = parsed.data.stats;

    // Fetch reviews that were recorded before abandonment
    const sessionReviews = await this.dependencies.reviewRepository.findBySession(sessionId);

    // Log the partial session data
    this.logger.info(
      {
        sessionId,
        userId,
        reason: parsed.data.reason,
        activeDurationMs: parsed.data.activeDurationMs,
        cardsRemaining: parsed.data.cardsRemaining,
        totalAttempts: stats.totalAttempts,
        correctCount: stats.correctCount,
        retentionRate: stats.retentionRate,
        reviewsFound: sessionReviews.length,
      },
      'Session abandoned: recorded partial scheduler analytics',
    );

    // Publish a scheduler-level session abandoned event for analytics pipeline
    if (sessionReviews.length > 0) {
      await this.dependencies.eventPublisher.publish({
        eventType: 'scheduler.session.abandoned',
        aggregateType: 'Schedule',
        aggregateId: sessionId,
        payload: {
          userId,
          sessionId,
          reason: parsed.data.reason,
          activeDurationMs: parsed.data.activeDurationMs,
          cardsRemaining: parsed.data.cardsRemaining,
          reviewsBeforeAbandonment: sessionReviews.length,
          retentionRate: stats.retentionRate,
          averageResponseTimeMs: stats.averageResponseTimeMs,
        },
        metadata: {
          correlationId:
          (envelope.metadata?.['correlationId'] as CorrelationId | undefined) ?? (envelope.aggregateId as CorrelationId),
        },
      });
    }
  }
}
