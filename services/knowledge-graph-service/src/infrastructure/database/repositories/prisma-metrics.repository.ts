/**
 * @noema/knowledge-graph-service — Prisma Metrics Repository
 *
 * Concrete IMetricsRepository backed by PostgreSQL via Prisma.
 * Stores structural metric snapshots for trend analysis and agent reasoning.
 */

import type { IStructuralMetrics, StudyMode, UserId } from '@noema/types';
import { nanoid } from 'nanoid';
import type { Prisma, PrismaClient } from '../../../../generated/prisma/index.js';

import type {
  IMetricSnapshot,
  IMetricsHistoryOptions,
  IMetricsRepository,
} from '../../../domain/knowledge-graph-service/metrics.repository.js';
import { fromPrismaJson, toPrismaJson } from './prisma-json.helpers.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Current schema version for metric snapshots. Bump this when the
 * IStructuralMetrics shape changes (new fields added, fields renamed, etc.)
 * so consumers can detect and handle older snapshots appropriately (L2 fix).
 */
const CURRENT_METRICS_SCHEMA_VERSION = 1;

function toPrismaStudyMode(studyMode: StudyMode): 'LANGUAGE_LEARNING' | 'KNOWLEDGE_GAINING' {
  return studyMode === 'language_learning' ? 'LANGUAGE_LEARNING' : 'KNOWLEDGE_GAINING';
}

// ============================================================================
// PrismaMetricsRepository
// ============================================================================

export class PrismaMetricsRepository implements IMetricsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveSnapshot(
    userId: UserId,
    domain: string,
    studyMode: StudyMode,
    metrics: IStructuralMetrics
  ): Promise<IMetricSnapshot> {
    const id = `snap_${nanoid()}`;

    const record = await this.prisma.structuralMetricSnapshot.create({
      data: {
        id,
        userId: userId as string,
        domain,
        studyMode: toPrismaStudyMode(studyMode),
        metrics: toPrismaJson(metrics),
        schemaVersion: CURRENT_METRICS_SCHEMA_VERSION,
      },
    });

    return this.toDomain(record);
  }

  async getLatestSnapshot(
    userId: UserId,
    domain: string,
    studyMode: StudyMode
  ): Promise<IMetricSnapshot | null> {
    const record = await this.prisma.structuralMetricSnapshot.findFirst({
      where: {
        userId: userId as string,
        domain,
        studyMode: toPrismaStudyMode(studyMode),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) return null;
    return this.toDomain(record);
  }

  async getSnapshotHistory(
    userId: UserId,
    domain: string,
    studyMode: StudyMode,
    options?: IMetricsHistoryOptions
  ): Promise<IMetricSnapshot[]> {
    const where: Prisma.StructuralMetricSnapshotWhereInput = {
      userId: userId as string,
      domain,
      studyMode: toPrismaStudyMode(studyMode),
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

  /**
   * Map Prisma record → domain IMetricSnapshot.
   *
   * Note: The Prisma schema also stores `graphRegion`, `metacognitiveStage`,
   * and `nodeCount` for DB-level indexing and future admin UI features.
   * These are intentionally not surfaced in the domain model — the full
   * data is encoded in the `metrics` JSONB blob.
   */
  private toDomain(record: {
    id: string;
    userId: string;
    domain: string | null;
    studyMode: 'LANGUAGE_LEARNING' | 'KNOWLEDGE_GAINING';
    metrics: Prisma.JsonValue;
    schemaVersion: number;
    createdAt: Date;
  }): IMetricSnapshot {
    return {
      id: record.id,
      userId: record.userId as UserId,
      domain: record.domain ?? '',
      studyMode:
        record.studyMode === 'LANGUAGE_LEARNING' ? 'language_learning' : 'knowledge_gaining',
      metrics: fromPrismaJson<IStructuralMetrics>(record.metrics),
      computedAt: record.createdAt.toISOString(),
      schemaVersion: record.schemaVersion,
    };
  }
}
