/**
 * @noema/scheduler-service - Review Recorded Event Consumer
 *
 * Handles 'attempt.recorded' and 'review.submitted' events.
 * Applies FSRS (retention lane) or HLR (calibration lane) algorithms,
 * updates scheduler card state via the state machine, and persists
 * calibration data for incremental model updates.
 *
 * This is the core scheduling recomputation consumer (Task T2.2).
 *
 * @see SchedulerBaseConsumer   — reliability, observability, inbox dedup
 * @see ADR-003                 — Event consumer architecture unification
 */

import type { IEventConsumerConfig, IStreamEventEnvelope } from '@noema/events/consumer';
import type { CardId, StudyMode, UserId } from '@noema/types';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { z } from 'zod';

import { DEFAULT_FSRS_WEIGHTS, FSRSModel } from '../../domain/scheduler-service/algorithms/fsrs.js';
import { HLRModel, type Feature } from '../../domain/scheduler-service/algorithms/hlr.js';
import { computeNextState } from '../../domain/scheduler-service/state-machine.js';
import { schedulerObservability } from '../../infrastructure/observability/scheduler-observability.js';
import type { Rating, SchedulerCardState, SchedulerLane } from '../../types/scheduler.types.js';
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
    consumerGroup: 'scheduler-service:review-recorded',
    consumerName: overrides.consumerName,
    batchSize: 20,
    blockMs: 5000,
    retryBaseDelayMs: 250,
    maxProcessAttempts: 5,
    pendingIdleMs: 30_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 15_000,
    deadLetterStreamKey: 'noema:dlq:scheduler-service:review-recorded',
  };
}

// ============================================================================
// Payload schema
// ============================================================================

