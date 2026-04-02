import type { IPaginatedResponse, UserId } from '@noema/types';
import { nanoid } from 'nanoid';
import type { Prisma, PrismaClient } from '../../../../generated/prisma/index.js';

import type {
  ICreateGraphSnapshotInput,
  IGraphSnapshotListFilters,
  IGraphSnapshotRecord,
  IGraphSnapshotRepository,
} from '../../../domain/knowledge-graph-service/graph-snapshot.repository.js';
import { fromPrismaJson, toPrismaJson } from './prisma-json.helpers.js';

function generateSnapshotId(): string {
  return `gsnap_${nanoid()}`;
}

export class PrismaGraphSnapshotRepository implements IGraphSnapshotRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createSnapshot(input: ICreateGraphSnapshotInput): Promise<IGraphSnapshotRecord> {
    const record = await this.prisma.graphSnapshot.create({
      data: {
        id: generateSnapshotId(),
        graphType: input.graphType,
        scopeUserId: input.scope.graphType === 'pkg' ? (input.scope.userId as string) : null,
        scopeDomain: input.scope.domain ?? null,
        nodeCount: input.nodeCount,
        edgeCount: input.edgeCount,
        schemaVersion: input.schemaVersion,
        snapshotData: toPrismaJson(input.payload),
        reason: input.reason ?? null,
        sourceCursor: input.sourceCursor ?? null,
        createdBy: input.createdBy ?? null,
      },
    });

    return this.toDomain(record);
  }

  async getSnapshot(snapshotId: string): Promise<IGraphSnapshotRecord | null> {
    const record = await this.prisma.graphSnapshot.findUnique({
      where: { id: snapshotId },
    });

    return record === null ? null : this.toDomain(record);
  }

  async listSnapshots(
    filters: IGraphSnapshotListFilters,
    limit: number,
    offset: number
  ): Promise<IPaginatedResponse<IGraphSnapshotRecord>> {
    const where: Prisma.GraphSnapshotWhereInput = {
      ...(filters.graphType !== undefined ? { graphType: filters.graphType } : {}),
      ...(filters.userId !== undefined ? { scopeUserId: filters.userId as string } : {}),
      ...(filters.domain !== undefined ? { scopeDomain: filters.domain } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.graphSnapshot.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.graphSnapshot.count({ where }),
    ]);

    return {
      items: items.map((record) => this.toDomain(record)),
      total,
      hasMore: offset + items.length < total,
    };
  }

  private toDomain(record: {
    id: string;
    graphType: string;
    scopeUserId: string | null;
    scopeDomain: string | null;
    nodeCount: number;
    edgeCount: number;
    schemaVersion: number;
    snapshotData: Prisma.JsonValue;
    reason: string | null;
    sourceCursor: string | null;
    createdAt: Date;
    createdBy: string | null;
  }): IGraphSnapshotRecord {
    const payload = fromPrismaJson<IGraphSnapshotRecord['payload']>(record.snapshotData);
    const scope =
      record.graphType === 'pkg'
        ? {
            graphType: 'pkg' as const,
            userId: record.scopeUserId as UserId,
            ...(record.scopeDomain !== null ? { domain: record.scopeDomain } : {}),
          }
        : {
            graphType: 'ckg' as const,
            ...(record.scopeDomain !== null ? { domain: record.scopeDomain } : {}),
          };

    return {
      snapshotId: record.id,
      graphType: record.graphType === 'ckg' ? 'ckg' : 'pkg',
      scope,
      nodeCount: record.nodeCount,
      edgeCount: record.edgeCount,
      schemaVersion: record.schemaVersion,
      reason: record.reason,
      createdAt: record.createdAt.toISOString(),
      createdBy: record.createdBy,
      sourceCursor: record.sourceCursor,
      payload,
    };
  }
}
