import type { Logger } from 'pino';

import type { IOutboxRepository } from '../../domain/session-service/outbox.repository.js';
import type { IEventPublisher } from '../../domain/shared/event-publisher.js';

export interface ISessionOutboxWorkerConfig {
  pollIntervalMs: number;
  batchSize: number;
  leaseMs: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  drainTimeoutMs: number;
  workerId?: string;
}

const DEFAULT_CONFIG: ISessionOutboxWorkerConfig = {
  pollIntervalMs: 2000,
  batchSize: 100,
  leaseMs: 10_000,
  maxAttempts: 10,
  retryBaseDelayMs: 1_000,
  retryMaxDelayMs: 60_000,
  drainTimeoutMs: 15_000,
};

export class SessionOutboxWorker {
  private readonly logger: Logger;
  private readonly config: ISessionOutboxWorkerConfig;
  private readonly workerId: string;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private draining = false;
  private readonly activeDrains = new Set<Promise<void>>();

  constructor(
    private readonly outboxRepository: IOutboxRepository,
    private readonly eventPublisher: IEventPublisher,
    logger: Logger,
    config?: Partial<ISessionOutboxWorkerConfig>
  ) {
    this.logger = logger.child({ component: 'SessionOutboxWorker' });
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.workerId =
      this.config.workerId ??
      `session-outbox-worker-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.timer = setInterval(() => {
      this.scheduleDrain();
    }, this.config.pollIntervalMs);
    this.scheduleDrain();

    this.logger.info(
      {
        config: this.config,
        workerId: this.workerId,
      },
      'Session outbox worker started'
    );
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const stopStartedAt = Date.now();
    const active = Array.from(this.activeDrains);
    if (active.length > 0) {
      await Promise.race([
        Promise.allSettled(active),
        new Promise((resolve) => setTimeout(resolve, this.config.drainTimeoutMs)),
      ]);
    }

    const releasedClaims = await this.outboxRepository.releaseClaims(this.workerId);

    this.logger.info(
      {
        workerId: this.workerId,
        releasedClaims,
        drainMs: Date.now() - stopStartedAt,
        drainTimeoutMs: this.config.drainTimeoutMs,
      },
      'Session outbox worker stopped'
    );
  }

  private scheduleDrain(): void {
    if (!this.running || this.draining) {
      return;
    }

    const drainPromise = this.drainOnce().finally(() => {
      this.activeDrains.delete(drainPromise);
    });

    this.activeDrains.add(drainPromise);
  }

  async drainOnce(): Promise<void> {
    if (!this.running || this.draining) {
      return;
    }

    this.draining = true;

    try {
      const events = await this.outboxRepository.claimPending(
        this.config.batchSize,
        this.workerId,
        this.config.leaseMs,
        this.config.maxAttempts
      );
      if (events.length === 0) {
        return;
      }

      this.logger.debug(
        {
          workerId: this.workerId,
          count: events.length,
        },
        'Session outbox events claimed'
      );

      for (const event of events) {
        try {
          await this.eventPublisher.publish({
            eventType: event.eventType,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            payload: event.payload,
            metadata: event.metadata,
          });
          try {
            await this.outboxRepository.markPublishedClaimed(event.id, this.workerId);
          } catch (claimError) {
            if (!this.running) {
              // Worker is stopping — claims may have been released during drain
              // timeout. Fall back to unclaimed mark to still record success.
              await this.outboxRepository.markPublished(event.id);
              this.logger.warn(
                {
                  outboxEventId: event.id,
                  eventType: event.eventType,
                  workerId: this.workerId,
                },
                'Claim lost during drain; marked published via fallback'
              );
            } else {
              throw claimError;
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown publish error';
          const newAttemptCount = event.attempts + 1;
          const isExhausted = newAttemptCount >= this.config.maxAttempts;

          if (isExhausted) {
            await this.outboxRepository.markDeadLettered(
              event.id,
              this.workerId,
              message
            );

            this.logger.error(
              {
                outboxEventId: event.id,
                eventType: event.eventType,
                aggregateId: event.aggregateId,
                attempts: newAttemptCount,
                maxAttempts: this.config.maxAttempts,
                workerId: this.workerId,
                error: message,
              },
              'Outbox event dead-lettered after exhausting all retry attempts'
            );
          } else {
            const nextAttemptAt = new Date(
              Date.now() + this.computeRetryDelayMs(newAttemptCount)
            );

            await this.outboxRepository.markFailedClaimed(
              event.id,
              this.workerId,
              message,
              nextAttemptAt
            );

            this.logger.warn(
              {
                outboxEventId: event.id,
                eventType: event.eventType,
                attempts: newAttemptCount,
                maxAttempts: this.config.maxAttempts,
                nextAttemptAt: nextAttemptAt.toISOString(),
                workerId: this.workerId,
                error: message,
              },
              'Failed to publish outbox event'
            );
          }
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private computeRetryDelayMs(nextAttemptNumber: number): number {
    const exponent = Math.max(0, nextAttemptNumber - 1);
    const delay = this.config.retryBaseDelayMs * 2 ** exponent;
    const capped = Math.min(delay, this.config.retryMaxDelayMs);
    const jitter = 0.5 + Math.random() * 0.5;
    return Math.round(capped * jitter);
  }
}
