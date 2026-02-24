import type { CorrelationId, EventId, UserId } from '@noema/types';
import type { Prisma } from '../../../generated/prisma/index.js';

export interface IOutboxEventRecord {
  id: EventId;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  metadata: {
    correlationId: CorrelationId;
    userId?: UserId | null;
    causationId?: string;
  };
  publishedAt: string | null;
  attempts: number;
  lastError: string | null;
  claimOwner: string | null;
  claimUntil: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IOutboxEventInput {
  id: EventId;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  metadata: {
    correlationId: CorrelationId;
    userId?: UserId | null;
    causationId?: string;
  };
}

export interface IOutboxRepository {
  enqueue(event: IOutboxEventInput, tx?: Prisma.TransactionClient): Promise<IOutboxEventRecord>;
  enqueueBatch(events: IOutboxEventInput[], tx?: Prisma.TransactionClient): Promise<void>;
  listPending(limit: number): Promise<IOutboxEventRecord[]>;
  claimPending(
    limit: number,
    claimOwner: string,
    leaseMs: number,
    maxAttempts: number,
    now?: Date
  ): Promise<IOutboxEventRecord[]>;
  releaseClaims(claimOwner: string): Promise<number>;
  markPublished(id: EventId, tx?: Prisma.TransactionClient): Promise<void>;
  markPublishedClaimed(id: EventId, claimOwner: string): Promise<void>;
  markFailed(
    id: EventId,
    errorMessage: string,
    tx?: Prisma.TransactionClient,
    nextAttemptAt?: Date | null
  ): Promise<void>;
  markFailedClaimed(
    id: EventId,
    claimOwner: string,
    errorMessage: string,
    nextAttemptAt: Date,
  ): Promise<void>;
  markDeadLettered(
    id: EventId,
    claimOwner: string,
    errorMessage: string,
  ): Promise<void>;
}
