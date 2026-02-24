import type { EventId } from '@noema/types';
import type { Prisma, PrismaClient } from '../../../generated/prisma/index.js';
import type {
  IOutboxEventInput,
  IOutboxEventRecord,
  IOutboxRepository,
} from '../../domain/session-service/outbox.repository.js';

function toOutboxDomain(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any
): IOutboxEventRecord {
  return {
    id: row.id as EventId,
    eventType: row.eventType,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    payload: row.payload,
    metadata: row.metadata,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    attempts: row.attempts,
    lastError: row.lastError ?? null,
    claimOwner: row.claimOwner ?? null,
    claimUntil: row.claimUntil?.toISOString() ?? null,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class PrismaOutboxRepository implements IOutboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private db(tx?: Prisma.TransactionClient): PrismaClient | Prisma.TransactionClient {
    return tx ?? this.prisma;
  }

  async enqueue(event: IOutboxEventInput, tx?: Prisma.TransactionClient): Promise<IOutboxEventRecord> {
    const row = await this.db(tx).eventOutbox.create({
      data: {
        id: event.id,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload as object,
        metadata: event.metadata as object,
      },
    });

    return toOutboxDomain(row);
  }

  async enqueueBatch(events: IOutboxEventInput[], tx?: Prisma.TransactionClient): Promise<void> {
    if (events.length === 0) {
      return;
    }

    await this.db(tx).eventOutbox.createMany({
      data: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload as object,
        metadata: event.metadata as object,
      })),
    });
  }

  async listPending(limit: number): Promise<IOutboxEventRecord[]> {
    const rows = await this.prisma.eventOutbox.findMany({
      where: {
        publishedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return rows.map(toOutboxDomain);
  }

  async claimPending(
    limit: number,
    claimOwner: string,
    leaseMs: number,
    maxAttempts: number,
    now: Date = new Date()
  ): Promise<IOutboxEventRecord[]> {
    const claimUntil = new Date(now.getTime() + leaseMs);

    const rows = await this.prisma.$transaction(async (tx) => {
      return tx.$queryRaw<
        Array<{
          id: string;
          eventType: string;
          aggregateType: string;
          aggregateId: string;
          payload: unknown;
          metadata: unknown;
          publishedAt: Date | null;
          attempts: number;
          lastError: string | null;
          claimOwner: string | null;
          claimUntil: Date | null;
          nextAttemptAt: Date | null;
          createdAt: Date;
          updatedAt: Date;
        }>
      >`
        WITH candidates AS (
          SELECT eo.id
          FROM event_outbox eo
          WHERE eo.published_at IS NULL
            AND eo.attempts < ${maxAttempts}
            AND (eo.next_attempt_at IS NULL OR eo.next_attempt_at <= ${now})
            AND (eo.claim_until IS NULL OR eo.claim_until <= ${now})
          ORDER BY eo.created_at ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE event_outbox eo
        SET
          claim_owner = ${claimOwner},
          claim_until = ${claimUntil},
          updated_at = NOW()
        FROM candidates c
        WHERE eo.id = c.id
        RETURNING
          eo.id,
          eo.event_type AS "eventType",
          eo.aggregate_type AS "aggregateType",
          eo.aggregate_id AS "aggregateId",
          eo.payload,
          eo.metadata,
          eo.published_at AS "publishedAt",
          eo.attempts,
          eo.last_error AS "lastError",
          eo.claim_owner AS "claimOwner",
          eo.claim_until AS "claimUntil",
          eo.next_attempt_at AS "nextAttemptAt",
          eo.created_at AS "createdAt",
          eo.updated_at AS "updatedAt"
      `;
    });

    return rows.map(toOutboxDomain);
  }

  async releaseClaims(claimOwner: string): Promise<number> {
    const result = await this.prisma.eventOutbox.updateMany({
      where: {
        claimOwner,
        publishedAt: null,
      },
      data: {
        claimOwner: null,
        claimUntil: null,
      },
    });

    return result.count;
  }

  async markPublished(id: EventId, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).eventOutbox.update({
      where: { id },
      data: {
        publishedAt: new Date(),
        lastError: null,
        claimOwner: null,
        claimUntil: null,
        nextAttemptAt: null,
      },
    });
  }

  async markPublishedClaimed(id: EventId, claimOwner: string): Promise<void> {
    const result = await this.prisma.eventOutbox.updateMany({
      where: {
        id,
        claimOwner,
        publishedAt: null,
      },
      data: {
        publishedAt: new Date(),
        lastError: null,
        claimOwner: null,
        claimUntil: null,
        nextAttemptAt: null,
      },
    });

    if (result.count !== 1) {
      throw new Error(`Failed to mark claimed outbox event ${id} as published`);
    }
  }

  async markFailed(
    id: EventId,
    errorMessage: string,
    tx?: Prisma.TransactionClient,
    nextAttemptAt?: Date | null
  ): Promise<void> {
    await this.db(tx).eventOutbox.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        lastError: errorMessage.slice(0, 1000),
        claimOwner: null,
        claimUntil: null,
        ...(nextAttemptAt !== undefined ? { nextAttemptAt } : {}),
      },
    });
  }

  async markFailedClaimed(
    id: EventId,
    claimOwner: string,
    errorMessage: string,
    nextAttemptAt: Date
  ): Promise<void> {
    const result = await this.prisma.eventOutbox.updateMany({
      where: {
        id,
        claimOwner,
        publishedAt: null,
      },
      data: {
        attempts: { increment: 1 },
        lastError: errorMessage.slice(0, 1000),
        nextAttemptAt,
        claimOwner: null,
        claimUntil: null,
      },
    });

    if (result.count !== 1) {
      throw new Error(`Failed to mark claimed outbox event ${id} as failed`);
    }
  }

  async markDeadLettered(
    id: EventId,
    claimOwner: string,
    errorMessage: string,
  ): Promise<void> {
    const result = await this.prisma.eventOutbox.updateMany({
      where: {
        id,
        claimOwner,
        publishedAt: null,
      },
      data: {
        attempts: { increment: 1 },
        lastError: `DEAD_LETTERED: ${errorMessage}`.slice(0, 1000),
        nextAttemptAt: null,
        claimOwner: null,
        claimUntil: null,
      },
    });

    if (result.count !== 1) {
      throw new Error(`Failed to dead-letter outbox event ${id}`);
    }
  }
}
