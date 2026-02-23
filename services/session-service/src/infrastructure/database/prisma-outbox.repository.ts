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

  async markPublished(id: EventId, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).eventOutbox.update({
      where: { id },
      data: {
        publishedAt: new Date(),
        lastError: null,
      },
    });
  }

  async markFailed(id: EventId, errorMessage: string, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).eventOutbox.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        lastError: errorMessage.slice(0, 1000),
      },
    });
  }
}
