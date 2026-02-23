import { createHash, randomUUID } from 'node:crypto';
import type { CardId, CorrelationId, UserId } from '@noema/types';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { z } from 'zod';

import { DEFAULT_FSRS_WEIGHTS, FSRSModel } from '../../domain/scheduler-service/algorithms/fsrs.js';
import { HLRModel, type Feature } from '../../domain/scheduler-service/algorithms/hlr.js';
import type {
  HandshakeState,
  IConsumerLinkage,
  ISchedulerEventReliabilityRepository,
} from '../../domain/scheduler-service/scheduler.repository.js';
import type { IEventPublisher } from '../../domain/shared/event-publisher.js';
import type {
  ICalibrationDataRepository,
  IReviewRepository,
  ISchedulerCardRepository,
} from '../../domain/scheduler-service/scheduler.repository.js';
import { computeNextState } from '../../domain/scheduler-service/state-machine.js';
import type { Rating, SchedulerLane } from '../../types/scheduler.types.js';

interface IStreamEventEnvelope {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  metadata?: {
    userId?: string | null;
    correlationId?: string | null;
    [key: string]: unknown;
  };
}

const LaneSchema = z.enum(['retention', 'calibration']);
const RatingSchema = z.enum(['again', 'hard', 'good', 'easy']);

const SessionStartedPayloadSchema = z
  .object({
    userId: z.string().min(1),
    initialQueueSize: z.number().int().nonnegative(),
    initialCardIds: z.array(z.string().min(1)).optional(),
  })
  .passthrough();

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
  })
  .passthrough();

const ContentSeededPayloadSchema = z
  .object({
    userId: z.string().min(1),
    cardIds: z.array(z.string().min(1)).optional(),
    cardId: z.string().min(1).optional(),
    lane: z.string().optional(),
  })
  .passthrough();

const SessionCohortLinkageSchema = z.object({
  proposalId: z.string().min(1),
  decisionId: z.string().min(1),
  sessionId: z.string().min(1),
  sessionRevision: z.number().int().nonnegative(),
  correlationId: z.string().min(1),
});

const SessionCohortProposedPayloadSchema = z
  .object({
    userId: z.string().min(1),
    linkage: SessionCohortLinkageSchema,
    candidateCardIds: z.array(z.string().min(1)).default([]),
  })
  .passthrough();

const SessionCohortAcceptedPayloadSchema = z
  .object({
    userId: z.string().min(1),
    linkage: SessionCohortLinkageSchema,
    acceptedCardIds: z.array(z.string().min(1)).default([]),
    excludedCardIds: z.array(z.string().min(1)).default([]),
  })
  .passthrough();

const SessionCohortRevisedPayloadSchema = z
  .object({
    userId: z.string().min(1),
    linkage: SessionCohortLinkageSchema,
    revisionFrom: z.number().int().nonnegative(),
    revisionTo: z.number().int().nonnegative(),
    candidateCardIds: z.array(z.string().min(1)).default([]),
    reason: z.string().optional(),
  })
  .passthrough();

const SessionCohortCommittedPayloadSchema = z
  .object({
    userId: z.string().min(1),
    linkage: SessionCohortLinkageSchema,
    committedCardIds: z.array(z.string().min(1)).default([]),
    rejectedCardIds: z.array(z.string().min(1)).default([]),
    policyVersion: z.string().optional(),
  })
  .passthrough();

export interface ISchedulerEventConsumerConfig {
  sourceStreamKey: string;
  consumerGroup: string;
  consumerName: string;
  blockMs: number;
  batchSize: number;
  retryBaseDelayMs: number;
  maxProcessAttempts: number;
  pendingIdleMs: number;
  pendingBatchSize: number;
  drainTimeoutMs: number;
  deadLetterStreamKey: string;
}

interface IProcessingMetadata {
  schedulerProcessingAttempts?: number;
  schedulerLastError?: string;
  schedulerDeadLetteredAt?: string;
}

export interface ISchedulerEventConsumerDependencies {
  schedulerCardRepository: ISchedulerCardRepository;
  reviewRepository: IReviewRepository;
  calibrationDataRepository: ICalibrationDataRepository;
  reliabilityRepository: ISchedulerEventReliabilityRepository;
  eventPublisher: IEventPublisher;
}

