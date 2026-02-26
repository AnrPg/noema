/**
 * Scheduler Event Consumer — Facade
 *
 * Thin orchestrator that instantiates and manages the per-stream concrete
 * consumers introduced in the BaseEventConsumer decomposition (ADR-0039).
 * Preserves the original constructor signature so that `src/index.ts` and
 * existing tests require zero changes.
 *
 * @see consumers/base-consumer.ts          — abstract lifecycle & reliability
 * @see consumers/session-started.consumer  — session.started
 * @see consumers/review-recorded.consumer  — attempt.recorded / review.submitted
 * @see consumers/content-seeded.consumer   — content.seeded
 * @see consumers/session-cohort.consumer   — session.cohort.*
 */

import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import {
  ContentSeededConsumer,
  ReviewRecordedConsumer,
  SessionCohortConsumer,
  SessionStartedConsumer,
} from './consumers/index.js';
import type {
  ISchedulerEventConsumerConfig,
  ISchedulerEventConsumerDependencies,
} from './consumers/base-consumer.js';

export type { ISchedulerEventConsumerConfig, ISchedulerEventConsumerDependencies };

export class SchedulerEventConsumer {
  private readonly consumers: { start(): Promise<void>; stop(): Promise<void> }[];

  constructor(
    redis: Redis,
    config: ISchedulerEventConsumerConfig,
    dependencies: ISchedulerEventConsumerDependencies,
    logger: Logger,
  ) {
    this.consumers = [
      new SessionStartedConsumer(redis, config, dependencies, logger),
      new ReviewRecordedConsumer(redis, config, dependencies, logger),
      new ContentSeededConsumer(redis, config, dependencies, logger),
      new SessionCohortConsumer(redis, config, dependencies, logger),
    ];
  }

  async start(): Promise<void> {
    await Promise.all(this.consumers.map((c) => c.start()));
  }

  async stop(): Promise<void> {
    await Promise.all(this.consumers.map((c) => c.stop()));
  }
}
