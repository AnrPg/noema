/**
 * @noema/events - Shared Base Event Consumer
 *
 * Production-grade abstract consumer using Redis Streams XREADGROUP
 * with consumer groups. Single source of truth for event consumption
 * lifecycle across all Noema services.
 *
 * Provides:
 * - Idempotent consumer group creation (handles BUSYGROUP)
 * - XAUTOCLAIM-based pending message recovery
 * - Exponential backoff retry with configurable max attempts
 * - Dead-letter queue after max retries
 * - In-flight tracking with drain timeout for graceful shutdown
 * - Single 'event' field parsing (aligned with RedisEventPublisher)
 *
 * Concrete consumers extend this class and implement `handleEvent()`.
 * Services that need extra middleware (e.g., inbox dedup, observability)
 * can create a service-local subclass that wraps `handleEvent()`.
 *
 * @see ADR-003 — Event consumer architecture unification
 */

import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

// ============================================================================
// Types
// ============================================================================

/**
 * Envelope structure parsed from the single 'event' JSON field
 * published by RedisEventPublisher.
 *
 * Every event published via `RedisEventPublisher.publish()` produces
 * a Redis Stream entry with a single `event` field containing JSON
 * matching this shape.
 */
export interface IStreamEventEnvelope {
  /** Dot-separated event type (e.g., 'card.created', 'user.deleted') */
  eventType: string;
  /** Aggregate root type (e.g., 'Card', 'User', 'Session') */
  aggregateType: string;
  /** Aggregate root ID (e.g., cardId, userId, sessionId) */
  aggregateId: string;
  /** Event-specific payload — shape depends on eventType */
  payload: Record<string, unknown>;
  /** Publisher-injected metadata (correlationId, userId, timestamps, etc.) */
  metadata: Record<string, unknown>;
  /** ISO timestamp of event creation */
  timestamp?: string;
  /** Event schema version */
  version?: number;
  /** Unique event identifier */
  eventId?: string;
}

/**
 * Configuration for an event consumer instance.
 *
 * Consumer-specific defaults should be set in each consumer's
 * `buildConfig()` static factory rather than in global service config.
 */
export interface IEventConsumerConfig {
  /** Redis stream key to consume from */
  sourceStreamKey: string;
  /** Consumer group name (shared across instances of same logical consumer) */
  consumerGroup: string;
  /** Unique consumer name within the group (typically hostname + pid) */
  consumerName: string;
  /** Max messages per XREADGROUP call */
  batchSize: number;
  /** XREADGROUP block timeout in ms */
  blockMs: number;
  /** Base delay in ms for exponential backoff */
  retryBaseDelayMs: number;
  /** Max processing attempts before dead-lettering */
  maxProcessAttempts: number;
  /** Idle time in ms before XAUTOCLAIM can claim pending messages */
  pendingIdleMs: number;
  /** Max messages per XAUTOCLAIM batch */
  pendingBatchSize: number;
  /** Max time in ms to wait for in-flight messages during shutdown */
  drainTimeoutMs: number;
  /** Dead-letter stream key */
  deadLetterStreamKey: string;
}

/**
 * Processing metadata attached to retry/DLQ envelopes.
 * Uses a generic prefix ('noema') to avoid service-specific coupling.
 */
interface IProcessingMetadata {
  noemaProcessingAttempts: number;
  noemaLastError: string;
  noemaDeadLetteredAt?: string;
}

// ============================================================================
// Default Config Values
// ============================================================================

/**
 * Default consumer configuration values.
 * Consumers override these via their `buildConfig()` factories.
 */
export const DEFAULT_CONSUMER_CONFIG: Omit<
  IEventConsumerConfig,
  'sourceStreamKey' | 'consumerGroup' | 'consumerName' | 'deadLetterStreamKey'
> = {
  batchSize: 10,
  blockMs: 5000,
  retryBaseDelayMs: 500,
  maxProcessAttempts: 5,
  pendingIdleMs: 60_000,
  pendingBatchSize: 50,
  drainTimeoutMs: 10_000,
};

// ============================================================================
// Abstract Base Consumer
// ============================================================================

