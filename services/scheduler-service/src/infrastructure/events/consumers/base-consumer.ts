/**
 * @noema/scheduler-service - Base Event Consumer
 *
 * Production-grade abstract consumer using Redis Streams XREADGROUP
 * with consumer groups. Provides:
 * - Idempotent consumer group creation (handles BUSYGROUP)
 * - XAUTOCLAIM-based pending message recovery
 * - Exponential backoff retry with configurable max attempts
 * - Dead-letter queue after max retries
 * - In-flight tracking with drain timeout for graceful shutdown
 * - Reliability repository integration (inbox dedup, revision guards)
 * - Observability spans wrapping each message
 * - Linkage extraction + idempotency key building
 *
 * Mirrors the content-service BaseEventConsumer pattern with
 * scheduler-specific reliability and observability concerns.
 */

import type { UserId } from '@noema/types';
import type { Redis } from 'ioredis';
import { createHash, randomUUID } from 'node:crypto';
import type { Logger } from 'pino';

import type {
  ICalibrationDataRepository,
  IConsumerLinkage,
  IReviewRepository,
  ISchedulerCardRepository,
  ISchedulerEventReliabilityRepository,
} from '../../../domain/scheduler-service/scheduler.repository.js';
import type { IEventPublisher } from '../../../domain/shared/event-publisher.js';
import { schedulerObservability } from '../../observability/scheduler-observability.js';

// ============================================================================
// Types
// ============================================================================

export interface IStreamEventEnvelope {
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

// ============================================================================
// Abstract Base Consumer
// ============================================================================

export abstract class BaseEventConsumer {
  protected readonly redis: Redis;
  protected readonly config: ISchedulerEventConsumerConfig;
  protected readonly dependencies: ISchedulerEventConsumerDependencies;
  protected readonly logger: Logger;
  private isRunning = false;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    redis: Redis,
    config: ISchedulerEventConsumerConfig,
    dependencies: ISchedulerEventConsumerDependencies,
    logger: Logger
  ) {
    this.redis = redis;
    this.config = config;
    this.dependencies = dependencies;
    this.logger = logger.child({ component: this.constructor.name });
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

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
      'Event consumer started'
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

    this.logger.info('Event consumer stopped');
  }

  // --------------------------------------------------------------------------
  // Abstract handler
  // --------------------------------------------------------------------------

  /**
   * Process a dispatched event envelope. Concrete consumers implement
   * this to handle specific event types.
   *
   * The base class handles reliability repo integration (inbox claim,
   * revision guard, processed/failed marking) and observability spans.
   * Concrete consumers only need to implement domain logic.
   */
  protected abstract dispatchEvent(envelope: IStreamEventEnvelope): Promise<void>;

  // --------------------------------------------------------------------------
  // Consumer group management
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // Poll loop
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // In-flight tracking
  // --------------------------------------------------------------------------

  private trackInFlight<T>(promise: Promise<T>): Promise<T> {
    const tracked = promise.finally(() => {
      this.inFlight.delete(tracked as unknown as Promise<void>);
    });
    this.inFlight.add(tracked as unknown as Promise<void>);
    return tracked;
  }

  // --------------------------------------------------------------------------
  // Pending message recovery (XAUTOCLAIM)
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // Message handling (with reliability integration)
  // --------------------------------------------------------------------------

  private async handleStreamMessage(messageId: string, fields: string[]): Promise<void> {
    const span = schedulerObservability.startSpan('event.consumer.handleStreamMessage', {
      traceId: messageId,
      correlationId: messageId,
      component: 'event',
    });
    let spanSuccess = false;

    const eventJson = this.getFieldValue(fields, 'event');
    if (eventJson === null) {
      await this.acknowledge(messageId);
      span.end(true);
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
        const latestRevision =
          await this.dependencies.reliabilityRepository.readLatestSessionRevision(
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
      spanSuccess = true;
    } catch (error: unknown) {
      this.logger.error({ error, messageId }, 'Failed to process stream message');
      await this.handleProcessingFailure(messageId, eventJson, error);
    } finally {
      span.end(spanSuccess);
    }
  }

  // --------------------------------------------------------------------------
  // Retry / Dead-letter
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

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

  protected readCardIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === 'string' && item !== '');
  }

  protected readLane(value: unknown): 'retention' | 'calibration' | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.toLowerCase();
    if (normalized === 'retention' || normalized === 'calibration') {
      return normalized;
    }
    return null;
  }

  protected readRating(value: unknown): 'again' | 'hard' | 'good' | 'easy' | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.toLowerCase();
    if (
      normalized === 'again' ||
      normalized === 'hard' ||
      normalized === 'good' ||
      normalized === 'easy'
    ) {
      return normalized;
    }
    return null;
  }

  protected isUniqueViolation(error: unknown): boolean {
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
    const linkageView = linkage as {
      proposalId?: unknown;
      decisionId?: unknown;
      sessionId?: unknown;
      sessionRevision?: unknown;
      correlationId?: unknown;
    } | null;

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

  private buildIdempotencyKey(envelope: IStreamEventEnvelope, linkage: IConsumerLinkage): string {
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
}
