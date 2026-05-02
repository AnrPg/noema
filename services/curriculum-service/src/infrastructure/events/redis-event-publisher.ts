/* eslint-disable @typescript-eslint/naming-convention */
import type { Redis } from 'ioredis';
import type pino from 'pino';

export interface CurriculumEventPublisher {
  publish(eventType: string, payload: Record<string, unknown>): Promise<void>;
}

export class RedisCurriculumEventPublisher implements CurriculumEventPublisher {
  constructor(
    private readonly redis: Redis,
    private readonly stream: string,
    private readonly logger: pino.Logger
  ) {}

  async publish(eventType: string, payload: Record<string, unknown>): Promise<void> {
    await this.redis.xadd(
      this.stream,
      '*',
      'eventType',
      eventType,
      'payload',
      JSON.stringify(payload)
    );
    this.logger.debug({ eventType }, 'Published curriculum event');
  }
}
