/**
 * @noema/knowledge-graph-service — Prisma Metrics Repository
 *
 * Concrete IMetricsRepository backed by PostgreSQL via Prisma.
 * Stores structural metric snapshots for trend analysis and agent reasoning.
 */

import type { IStructuralMetrics, UserId } from '@noema/types';
import { nanoid } from 'nanoid';
import type { Prisma, PrismaClient } from '../../../../generated/prisma/index.js';

import type {
  IMetricSnapshot,
  IMetricsHistoryOptions,
  IMetricsRepository,
} from '../../../domain/knowledge-graph-service/metrics.repository.js';

// ============================================================================
// PrismaMetricsRepository
// ============================================================================

export class PrismaMetricsRepository implements IMetricsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveSnapshot(
    userId: UserId,
    domain: string,
    metrics: IStructuralMetrics
  ): Promise<IMetricSnapshot> {
    const id = `snap_${nanoid()}`;

    const record = await this.prisma.structuralMetricSnapshot.create({
      data: {
        id,
        userId: userId as string,
        domain,
        metrics: metrics as unknown as Prisma.JsonObject,
      },
    });

    return this.toDomain(record);
  }

  async getLatestSnapshot(userId: UserId, domain: string): Promise<IMetricSnapshot | null> {
    const record = await this.prisma.structuralMetricSnapshot.findFirst({
      where: {
        userId: userId as string,
        domain,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) return null;
    return this.toDomain(record);
  }

  async getSnapshotHistory(
    userId: UserId,
    domain: string,
    options?: IMetricsHistoryOptions
  ): Promise<IMetricSnapshot[]> {
    const where: Prisma.StructuralMetricSnapshotWhereInput = {
      userId: userId as string,
      domain,
    };

    if (options?.since !== undefined || options?.until !== undefined) {
      where.createdAt = {};
      if (options.since !== undefined) {
        where.createdAt.gte = new Date(options.since);
      }
      if (options.until !== undefined) {
        where.createdAt.lte = new Date(options.until);
      }
    }

    const records = await this.prisma.structuralMetricSnapshot.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 100,
    });

    return records.map((r) => this.toDomain(r));
  }

  async deleteOldSnapshots(olderThan: string): Promise<number> {
    const result = await this.prisma.structuralMetricSnapshot.deleteMany({
      where: {
        createdAt: { lt: new Date(olderThan) },
      },
    });

    return result.count;
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private toDomain(record: {
    id: string;
    userId: string;
    domain: string | null;
    metrics: Prisma.JsonValue;
    createdAt: Date;
  }): IMetricSnapshot {
    return {
      id: record.id,
      userId: record.userId as UserId,
      domain: record.domain ?? '',
      metrics: record.metrics as unknown as IStructuralMetrics,
      computedAt: record.createdAt.toISOString(),
    };
  }
}
