/**
 * @noema/knowledge-graph-service — Prisma PKG Operation Log Repository
 *
 * Concrete IPkgOperationLogRepository backed by PostgreSQL via Prisma.
 * Append-only changelog of all PKG mutations for undo/redo, aggregation
 * pipeline input, and offline sync reconciliation.
 */

import type { EdgeId, IPaginatedResponse, NodeId, UserId } from '@noema/types';
import { nanoid } from 'nanoid';
import type { Prisma, PrismaClient } from '../../../../generated/prisma/index.js';

import type {
  IPkgOperationLogEntry,
  IPkgOperationLogRepository,
} from '../../../domain/knowledge-graph-service/pkg-operation-log.repository.js';
import type {
  PkgOperation,
  PkgOperationType,
} from '../../../domain/knowledge-graph-service/value-objects/operation-log.js';

// ============================================================================
// Helpers
// ============================================================================

function generateLogId(): string {
  return `oplog_${nanoid()}`;
}

/**
 * Extract affected node and edge IDs from a PkgOperation for indexed lookups.
 */
function extractAffectedIds(operation: PkgOperation): {
  nodeIds: string[];
  edgeIds: string[];
} {
  const nodeIds: string[] = [];
  const edgeIds: string[] = [];

  switch (operation.operationType) {
    case 'PkgNodeCreated':
    case 'PkgNodeUpdated':
    case 'PkgNodeDeleted':
      nodeIds.push(operation.nodeId as string);
      break;
    case 'PkgEdgeCreated':
      edgeIds.push(operation.edgeId as string);
      nodeIds.push(operation.sourceNodeId as string, operation.targetNodeId as string);
      break;
    case 'PkgEdgeDeleted':
      edgeIds.push(operation.edgeId as string);
      break;
    case 'PkgBatchImport':
      for (const sub of operation.subOperations) {
        const subIds = extractAffectedIds(sub as PkgOperation);
        nodeIds.push(...subIds.nodeIds);
        edgeIds.push(...subIds.edgeIds);
      }
      break;
  }

  return { nodeIds, edgeIds };
}

// ============================================================================
// PrismaOperationLogRepository
// ============================================================================

export class PrismaOperationLogRepository implements IPkgOperationLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async appendOperation(userId: UserId, operation: PkgOperation): Promise<IPkgOperationLogEntry> {
    const id = generateLogId();
    const { nodeIds, edgeIds } = extractAffectedIds(operation);

    // Get next sequence number for this user (atomic via serializable transaction)
    const record = await this.prisma.$transaction(async (tx) => {
      // Find current max sequence number for this user
      const latest = await tx.pkgOperationLog.findFirst({
        where: { userId: userId as string },
        orderBy: { sequenceNumber: 'desc' },
        select: { sequenceNumber: true },
      });

      const nextSeq = (latest?.sequenceNumber ?? 0) + 1;

      return tx.pkgOperationLog.create({
        data: {
          id,
          userId: userId as string,
          sequenceNumber: nextSeq,
          operationType: operation.operationType,
          operation: operation as unknown as Prisma.JsonObject,
          affectedNodeIds: nodeIds,
          affectedEdgeIds: edgeIds,
        },
      });
    }, { isolationLevel: 'Serializable' });

    return this.toDomain(record);
  }

  async getOperationHistory(
    userId: UserId,
    limit: number,
    offset: number
  ): Promise<IPaginatedResponse<IPkgOperationLogEntry>> {
    const [records, total] = await this.prisma.$transaction([
      this.prisma.pkgOperationLog.findMany({
        where: { userId: userId as string },
        orderBy: { sequenceNumber: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.pkgOperationLog.count({
        where: { userId: userId as string },
      }),
    ]);

    return {
      items: records.map((r) => this.toDomain(r)),
      total,
      hasMore: offset + limit < total,
    };
  }

  async getOperationsSince(userId: UserId, since: string): Promise<IPkgOperationLogEntry[]> {
    const records = await this.prisma.pkgOperationLog.findMany({
      where: {
        userId: userId as string,
        createdAt: { gte: new Date(since) },
      },
      orderBy: { sequenceNumber: 'asc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async getOperationsByType(
    userId: UserId,
    operationType: PkgOperationType,
    limit: number,
    offset: number
  ): Promise<IPaginatedResponse<IPkgOperationLogEntry>> {
    const where = {
      userId: userId as string,
      operationType: operationType as string,
    };

    const [records, total] = await this.prisma.$transaction([
      this.prisma.pkgOperationLog.findMany({
        where,
        orderBy: { sequenceNumber: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.pkgOperationLog.count({ where }),
    ]);

    return {
      items: records.map((r) => this.toDomain(r)),
      total,
      hasMore: offset + limit < total,
    };
  }

  async getOperationsForNode(userId: UserId, nodeId: NodeId): Promise<IPkgOperationLogEntry[]> {
    const records = await this.prisma.pkgOperationLog.findMany({
      where: {
        userId: userId as string,
        affectedNodeIds: { has: nodeId as string },
      },
      orderBy: { sequenceNumber: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async getOperationsForEdge(userId: UserId, edgeId: EdgeId): Promise<IPkgOperationLogEntry[]> {
    const records = await this.prisma.pkgOperationLog.findMany({
      where: {
        userId: userId as string,
        affectedEdgeIds: { has: edgeId as string },
      },
      orderBy: { sequenceNumber: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async countOperations(
    userId: UserId,
    filters?: { operationType?: PkgOperationType }
  ): Promise<number> {
    const where: Record<string, unknown> = {
      userId: userId as string,
    };

    if (filters?.operationType !== undefined) {
      where['operationType'] = filters.operationType as string;
    }

    return this.prisma.pkgOperationLog.count({ where });
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private toDomain(record: {
    id: string;
    userId: string;
    operation: Prisma.JsonValue;
    createdAt: Date;
  }): IPkgOperationLogEntry {
    return {
      id: record.id,
      userId: record.userId as UserId,
      operation: record.operation as unknown as PkgOperation,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