const AttemptRecordedPayloadSchema = z
  .object({
    attemptId: z.string().min(1),
    sessionId: z.string().min(1),
    cardId: z.string().min(1),
    userId: z.string().min(1),
    rating: z.string().min(1),
    ratingValue: z.number().optional(),
    outcome: z.string().optional(),
    responseTimeMs: z.number().optional(),
    deltaDays: z.number().optional(),
    priorSchedulingState: z.record(z.unknown()).optional(),
    newSchedulingState: z.record(z.unknown()).optional(),
    confidenceBefore: z.number().optional(),
    confidenceAfter: z.number().optional(),
    hintRequestCount: z.number().optional(),
    lane: z.string().optional(),
    studyMode: z.enum(['language_learning', 'knowledge_gaining']).optional(),
    contextSnapshot: z
      .object({
        studyMode: z.enum(['language_learning', 'knowledge_gaining']).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

// ============================================================================
// Consumer
// ============================================================================

export class ReviewRecordedConsumer extends SchedulerBaseConsumer {
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
    if (envelope.eventType !== 'attempt.recorded' && envelope.eventType !== 'review.submitted') {
      return;
    }

    await this.handleReviewRecorded(envelope);
  }

  private async handleReviewRecorded(envelope: IStreamEventEnvelope): Promise<void> {
    const traceId =
      (envelope.metadata?.['correlationId'] as string | undefined) ??
      (typeof envelope.aggregateId === 'string' && envelope.aggregateId.length > 0
        ? envelope.aggregateId
        : `evt_${randomUUID()}`);
    const spanContext: { traceId: string; correlationId?: string; component?: string } = {
      traceId,
      component: 'event',
    };
    if (
      typeof envelope.metadata?.['correlationId'] === 'string' &&
      envelope.metadata['correlationId'].length > 0
    ) {
      spanContext.correlationId = envelope.metadata['correlationId'];
    }
    const span = schedulerObservability.startSpan('event.consumer.handleReviewRecorded', {
      ...spanContext,
    });
    const startedAt = Date.now();
    let spanSuccess = false;

    try {
      const parsed = AttemptRecordedPayloadSchema.safeParse(envelope.payload);
      if (!parsed.success) {
        this.logger.warn(
          { eventType: envelope.eventType },
          'Skipping invalid attempt.recorded/review.submitted payload'
        );
        spanSuccess = true;
        return;
      }

      const rating = this.readRating(parsed.data.rating);
      if (rating === null) {
        this.logger.warn({ eventType: envelope.eventType }, 'Skipping payload with invalid rating');
        spanSuccess = true;
        return;
      }

      const userId = parsed.data.userId as UserId;
      const cardId = parsed.data.cardId as CardId;
      const attemptId = parsed.data.attemptId;
      const studyMode = (parsed.data.studyMode ??
        parsed.data.contextSnapshot?.studyMode ??
        'knowledge_gaining') as StudyMode;

      // Domain-level idempotency check (belt-and-suspenders in addition to inbox dedup)
      const existingReview = await this.dependencies.reviewRepository.findByAttemptId(attemptId);
      if (existingReview !== null) {
        this.logger.debug({ attemptId }, 'Skipping duplicate review event');
        spanSuccess = true;
        return;
      }

      const existing = await this.dependencies.schedulerCardRepository.findByCard(
        userId,
        cardId,
        studyMode
      );
      const lane = this.readLane(parsed.data.lane) ?? existing?.lane ?? 'retention';

      try {
        await this.dependencies.reviewRepository.create({
          id: `rev_${attemptId}`,
          cardId,
          userId,
          studyMode,
          sessionId: parsed.data.sessionId,
          attemptId,
          rating,
          ratingValue: parsed.data.ratingValue ?? 3,
          outcome: parsed.data.outcome ?? 'correct',
          deltaDays: parsed.data.deltaDays ?? 0,
          responseTime: parsed.data.responseTimeMs ?? null,
          reviewedAt: new Date().toISOString(),
          priorState: parsed.data.priorSchedulingState ?? {},
          newState: parsed.data.newSchedulingState ?? {},
          schedulingAlgorithm: lane === 'retention' ? 'fsrs' : 'hlr',
          lane,
          confidenceBefore: parsed.data.confidenceBefore ?? null,
          confidenceAfter: parsed.data.confidenceAfter ?? null,
          hintRequestCount: parsed.data.hintRequestCount ?? null,
        });
      } catch (error: unknown) {
        if (this.isUniqueViolation(error)) {
          this.logger.debug({ attemptId }, 'Duplicate review insert prevented by unique key');
          spanSuccess = true;
          return;
        }
        throw error;
      }

      if (existing === null) {
        await this.createNewSchedulerCard(userId, cardId, rating, lane, studyMode);
        spanSuccess = true;
        schedulerObservability.recordRecomputeLatency(Date.now() - startedAt);
        return;
      }

      await this.updateExistingSchedulerCard(existing, userId, cardId, rating, lane, studyMode, {
        deltaDays: parsed.data.deltaDays,
      });
      spanSuccess = true;
      schedulerObservability.recordRecomputeLatency(Date.now() - startedAt);
    } finally {
      span.end(spanSuccess);
    }
  }

  // --------------------------------------------------------------------------
  // Card creation (new card)
  // --------------------------------------------------------------------------

  private async createNewSchedulerCard(
    userId: UserId,
    cardId: CardId,
    rating: Rating,
    lane: SchedulerLane,
    studyMode: StudyMode
  ): Promise<void> {
    const schedulingAlgorithm = lane === 'retention' ? 'fsrs' : 'hlr';
    let initialStability: number | null = null;
    let initialDifficulty: number | null = null;
    let initialHalfLife: number | null = null;
    let initialInterval = 0;

    if (lane === 'retention') {
      const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });
      const initialState = fsrs.initState(rating);
      initialStability = initialState.stability;
      initialDifficulty = initialState.difficulty;
      initialInterval = fsrs.nextInterval(initialState.stability);
    } else {
      const hlr = new HLRModel();
      const features = this.extractHLRFeatures({
        reviewCount: 0,
        lapseCount: 0,
        consecutiveCorrect: 0,
        cardType: null,
      });
      initialHalfLife = hlr.halflife(features);
      initialInterval = Math.max(1, Math.round(initialHalfLife));
    }

    const nextState = computeNextState({
      fromState: 'new',
      rating,
      consecutiveCorrect: rating === 'again' ? 0 : 1,
    }) as SchedulerCardState;

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + initialInterval);

    await this.dependencies.schedulerCardRepository.create({
      id: `sc_${crypto.randomUUID()}`,
      cardId,
      userId,
      studyMode,
      lane,
      stability: initialStability,
      difficultyParameter: initialDifficulty,
      halfLife: initialHalfLife,
      interval: initialInterval,
      nextReviewDate: nextReviewDate.toISOString(),
      lastReviewedAt: new Date().toISOString(),
      reviewCount: 1,
      lapseCount: rating === 'again' ? 1 : 0,
      consecutiveCorrect: rating === 'again' ? 0 : 1,
      schedulingAlgorithm,
      cardType: null,
      difficulty: null,
      knowledgeNodeIds: [],
      state: nextState,
      suspendedUntil: null,
      suspendedReason: null,
      version: 1,
    });
  }

  // --------------------------------------------------------------------------
  // Card update (existing card)
  // --------------------------------------------------------------------------

  private async updateExistingSchedulerCard(
    existing: {
      stability: number | null;
      difficultyParameter: number | null;
      halfLife: number | null;
      interval: number;
      reviewCount: number;
      lapseCount: number;
      consecutiveCorrect: number;
      state: string;
      lastReviewedAt: string | null;
      cardType: string | null;
      version: number;
    },
    userId: UserId,
    cardId: CardId,
    rating: Rating,
    lane: SchedulerLane,
    studyMode: StudyMode,
    parsedData: { deltaDays?: number | undefined }
  ): Promise<void> {
    const schedulingAlgorithm = lane === 'retention' ? 'fsrs' : 'hlr';
    const newReviewCount = existing.reviewCount + 1;
    const newLapseCount = rating === 'again' ? existing.lapseCount + 1 : existing.lapseCount;
    const newConsecutiveCorrect = rating === 'again' ? 0 : existing.consecutiveCorrect + 1;

    let newStability = existing.stability;
    let newDifficulty = existing.difficultyParameter;
    let newHalfLife = existing.halfLife;
    let newInterval = existing.interval;

    const deltaDays = parsedData.deltaDays ?? this.computeDeltaDays(existing.lastReviewedAt);

    if (lane === 'retention') {
      const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });

      if (existing.stability !== null && existing.difficultyParameter !== null) {
        const currentState = {
          stability: existing.stability,
          difficulty: existing.difficultyParameter,
        };

        const prediction =
          existing.state === 'learning' || existing.state === 'relearning'
            ? fsrs.predictLearningState(currentState, rating)
            : fsrs.predictReviewState(currentState, deltaDays, rating, existing.interval);

        newStability = prediction.stability;
        newDifficulty = prediction.difficulty;
        newInterval = prediction.interval;
      } else {
        const initialState = fsrs.initState(rating);
        newStability = initialState.stability;
        newDifficulty = initialState.difficulty;
        newInterval = fsrs.nextInterval(initialState.stability);
      }
    } else {
      const hlr = new HLRModel();
      const features = this.extractHLRFeatures({
        reviewCount: newReviewCount,
        lapseCount: newLapseCount,
        consecutiveCorrect: newConsecutiveCorrect,
        cardType: existing.cardType,
      });

      const actualRecall = rating === 'again' ? 0.0 : rating === 'hard' ? 0.5 : 1.0;
      hlr.trainUpdate(features, deltaDays, actualRecall);

      const prediction = hlr.predict(features, 0);
      newHalfLife = prediction.halfLifeDays;
      newInterval = Math.max(1, Math.round(newHalfLife));

      try {
        const cardTypeValue = existing.cardType;
        const cardIdForCalibration = cardTypeValue !== null && cardTypeValue !== '' ? null : cardId;

        await this.dependencies.calibrationDataRepository.upsert(
          userId,
          cardIdForCalibration,
          cardTypeValue,
          studyMode,
          {
            parameters: hlr.getWeights(),
            sampleCount: newReviewCount,
            confidenceScore: Math.min(newReviewCount / 10, 1.0),
            lastTrainedAt: new Date().toISOString(),
          }
        );
      } catch (error: unknown) {
        this.logger.warn({ userId, cardId, error }, 'Failed to update calibration data');
      }
    }

    const nextState: SchedulerCardState = computeNextState({
      fromState: existing.state as SchedulerCardState,
      rating,
      consecutiveCorrect: newConsecutiveCorrect,
    }) as SchedulerCardState;

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

    await this.dependencies.schedulerCardRepository.update(
      userId,
      cardId,
      {
        lane,
        stability: newStability,
        difficultyParameter: newDifficulty,
        halfLife: newHalfLife,
        interval: newInterval,
        nextReviewDate: nextReviewDate.toISOString(),
        lastReviewedAt: new Date().toISOString(),
        reviewCount: newReviewCount,
        lapseCount: newLapseCount,
        consecutiveCorrect: newConsecutiveCorrect,
        schedulingAlgorithm,
        state: nextState,
      },
      existing.version,
      studyMode
    );
  }

  // --------------------------------------------------------------------------
  // HLR helpers
  // --------------------------------------------------------------------------

  private extractHLRFeatures(cardMeta: {
    reviewCount: number;
    lapseCount: number;
    consecutiveCorrect: number;
    cardType: string | null;
  }): Feature[] {
    const features: Feature[] = [
      ['bias', 1.0],
      ['reviews', cardMeta.reviewCount],
      ['lapses', cardMeta.lapseCount],
      ['correct_streak', cardMeta.consecutiveCorrect],
    ];

    if (cardMeta.cardType !== null && cardMeta.cardType !== '') {
      features.push([`type_${cardMeta.cardType}`, 1.0]);
    }

    return features;
  }

  private computeDeltaDays(lastReviewedAt: string | null): number {
    if (lastReviewedAt === null || lastReviewedAt === '') {
      return 0;
    }
    const lastReview = new Date(lastReviewedAt);
    const now = new Date();
    const diffMs = now.getTime() - lastReview.getTime();
    return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
  }
}
