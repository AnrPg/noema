import type { CardId, UserId } from '@noema/types';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { z } from 'zod';

import type {
    ICalibrationDataRepository,
    IReviewRepository,
    ISchedulerCardRepository,
} from '../../domain/scheduler-service/scheduler.repository.js';
import type { Rating, SchedulerLane } from '../../types/scheduler.types.js';

interface IStreamEventEnvelope {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  metadata?: {
    userId?: string | null;
    correlationId?: string | null;
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

export interface ISchedulerEventConsumerConfig {
  sourceStreamKey: string;
  consumerGroup: string;
  consumerName: string;
  blockMs: number;
  batchSize: number;
}

export interface ISchedulerEventConsumerDependencies {
  schedulerCardRepository: ISchedulerCardRepository;
  reviewRepository: IReviewRepository;
  calibrationDataRepository: ICalibrationDataRepository;
}

export class SchedulerEventConsumer {
  private isRunning = false;
  private readonly logger: Logger;

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
    this.logger.info('Scheduler event consumer stopped');
    return Promise.resolve();
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
        const entries = await this.redis.xreadgroup(
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

        if (entries.length === 0) {
          continue;
        }

        const typedEntries = entries as [string, [string, string[]][]][];

        for (const [, streamEntries] of typedEntries) {
          for (const [messageId, fields] of streamEntries) {
            await this.handleStreamMessage(messageId, fields);
          }
        }
      } catch (error: unknown) {
        this.logger.error({ error }, 'Error in scheduler event consumer loop');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async handleStreamMessage(messageId: string, fields: string[]): Promise<void> {
    try {
      const eventJson = this.getFieldValue(fields, 'event');
      if (eventJson === null) {
        await this.acknowledge(messageId);
        return;
      }

      const envelope = JSON.parse(eventJson) as IStreamEventEnvelope;
      await this.dispatchEvent(envelope);
      await this.acknowledge(messageId);
    } catch (error: unknown) {
      this.logger.error({ error, messageId }, 'Failed to process stream message');
      await this.acknowledge(messageId);
    }
  }

  private async dispatchEvent(envelope: IStreamEventEnvelope): Promise<void> {
    switch (envelope.eventType) {
      case 'session.started':
        await this.handleSessionStarted(envelope);
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

  private async handleSessionStarted(envelope: IStreamEventEnvelope): Promise<void> {
    const parsed = SessionStartedPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      this.logger.warn({ eventType: envelope.eventType }, 'Skipping invalid session.started payload');
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
        const existing = await this.dependencies.schedulerCardRepository.findById(cardId);
        if (existing !== null) {
          return;
        }

        await this.dependencies.schedulerCardRepository.create({
          id: cardId,
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

    const existing = await this.dependencies.schedulerCardRepository.findById(cardId);
    if (existing === null) {
      await this.dependencies.schedulerCardRepository.create({
        id: cardId,
        userId,
        lane,
        stability: null,
        difficultyParameter: null,
        halfLife: null,
        interval: 0,
        nextReviewDate: new Date().toISOString(),
        lastReviewedAt: new Date().toISOString(),
        reviewCount: 1,
        lapseCount: rating === 'again' ? 1 : 0,
        consecutiveCorrect: rating === 'again' ? 0 : 1,
        schedulingAlgorithm: lane === 'retention' ? 'fsrs' : 'hlr',
        cardType: null,
        difficulty: null,
        knowledgeNodeIds: [],
        state: 'learning',
        suspendedUntil: null,
        suspendedReason: null,
        version: 1,
      });
      return;
    }

    await this.dependencies.schedulerCardRepository.update(
      cardId,
      {
        lane,
        lastReviewedAt: new Date().toISOString(),
        reviewCount: existing.reviewCount + 1,
        lapseCount: rating === 'again' ? existing.lapseCount + 1 : existing.lapseCount,
        consecutiveCorrect: rating === 'again' ? 0 : existing.consecutiveCorrect + 1,
        schedulingAlgorithm: lane === 'retention' ? 'fsrs' : 'hlr',
      },
      existing.version
    );
  }

  private async handleContentSeeded(envelope: IStreamEventEnvelope): Promise<void> {
    const parsed = ContentSeededPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      this.logger.warn({ eventType: envelope.eventType }, 'Skipping invalid content.seeded payload');
      return;
    }

    const lane = this.readLane(parsed.data.lane);
    if (lane === null) {
      this.logger.warn({ eventType: envelope.eventType }, 'Skipping content.seeded with invalid lane');
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
        const existing = await this.dependencies.schedulerCardRepository.findById(cardId);
        if (existing !== null) {
          return;
        }

        await this.dependencies.schedulerCardRepository.create({
          id: cardId,
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
}
