import { createHash } from 'node:crypto';
import type { Metadata, UserId } from '@noema/types';
import type { Logger } from 'pino';

import type { IEventToPublish } from '../shared/event-publisher.js';
import type { IEventPublisher } from '../shared/event-publisher.js';
import type { IMetricsStalenessRepository } from './metrics-staleness.repository.js';
import type { IPkgOperationLogRepository } from './pkg-operation-log.repository.js';
import {
  type IPkgPostWriteRecoveryRepository,
  type IPkgPostWriteTask,
  PkgPostWriteTaskType,
} from './post-write-recovery.repository.js';
import type { PkgOperation } from './value-objects/operation-log.js';

export interface IPkgPostWriteRecoveryService {
  enqueueAppendOperation(userId: UserId, operation: PkgOperation): Promise<void>;
  enqueuePublish(event: IEventToPublish): Promise<void>;
  enqueueMetricsStale(userId: UserId, domain: string, mutationType: string): Promise<void>;
}

export class PkgPostWriteRecoveryService implements IPkgPostWriteRecoveryService {
  private readonly logger: Logger;
  private timer: NodeJS.Timeout | null = null;
  private drainPromise: Promise<void> | null = null;
  private readonly options: {
    intervalMs: number;
    batchSize: number;
    maxAttempts: number;
    retryBaseDelayMs: number;
  };

  constructor(
    private readonly repository: IPkgPostWriteRecoveryRepository,
    private readonly operationLogRepository: IPkgOperationLogRepository,
    private readonly metricsStalenessRepository: IMetricsStalenessRepository,
    private readonly eventPublisher: IEventPublisher,
    options: {
      intervalMs: number;
      batchSize: number;
      maxAttempts: number;
      retryBaseDelayMs: number;
    },
    logger: Logger
  ) {
    this.options = options;
    this.logger = logger.child({ service: 'PkgPostWriteRecoveryService' });
  }

  async enqueueAppendOperation(userId: UserId, operation: PkgOperation): Promise<void> {
    await this.repository.enqueueTask({
      taskType: PkgPostWriteTaskType.APPEND_OPERATION,
      userId,
      dedupeKey: buildAppendOperationDedupeKey(userId, operation),
      payload: {
        userId,
        operation: operation as unknown as Metadata[string],
      },
    });
  }

  async enqueuePublish(event: IEventToPublish): Promise<void> {
    await this.repository.enqueueTask({
      taskType: PkgPostWriteTaskType.PUBLISH_EVENT,
      dedupeKey: buildPublishDedupeKey(event),
      payload: {
        event: event as unknown as Metadata[string],
      },
    });
  }

  async enqueueMetricsStale(userId: UserId, domain: string, mutationType: string): Promise<void> {
    await this.repository.enqueueTask({
      taskType: PkgPostWriteTaskType.MARK_METRICS_STALE,
      userId,
      dedupeKey: `metrics:${userId}:${domain}:${mutationType}`,
      payload: {
        userId,
        domain,
        mutationType,
      },
    });
  }

  start(): void {
    if (this.timer !== null) {
      return;
    }

    this.timer = setInterval(() => {
      void this.flushDueTasks();
    }, this.options.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async drain(): Promise<void> {
    await this.flushDueTasks();
    if (this.drainPromise !== null) {
      await this.drainPromise;
    }
  }

  async flushDueTasks(): Promise<void> {
    if (this.drainPromise !== null) {
      await this.drainPromise;
      return;
    }

    this.drainPromise = this.runDrainBatch();
    try {
      await this.drainPromise;
    } finally {
      this.drainPromise = null;
    }
  }

  private async runDrainBatch(): Promise<void> {
    const tasks = await this.repository.claimDueTasks(this.options.batchSize);
    if (tasks.length === 0) {
      return;
    }

    for (const task of tasks) {
      try {
        await this.executeTask(task);
        await this.repository.completeTask(task.id);
      } catch (error) {
        const lastError = error instanceof Error ? error.message : String(error);
        if (task.attempts >= this.options.maxAttempts) {
          await this.repository.failTask({ taskId: task.id, lastError });
          this.logger.error(
            { taskId: task.id, taskType: task.taskType, lastError },
            'Post-write task permanently failed'
          );
          continue;
        }

        const nextAttemptAt = new Date(
          Date.now() + this.options.retryBaseDelayMs * 2 ** Math.max(task.attempts - 1, 0)
        ).toISOString();
        await this.repository.rescheduleTask({
          taskId: task.id,
          lastError,
          nextAttemptAt,
        });
        this.logger.warn(
          { taskId: task.id, taskType: task.taskType, attempts: task.attempts, lastError },
          'Post-write task deferred for retry'
        );
      }
    }
  }

  private async executeTask(task: IPkgPostWriteTask): Promise<void> {
    switch (task.taskType) {
      case PkgPostWriteTaskType.APPEND_OPERATION: {
        const userId = task.payload['userId'] as UserId;
        const operation = task.payload['operation'] as unknown as PkgOperation;
        await this.operationLogRepository.appendOperation(userId, operation);
        return;
      }
      case PkgPostWriteTaskType.PUBLISH_EVENT: {
        const event = task.payload['event'] as unknown as IEventToPublish;
        await this.eventPublisher.publish(event);
        return;
      }
      case PkgPostWriteTaskType.MARK_METRICS_STALE: {
        const userId = task.payload['userId'] as UserId;
        const domain = typeof task.payload['domain'] === 'string' ? task.payload['domain'] : '';
        const mutationType =
          typeof task.payload['mutationType'] === 'string' ? task.payload['mutationType'] : '';
        await this.metricsStalenessRepository.markStale(userId, domain, mutationType);
        return;
      }
      default: {
        const unsupportedTaskType: never = task.taskType;
        throw new Error(`Unsupported post-write task type: ${String(unsupportedTaskType)}`);
      }
    }
  }
}

function buildAppendOperationDedupeKey(userId: UserId, operation: PkgOperation): string {
  // Recovery queue dedupe must track the write intent itself rather than the
  // repository-assigned sequence number, because failed appends are queued
  // before the durable operation log assigns that sequence number.
  const operationFingerprint = createHash('sha256').update(JSON.stringify(operation)).digest('hex');
  return `op:${userId}:${operation.operationType}:${operationFingerprint}`;
}

function buildPublishDedupeKey(event: IEventToPublish): string {
  const correlationId = event.metadata.correlationId;
  const causationId = event.metadata.causationId ?? 'no-causation';
  return `event:${event.eventType}:${event.aggregateId}:${correlationId}:${causationId}`;
}
