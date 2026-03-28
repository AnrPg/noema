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

import type { StudyMode, UserId } from '@noema/types';
import { nanoid } from 'nanoid';
import type { PrismaClient } from '../../../../generated/prisma/index.js';

import type {
  IMetricsStalenessRecord,
  IMetricsStalenessRepository,
} from '../../../domain/knowledge-graph-service/metrics-staleness.repository.js';

const ALL_STUDY_MODES: StudyMode[] = ['knowledge_gaining', 'language_learning'];

function toPrismaStudyMode(studyMode: StudyMode): 'LANGUAGE_LEARNING' | 'KNOWLEDGE_GAINING' {
  return studyMode === 'language_learning' ? 'LANGUAGE_LEARNING' : 'KNOWLEDGE_GAINING';
}

// ============================================================================
// PrismaMetricsStalenessRepository
// ============================================================================

export class PrismaMetricsStalenessRepository implements IMetricsStalenessRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async markStale(
    userId: UserId,
    domain: string,
    mutationType: string,
    studyMode?: StudyMode
  ): Promise<void> {
    const now = new Date();

    for (const mode of studyMode !== undefined ? [studyMode] : ALL_STUDY_MODES) {
      await this.prisma.metricsStaleness.upsert({
        where: {
          userId_domain_studyMode: {
            userId: String(userId),
            domain,
            studyMode: toPrismaStudyMode(mode),
          },
        },
        update: {
          lastStructuralChangeAt: now,
          lastMutationType: mutationType,
        },
        create: {
          id: `ms_${nanoid()}`,
          userId: String(userId),
          domain,
          studyMode: toPrismaStudyMode(mode),
          lastStructuralChangeAt: now,
          lastMutationType: mutationType,
        },
      });
    }
  }

  async isStale(
    userId: UserId,
    domain: string,
    studyMode: StudyMode,
    lastComputedAt: string
  ): Promise<boolean> {
    const record = await this.prisma.metricsStaleness.findUnique({
      where: {
        userId_domain_studyMode: {
          userId: String(userId),
          domain,
          studyMode: toPrismaStudyMode(studyMode),
        },
      },
    });

    if (!record) return true;

    return record.lastStructuralChangeAt.getTime() > new Date(lastComputedAt).getTime();
  }

  async getStalenessRecord(
    userId: UserId,
    domain: string,
    studyMode: StudyMode
  ): Promise<IMetricsStalenessRecord | null> {
    const record = await this.prisma.metricsStaleness.findUnique({
      where: {
        userId_domain_studyMode: {
          userId: String(userId),
          domain,
          studyMode: toPrismaStudyMode(studyMode),
        },
      },
    });

    if (!record) return null;

    return {
      id: record.id,
      userId: record.userId as UserId,
      domain: record.domain,
      studyMode:
        record.studyMode === 'LANGUAGE_LEARNING' ? 'language_learning' : 'knowledge_gaining',
      lastStructuralChangeAt: record.lastStructuralChangeAt.toISOString(),
      lastMutationType: record.lastMutationType,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
