/**
 * @noema/knowledge-graph-service — Prisma Metrics Staleness Repository
 *
 * Implements IMetricsStalenessRepository using PostgreSQL via Prisma.
 * Tracks when user+domain structural metrics need recomputation.
 *
 * Uses upsert semantics on the (userId, domain) compound unique key.
 * Every PKG mutation (node/edge CRUD) calls markStale(), and the
 * metrics engine checks isStale() before deciding whether to recompute.
 */

import type { UserId } from '@noema/types';
import { nanoid } from 'nanoid';
import type { PrismaClient } from '../../../../generated/prisma/index.js';

import type {
  IMetricsStalenessRecord,
  IMetricsStalenessRepository,
} from '../../../domain/knowledge-graph-service/metrics-staleness.repository.js';

// ============================================================================
// PrismaMetricsStalenessRepository
// ============================================================================

export class PrismaMetricsStalenessRepository implements IMetricsStalenessRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async markStale(userId: UserId, domain: string, mutationType: string): Promise<void> {
    const now = new Date();

    await this.prisma.metricsStaleness.upsert({
      where: {
        userId_domain: { userId: String(userId), domain },
      },
      update: {
        lastStructuralChangeAt: now,
        lastMutationType: mutationType,
      },
      create: {
        id: `ms_${nanoid()}`,
        userId: String(userId),
        domain,
        lastStructuralChangeAt: now,
        lastMutationType: mutationType,
      },
    });
  }

  async isStale(userId: UserId, domain: string, lastComputedAt: string): Promise<boolean> {
    const record = await this.prisma.metricsStaleness.findUnique({
      where: {
        userId_domain: { userId: String(userId), domain },
      },
    });

    if (!record) return true;

    return record.lastStructuralChangeAt.getTime() > new Date(lastComputedAt).getTime();
  }

  async getStalenessRecord(
    userId: UserId,
    domain: string
  ): Promise<IMetricsStalenessRecord | null> {
    const record = await this.prisma.metricsStaleness.findUnique({
      where: {
        userId_domain: { userId: String(userId), domain },
      },
    });

    if (!record) return null;

    return {
      id: record.id,
      userId: record.userId as UserId,
      domain: record.domain,
      lastStructuralChangeAt: record.lastStructuralChangeAt.toISOString(),
      lastMutationType: record.lastMutationType,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
