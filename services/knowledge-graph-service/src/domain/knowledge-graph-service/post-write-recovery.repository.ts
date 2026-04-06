import type { Metadata, UserId } from '@noema/types';

export const PkgPostWriteTaskType = {
  APPEND_OPERATION: 'append_operation',
  PUBLISH_EVENT: 'publish_event',
  MARK_METRICS_STALE: 'mark_metrics_stale',
} as const;

export type PkgPostWriteTaskType = (typeof PkgPostWriteTaskType)[keyof typeof PkgPostWriteTaskType];

export const PkgPostWriteTaskStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  RETRYABLE: 'retryable',
  FAILED: 'failed',
} as const;

export type PkgPostWriteTaskStatus =
  (typeof PkgPostWriteTaskStatus)[keyof typeof PkgPostWriteTaskStatus];

export interface IPkgPostWriteTask {
  readonly id: string;
  readonly taskType: PkgPostWriteTaskType;
  readonly status: PkgPostWriteTaskStatus;
  readonly userId: UserId | null;
  readonly dedupeKey: string | null;
  readonly payload: Metadata;
  readonly attempts: number;
  readonly nextAttemptAt: string;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IPkgPostWriteRecoveryRepository {
  enqueueTask(input: {
    taskType: PkgPostWriteTaskType;
    payload: Metadata;
    userId?: UserId;
    dedupeKey?: string;
    nextAttemptAt?: string;
  }): Promise<void>;

  claimDueTasks(limit: number): Promise<readonly IPkgPostWriteTask[]>;

  completeTask(taskId: string): Promise<void>;

  rescheduleTask(input: {
    taskId: string;
    lastError: string;
    nextAttemptAt: string;
  }): Promise<void>;

  failTask(input: { taskId: string; lastError: string }): Promise<void>;
}