export class SchedulerEventConsumer {
  private isRunning = false;
  private readonly logger: Logger;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly redis: Redis,
    private readonly config: ISchedulerEventConsumerConfig,
    private readonly dependencies: ISchedulerEventConsumerDependencies,
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'SchedulerEventConsumer' });
  }

  async start(): Promise<void> {
    await this.ensureConsumerGroup();
    this.isRunning = true;
    await this.recoverPendingMessages();
    this.logger.info(
      {
        stream: this.config.sourceStreamKey,
        group: this.config.consumerGroup,
        consumer: this.config.consumerName,
      },
      'Scheduler event consumer started'
    );

    void this.pollLoop();
  }

  stop(): Promise<void> {
    this.isRunning = false;
    return this.drainAndStop();
  }

  private async drainAndStop(): Promise<void> {
    const startedAt = Date.now();
    while (this.inFlight.size > 0 && Date.now() - startedAt < this.config.drainTimeoutMs) {
      await Promise.race(this.inFlight);
    }

    if (this.inFlight.size > 0) {
      this.logger.warn(
        { remainingInFlight: this.inFlight.size, drainTimeoutMs: this.config.drainTimeoutMs },
        'Consumer drain timeout reached before all in-flight messages completed'
      );
    }

    this.logger.info('Scheduler event consumer stopped');
  }

  private async ensureConsumerGroup(): Promise<void> {
    try {
      await this.redis.xgroup(
        'CREATE',
        this.config.sourceStreamKey,
        this.config.consumerGroup,
        '0',
        'MKSTREAM'
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (!message.includes('BUSYGROUP')) {
        throw error;
      }
    }
  }

  private async pollLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const rawEntries: unknown = await this.redis.xreadgroup(
          'GROUP',
          this.config.consumerGroup,
          this.config.consumerName,
          'COUNT',
          this.config.batchSize.toString(),
          'BLOCK',
          this.config.blockMs.toString(),
          'STREAMS',
          this.config.sourceStreamKey,
          '>'
        );

        if (rawEntries === null) {
          continue;
        }

        if (!Array.isArray(rawEntries)) {
          continue;
        }

        const entries = rawEntries;
        if (entries.length === 0) {
          continue;
        }

        const typedEntries = entries as [string, [string, string[]][]][];

        for (const [, streamEntries] of typedEntries) {
          const tasks = streamEntries.map(([messageId, fields]) =>
            this.trackInFlight(this.handleStreamMessage(messageId, fields))
          );
          await Promise.all(tasks);
        }
      } catch (error: unknown) {
        this.logger.error({ error }, 'Error in scheduler event consumer loop');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private trackInFlight<T>(promise: Promise<T>): Promise<T> {
    const tracked = promise.finally(() => {
      this.inFlight.delete(tracked as unknown as Promise<void>);
    });
    this.inFlight.add(tracked as unknown as Promise<void>);
    return tracked;
  }

  private async recoverPendingMessages(): Promise<void> {
    let startId = '0-0';
    this.logger.info(
      {
        stream: this.config.sourceStreamKey,
        group: this.config.consumerGroup,
        consumer: this.config.consumerName,
      },
      'Starting pending-message recovery'
    );

    for (;;) {
      const rawResult: unknown = await this.redis.xautoclaim(
        this.config.sourceStreamKey,
        this.config.consumerGroup,
        this.config.consumerName,
        this.config.pendingIdleMs,
        startId,
        'COUNT',
        this.config.pendingBatchSize
      );

      if (!Array.isArray(rawResult)) {
        break;
      }

      const [nextStartId, entries] = rawResult as [string, [string, string[]][]];

      if (entries.length === 0) {
        break;
      }

      for (const [messageId, fields] of entries) {
        await this.handleStreamMessage(messageId, fields);
      }

      if (nextStartId === startId) {
        break;
      }

      startId = nextStartId;
    }
  }

  private async handleStreamMessage(messageId: string, fields: string[]): Promise<void> {
    const eventJson = this.getFieldValue(fields, 'event');
    if (eventJson === null) {
      await this.acknowledge(messageId);
      return;
    }

    try {
      const envelope = JSON.parse(eventJson) as IStreamEventEnvelope;
      const linkage = this.extractLinkage(envelope);
      const idempotencyKey = this.buildIdempotencyKey(envelope, linkage);

      const claimResult = await this.dependencies.reliabilityRepository.claimInbox({
        idempotencyKey,
        eventType: envelope.eventType,
        streamMessageId: messageId,
        linkage,
        payload: envelope.payload,
      });

      if (claimResult.status !== 'claimed') {
        await this.acknowledge(messageId);
        return;
      }

      if (
        linkage.sessionId !== undefined &&
        linkage.proposalId !== undefined &&
        typeof linkage.sessionRevision === 'number'
      ) {
        const latestRevision = await this.dependencies.reliabilityRepository.readLatestSessionRevision(
          linkage.sessionId,
          linkage.proposalId
        );

        if (latestRevision !== null && linkage.sessionRevision < latestRevision) {
          await this.dependencies.reliabilityRepository.markInboxProcessed(idempotencyKey);
          await this.acknowledge(messageId);
          return;
        }
      }

      await this.dispatchEvent(envelope);
      await this.dependencies.reliabilityRepository.markInboxProcessed(idempotencyKey);
      await this.acknowledge(messageId);
    } catch (error: unknown) {
      this.logger.error({ error, messageId }, 'Failed to process stream message');
      await this.handleProcessingFailure(messageId, eventJson, error);
    }
  }

  private async handleProcessingFailure(
    messageId: string,
    eventJson: string,
    error: unknown
  ): Promise<void> {
    const parsedEnvelope = this.safeParseEnvelope(eventJson);
    if (parsedEnvelope === null) {
      await this.moveRawToDeadLetter(messageId, eventJson, error);
      return;
    }

    const attempts = this.readAttempts(parsedEnvelope.metadata);
    const nextAttempt = attempts + 1;
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';

    const linkage = this.extractLinkage(parsedEnvelope);
    const idempotencyKey = this.buildIdempotencyKey(parsedEnvelope, linkage);
    await this.dependencies.reliabilityRepository.markInboxFailed(idempotencyKey, errorMessage);

    const metadata: IStreamEventEnvelope['metadata'] & IProcessingMetadata = {
      ...parsedEnvelope.metadata,
      schedulerProcessingAttempts: nextAttempt,
      schedulerLastError: errorMessage,
    };

    if (nextAttempt >= this.config.maxProcessAttempts) {
      const deadLetterEnvelope: IStreamEventEnvelope = {
        ...parsedEnvelope,
        metadata: {
          ...metadata,
          schedulerDeadLetteredAt: new Date().toISOString(),
        },
      };

      await this.redis.xadd(
        this.config.deadLetterStreamKey,
        'MAXLEN',
        '~',
        '100000',
        '*',
        'event',
        JSON.stringify(deadLetterEnvelope)
      );
      await this.acknowledge(messageId);
      this.logger.warn(
        { messageId, attempts: nextAttempt, deadLetterStream: this.config.deadLetterStreamKey },
        'Moved stream message to dead-letter after max retry attempts'
      );
      return;
    }

    const backoffMs = Math.min(this.config.retryBaseDelayMs * 2 ** (nextAttempt - 1), 30000);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));

    await this.redis.xadd(
      this.config.sourceStreamKey,
      '*',
      'event',
      JSON.stringify({
        ...parsedEnvelope,
        metadata,
      })
    );
    await this.acknowledge(messageId);
    this.logger.warn(
      { messageId, nextAttempt, backoffMs },
      'Requeued failed stream message with retry metadata'
    );
  }

  private async dispatchEvent(envelope: IStreamEventEnvelope): Promise<void> {
    switch (envelope.eventType) {
      case 'session.started':
        await this.handleSessionStarted(envelope);
        break;
      case 'session.cohort.proposed':
        await this.handleSessionCohortTransition(envelope, 'proposed');
        break;
      case 'session.cohort.accepted':
        await this.handleSessionCohortTransition(envelope, 'accepted');
        break;
      case 'session.cohort.revised':
        await this.handleSessionCohortTransition(envelope, 'revised');
        break;
      case 'session.cohort.committed':
        await this.handleSessionCohortTransition(envelope, 'committed');
        break;
      case 'attempt.recorded':
      case 'review.submitted':
        await this.handleReviewRecorded(envelope);
        break;
      case 'content.seeded':
        await this.handleContentSeeded(envelope);
        break;
      default:
        break;
    }
  }

  private async handleSessionCohortTransition(
    envelope: IStreamEventEnvelope,
    state: HandshakeState
  ): Promise<void> {
    const parsed = this.parseCohortPayload(envelope);
    if (parsed === null) {
      this.logger.warn(
        { eventType: envelope.eventType },
        'Skipping invalid session cohort handshake payload'
      );
      return;
    }

    const linkage: IConsumerLinkage = {
      correlationId: parsed.linkage.correlationId,
      userId: parsed.userId as UserId,
      proposalId: parsed.linkage.proposalId,
      decisionId: parsed.linkage.decisionId,
      sessionId: parsed.linkage.sessionId,
      sessionRevision: parsed.linkage.sessionRevision,
    };

    await this.dependencies.reliabilityRepository.applyHandshakeTransition({
      state,
      eventType: envelope.eventType,
      linkage,
      metadata: {
        aggregateType: envelope.aggregateType,
        aggregateId: envelope.aggregateId,
      },
    });

    await this.dependencies.eventPublisher.publish({
      eventType: `schedule.handshake.${state}`,
      aggregateType: 'Schedule',
      aggregateId: parsed.linkage.sessionId,
      payload: {
        userId: parsed.userId,
        proposalId: parsed.linkage.proposalId,
        decisionId: parsed.linkage.decisionId,
        sessionId: parsed.linkage.sessionId,
        sessionRevision: parsed.linkage.sessionRevision,
        correlationId: parsed.linkage.correlationId,
        sourceEventType: envelope.eventType,
        ...this.extractCohortCards(parsed),
      },
      metadata: {
        correlationId: parsed.linkage.correlationId as CorrelationId,
        userId: parsed.userId as UserId,
      },
    });
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
      cardIds.map(async (cardId) => {
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

  private async handleReviewRecorded(envelope: IStreamEventEnvelope): Promise<void> {
    const parsed = AttemptRecordedPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      this.logger.warn(
        { eventType: envelope.eventType },
        'Skipping invalid attempt.recorded/review.submitted payload'
      );
      return;
    }

    const rating = this.readRating(parsed.data.rating);
    if (rating === null) {
      this.logger.warn({ eventType: envelope.eventType }, 'Skipping payload with invalid rating');
      return;
    }

    const lane = this.readLane(parsed.data.lane);
    if (lane === null) {
      this.logger.warn({ eventType: envelope.eventType }, 'Skipping payload with invalid lane');
      return;
    }

    const userId = parsed.data.userId as UserId;
    const cardId = parsed.data.cardId as CardId;
    const attemptId = parsed.data.attemptId;

    const existingReview = await this.dependencies.reviewRepository.findByAttemptId(attemptId);
    if (existingReview !== null) {
      this.logger.debug({ attemptId }, 'Skipping duplicate review event');
      return;
    }

    try {
      await this.dependencies.reviewRepository.create({
        id: `rev_${attemptId}`,
        cardId,
        userId,
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
        return;
      }
      throw error;
    }

    const existing = await this.dependencies.schedulerCardRepository.findByCard(userId, cardId);
    if (existing === null) {
      // Initialize new card with algorithm-specific parameters
      const schedulingAlgorithm = lane === 'retention' ? 'fsrs' : 'hlr';
      let initialStability: number | null = null;
      let initialDifficulty: number | null = null;
      let initialHalfLife: number | null = null;
      let initialInterval = 0;

      if (lane === 'retention') {
        // Initialize FSRS parameters
        const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });
        const initialState = fsrs.initState(rating);
        initialStability = initialState.stability;
        initialDifficulty = initialState.difficulty;
        initialInterval = fsrs.nextInterval(initialState.stability);
      } else {
        // Initialize HLR parameters (calibration lane)
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
      });

      const nextReviewDate = new Date();
      nextReviewDate.setDate(nextReviewDate.getDate() + initialInterval);

      await this.dependencies.schedulerCardRepository.create({
        id: `sc_${crypto.randomUUID()}`,
        cardId,
        userId,
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
      return;
    }

    // Update existing card with algorithm-specific computations
    const schedulingAlgorithm = lane === 'retention' ? 'fsrs' : 'hlr';
    const newReviewCount = existing.reviewCount + 1;
    const newLapseCount = rating === 'again' ? existing.lapseCount + 1 : existing.lapseCount;
    const newConsecutiveCorrect = rating === 'again' ? 0 : existing.consecutiveCorrect + 1;

    let newStability = existing.stability;
    let newDifficulty = existing.difficultyParameter;
    let newHalfLife = existing.halfLife;
    let newInterval = existing.interval;

    // Compute elapsed days since last review
    const deltaDays = parsed.data.deltaDays ?? this.computeDeltaDays(existing.lastReviewedAt);

    if (lane === 'retention') {
      // Apply FSRS algorithm
      const fsrs = new FSRSModel({ weights: DEFAULT_FSRS_WEIGHTS });

      if (existing.stability !== null && existing.difficultyParameter !== null) {
        // Update existing FSRS state
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
        // Initialize FSRS state if missing
        const initialState = fsrs.initState(rating);
        newStability = initialState.stability;
        newDifficulty = initialState.difficulty;
        newInterval = fsrs.nextInterval(initialState.stability);
      }
    } else {
      // Apply HLR algorithm (calibration lane)
      const hlr = new HLRModel();
      const features = this.extractHLRFeatures({
        reviewCount: newReviewCount,
        lapseCount: newLapseCount,
        consecutiveCorrect: newConsecutiveCorrect,
        cardType: existing.cardType,
      });

      // Compute actual recall from rating
      const actualRecall = rating === 'again' ? 0.0 : rating === 'hard' ? 0.5 : 1.0;

      // Train HLR model with new observation (per-review incremental update)
      hlr.trainUpdate(features, deltaDays, actualRecall);

      // Predict new half-life
      const prediction = hlr.predict(features, 0);
      newHalfLife = prediction.halfLifeDays;
      newInterval = Math.max(1, Math.round(newHalfLife));

      // Persist calibration data update (per-review incremental policy)
      try {
        const cardTypeValue = existing.cardType;
        const cardIdForCalibration = cardTypeValue !== null && cardTypeValue !== '' ? null : cardId;

        await this.dependencies.calibrationDataRepository.upsert(
          userId,
          cardIdForCalibration,
          cardTypeValue,
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

    // Compute next state using state machine
    const nextState = computeNextState({
      fromState: existing.state,
      rating,
      consecutiveCorrect: newConsecutiveCorrect,
    });

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
      existing.version
    );
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
    const cardIds = [
      ...this.readCardIds(parsed.data.cardIds),
      ...(parsed.data.cardId !== undefined ? [parsed.data.cardId as CardId] : []),
    ];

    if (cardIds.length === 0) {
      return;
    }

    await Promise.all(
      cardIds.map(async (cardId) => {
        const existing = await this.dependencies.schedulerCardRepository.findByCard(userId, cardId);
        if (existing !== null) {
          return;
        }

        await this.dependencies.schedulerCardRepository.create({
          id: `sc_${crypto.randomUUID()}`,
          cardId,
          userId,
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
      })
    );
  }

  private async acknowledge(messageId: string): Promise<void> {
    await this.redis.xack(this.config.sourceStreamKey, this.config.consumerGroup, messageId);
  }

  private getFieldValue(fields: string[], key: string): string | null {
    for (let index = 0; index < fields.length; index += 2) {
      if (fields[index] === key) {
        return fields[index + 1] ?? null;
      }
    }
    return null;
  }

  private readCardIds(value: unknown): CardId[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item): item is string => typeof item === 'string' && item !== '')
      .map((item) => item as CardId);
  }

  private readLane(value: unknown): SchedulerLane | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.toLowerCase();
    const parsed = LaneSchema.safeParse(normalized);
    return parsed.success ? parsed.data : null;
  }

  private readRating(value: unknown): Rating | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.toLowerCase();
    const parsed = RatingSchema.safeParse(normalized);
    return parsed.success ? parsed.data : null;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    return (
      message.includes('unique') ||
      message.includes('duplicate key') ||
      message.includes('constraint')
    );
  }

  private safeParseEnvelope(eventJson: string): IStreamEventEnvelope | null {
    try {
      return JSON.parse(eventJson) as IStreamEventEnvelope;
    } catch {
      return null;
    }
  }

  private readAttempts(metadata: IStreamEventEnvelope['metadata']): number {
    const attempts =
      metadata !== undefined &&
      'schedulerProcessingAttempts' in metadata &&
      typeof (metadata as IProcessingMetadata).schedulerProcessingAttempts === 'number'
        ? (metadata as IProcessingMetadata).schedulerProcessingAttempts
        : 0;

    return attempts ?? 0;
  }

  private async moveRawToDeadLetter(
    messageId: string,
    eventJson: string,
    error: unknown
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
    await this.redis.xadd(
      this.config.deadLetterStreamKey,
      'MAXLEN',
      '~',
      '100000',
      '*',
      'event',
      JSON.stringify({
        eventType: 'scheduler.dead_letter.raw',
        aggregateType: 'SchedulerConsumer',
        aggregateId: messageId,
        payload: {
          rawEvent: eventJson,
          messageId,
        },
        metadata: {
          schedulerProcessingAttempts: this.config.maxProcessAttempts,
          schedulerLastError: errorMessage,
          schedulerDeadLetteredAt: new Date().toISOString(),
        },
      } satisfies IStreamEventEnvelope)
    );
    await this.acknowledge(messageId);
  }

  private extractLinkage(envelope: IStreamEventEnvelope): IConsumerLinkage {
    const payload = envelope.payload;
    const payloadView = payload as {
      linkage?: unknown;
      proposalId?: unknown;
      orchestrationProposalId?: unknown;
      decisionId?: unknown;
      sessionId?: unknown;
      sessionRevision?: unknown;
      userId?: unknown;
      correlationId?: unknown;
    };
    const linkage = this.readRecord(payloadView.linkage);
    const linkageView = linkage as
      | {
          proposalId?: unknown;
          decisionId?: unknown;
          sessionId?: unknown;
          sessionRevision?: unknown;
          correlationId?: unknown;
        }
      | null;

    const proposalId = this.readString(
      payloadView.proposalId ?? payloadView.orchestrationProposalId ?? linkageView?.proposalId
    );
    const decisionId = this.readString(payloadView.decisionId ?? linkageView?.decisionId);
    const sessionId = this.readString(payloadView.sessionId ?? linkageView?.sessionId);
    const sessionRevision = this.readNumber(
      payloadView.sessionRevision ?? linkageView?.sessionRevision
    );
    const userId = this.readString(payloadView.userId ?? envelope.metadata?.userId);

    const correlationFromPayload = this.readString(
      payloadView.correlationId ?? linkageView?.correlationId
    );
    const correlationId =
      correlationFromPayload ??
      this.readString(envelope.metadata?.correlationId) ??
      `cor_${randomUUID()}`;

    return {
      correlationId,
      ...(userId !== undefined ? { userId: userId as UserId } : {}),
      ...(proposalId !== undefined ? { proposalId } : {}),
      ...(decisionId !== undefined ? { decisionId } : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(sessionRevision !== undefined ? { sessionRevision } : {}),
    };
  }

  private buildIdempotencyKey(
    envelope: IStreamEventEnvelope,
    linkage: IConsumerLinkage
  ): string {
    const payload = envelope.payload;
    const attemptId = this.readString(payload['attemptId']);

    if (attemptId !== undefined) {
      return `attempt:${attemptId}`;
    }

    if (
      linkage.sessionId !== undefined &&
      linkage.proposalId !== undefined &&
      typeof linkage.sessionRevision === 'number'
    ) {
      return `cohort:${envelope.eventType}:${linkage.sessionId}:${linkage.proposalId}:${String(linkage.sessionRevision)}`;
    }

    const digest = createHash('sha256')
      .update(JSON.stringify(envelope.payload))
      .digest('hex')
      .slice(0, 24);
    return `evt:${envelope.eventType}:${envelope.aggregateId}:${linkage.correlationId}:${digest}`;
  }

  private parseCohortPayload(envelope: IStreamEventEnvelope): {
    userId: string;
    linkage: {
      proposalId: string;
      decisionId: string;
      sessionId: string;
      sessionRevision: number;
      correlationId: string;
    };
    candidateCardIds?: string[];
    acceptedCardIds?: string[];
    excludedCardIds?: string[];
    committedCardIds?: string[];
    rejectedCardIds?: string[];
  } | null {
    if (envelope.eventType === 'session.cohort.proposed') {
      const parsed = SessionCohortProposedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? parsed.data : null;
    }

    if (envelope.eventType === 'session.cohort.accepted') {
      const parsed = SessionCohortAcceptedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? parsed.data : null;
    }

    if (envelope.eventType === 'session.cohort.revised') {
      const parsed = SessionCohortRevisedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? parsed.data : null;
    }

    if (envelope.eventType === 'session.cohort.committed') {
      const parsed = SessionCohortCommittedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? parsed.data : null;
    }

    return null;
  }

  private extractCohortCards(payload: {
    candidateCardIds?: string[];
    acceptedCardIds?: string[];
    excludedCardIds?: string[];
    committedCardIds?: string[];
    rejectedCardIds?: string[];
  }): Record<string, unknown> {
    return {
      candidateCardIds: payload.candidateCardIds ?? [],
      acceptedCardIds: payload.acceptedCardIds ?? [],
      excludedCardIds: payload.excludedCardIds ?? [],
      committedCardIds: payload.committedCardIds ?? [],
      rejectedCardIds: payload.rejectedCardIds ?? [],
    };
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value !== '' ? value : undefined;
  }

  private readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  /**
   * Extract HLR feature vector from card metadata.
   */
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

  /**
   * Compute delta days since last review.
   */
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
