import type { Logger } from 'pino';

import type { IOutboxRepository } from '../../domain/session-service/outbox.repository.js';
import type { IEventPublisher } from '../../domain/shared/event-publisher.js';

export interface ISessionOutboxWorkerConfig {
  pollIntervalMs: number;
  batchSize: number;
}

const DEFAULT_CONFIG: ISessionOutboxWorkerConfig = {
  pollIntervalMs: 2000,
  batchSize: 100,
};

export class SessionOutboxWorker {
  private readonly logger: Logger;
  private readonly config: ISessionOutboxWorkerConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

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
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    await this.drainOnce();
    this.timer = setInterval(() => {
      void this.drainOnce();
    }, this.config.pollIntervalMs);

    this.logger.info({ config: this.config }, 'Session outbox worker started');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.info('Session outbox worker stopped');
  }

  async drainOnce(): Promise<void> {
    if (!this.running) {
      return;
    }

    const events = await this.outboxRepository.listPending(this.config.batchSize);
    if (events.length === 0) {
      return;
    }

    for (const event of events) {
      try {
        await this.eventPublisher.publish({
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload,
          metadata: event.metadata,
        });
        await this.outboxRepository.markPublished(event.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown publish error';
        await this.outboxRepository.markFailed(event.id, message);
        this.logger.warn(
          {
            outboxEventId: event.id,
            eventType: event.eventType,
            attempts: event.attempts + 1,
            error: message,
          },
          'Failed to publish outbox event'
        );
      }
    }
  }
}