export abstract class BaseEventConsumer {
  protected readonly redis: Redis;
  protected readonly config: IEventConsumerConfig;
  protected readonly logger: Logger;
  private isRunning = false;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(redis: Redis, config: IEventConsumerConfig, logger: Logger) {
    this.redis = redis;
    this.config = config;
    this.logger = logger.child({ consumer: this.constructor.name });
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Create consumer group idempotently.
   * Must be called before start(). Handles BUSYGROUP (group already exists).
   */
  async initialize(): Promise<void> {
    await this.ensureConsumerGroup();
  }

  /**
   * Begin consuming messages. Recovers pending messages, then enters poll loop.
   * Returns a promise that resolves when the consumer stops.
   */
  async start(): Promise<void> {
    this.isRunning = true;
    this.logger.info(
      { stream: this.config.sourceStreamKey, group: this.config.consumerGroup },
      'Event consumer starting'
    );

    await this.recoverPendingMessages();
    await this.pollLoop();
  }

  /**
   * Signal the consumer to stop after current batch completes.
   */
  stop(): void {
    this.isRunning = false;
    this.logger.info('Event consumer stopping');
  }

  /**
   * Wait for in-flight messages to finish processing, with a timeout.
   * Call after stop() during graceful shutdown.
   */
  async drain(): Promise<void> {
    if (this.inFlight.size === 0) return;

    this.logger.info(
      { inFlight: this.inFlight.size, drainTimeoutMs: this.config.drainTimeoutMs },
      'Draining in-flight messages'
    );

    const drainPromise = Promise.allSettled([...this.inFlight]);
    const timeoutPromise = new Promise<void>((resolve) =>
      setTimeout(resolve, this.config.drainTimeoutMs)
    );

    await Promise.race([drainPromise, timeoutPromise]);

    if (this.inFlight.size > 0) {
      this.logger.warn(
        { remaining: this.inFlight.size },
        'Drain timeout reached — some messages may not have completed'
      );
    }
  }

  // --------------------------------------------------------------------------
  // Abstract handler
  // --------------------------------------------------------------------------

  /**
   * Process a single event envelope. Concrete consumers implement this
   * to handle specific event types.
   *
   * @returns true if the event was processed (or intentionally skipped),
   *          false to trigger retry. Throwing also triggers retry/DLQ.
   */
  protected abstract handleEvent(envelope: IStreamEventEnvelope): Promise<boolean>;

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
      this.logger.info(
        { stream: this.config.sourceStreamKey, group: this.config.consumerGroup },
        'Consumer group created'
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (!message.includes('BUSYGROUP')) {
        throw error;
      }
      // Group already exists — idempotent, no-op
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

        if (rawEntries === null || !Array.isArray(rawEntries) || rawEntries.length === 0) {
          continue;
        }

        const typedEntries = rawEntries as [string, [string, string[]][]][];

        for (const [, streamEntries] of typedEntries) {
          const tasks = streamEntries.map(([messageId, fields]) =>
            this.trackInFlight(this.handleStreamMessage(messageId, fields))
          );
          await Promise.all(tasks);
        }
      } catch (error: unknown) {
        this.logger.error({ error }, 'Error in event consumer poll loop');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  // --------------------------------------------------------------------------
  // In-flight tracking
  // --------------------------------------------------------------------------

  private trackInFlight(promise: Promise<void>): Promise<void> {
    const tracked = promise.finally(() => {
      this.inFlight.delete(tracked);
    });
    this.inFlight.add(tracked);
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
  // Message handling
  // --------------------------------------------------------------------------

  private async handleStreamMessage(messageId: string, fields: string[]): Promise<void> {
    const eventJson = this.getFieldValue(fields, 'event');
    if (eventJson === null) {
      this.logger.warn({ messageId }, 'Stream message missing "event" field — acknowledging');
      await this.acknowledge(messageId);
      return;
    }

    try {
      const envelope = JSON.parse(eventJson) as IStreamEventEnvelope;
      const handled = await this.handleEvent(envelope);

      if (handled) {
        await this.acknowledge(messageId);
      }
    } catch (error: unknown) {
      this.logger.error({ error, messageId }, 'Failed to process stream message');
      await this.handleProcessingFailure(messageId, eventJson, error);
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

    if (nextAttempt >= this.config.maxProcessAttempts) {
      // Max retries exhausted — dead-letter
      const deadLetterEnvelope: IStreamEventEnvelope = {
        ...parsedEnvelope,
        metadata: {
          ...parsedEnvelope.metadata,
          noemaProcessingAttempts: nextAttempt,
          noemaLastError: errorMessage,
          noemaDeadLetteredAt: new Date().toISOString(),
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

    // Exponential backoff, capped at 30 s
    const backoffMs = Math.min(this.config.retryBaseDelayMs * 2 ** (nextAttempt - 1), 30_000);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));

    // Re-enqueue with updated attempt metadata
    const metadata: IStreamEventEnvelope['metadata'] & IProcessingMetadata = {
      ...parsedEnvelope.metadata,
      noemaProcessingAttempts: nextAttempt,
      noemaLastError: errorMessage,
    };

    await this.redis.xadd(
      this.config.sourceStreamKey,
      '*',
      'event',
      JSON.stringify({ ...parsedEnvelope, metadata })
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
        _raw: eventJson,
        _error: errorMessage,
        _deadLetteredAt: new Date().toISOString(),
      })
    );
    await this.acknowledge(messageId);
    this.logger.warn({ messageId }, 'Moved unparseable message to dead-letter');
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

  private safeParseEnvelope(eventJson: string): IStreamEventEnvelope | null {
    try {
      return JSON.parse(eventJson) as IStreamEventEnvelope;
    } catch {
      return null;
    }
  }

  private readAttempts(metadata: IStreamEventEnvelope['metadata']): number {
    if ('noemaProcessingAttempts' in metadata) {
      const value = (metadata as unknown as IProcessingMetadata).noemaProcessingAttempts;
      if (typeof value === 'number') {
        return value;
      }
    }
    return 0;
  }
}
