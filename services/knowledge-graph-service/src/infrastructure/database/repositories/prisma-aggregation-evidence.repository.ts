/**
 * @noema/knowledge-graph-service — Prisma Aggregation Evidence Repository
 *
 * Concrete IAggregationEvidenceRepository backed by PostgreSQL via Prisma.
 * Records and queries PKG→CKG aggregation evidence, including
 * promotion band calculation via PromotionBandUtil.
 */

import type {
  ConfidenceScore,
  Metadata,
  MutationId,
  NodeId,
  PromotionBand,
  UserId,
} from '@noema/types';
import { nanoid } from 'nanoid';
import type { Prisma, PrismaClient } from '../../../../generated/prisma/index.js';

import type {
  IAggregationEvidence,
  IAggregationEvidenceRepository,
  IEvidenceSummary,
} from '../../../domain/knowledge-graph-service/aggregation-evidence.repository.js';
import type { GraphCrdtDirection } from '../../../domain/knowledge-graph-service/crdt-stats.repository.js';
import { PromotionBandUtil } from '../../../domain/knowledge-graph-service/value-objects/promotion-band.js';
import { fromPrismaJson, toPrismaJson } from './prisma-json.helpers.js';

// ============================================================================
// Helpers
// ============================================================================

function generateEvidenceId(): string {
  const timestamp = Date.now().toString(36).padStart(10, '0');
  const sequence = nextEvidenceSequence().toString().padStart(4, '0');
  return `evid_${timestamp}_${sequence}_${nanoid(6)}`;
}

let lastEvidenceTimestamp = 0;
let lastEvidenceSequence = 0;

function nextEvidenceSequence(): number {
  const now = Date.now();
  if (now === lastEvidenceTimestamp) {
    lastEvidenceSequence += 1;
  } else {
    lastEvidenceTimestamp = now;
    lastEvidenceSequence = 0;
  }
  return lastEvidenceSequence;
}

function buildEvidenceDedupeKey(input: {
  sourceUserId: UserId;
  sourcePkgNodeId: NodeId;
  ckgTargetNodeId?: NodeId;
  proposedLabel?: string;
  evidenceType: string;
  direction?: GraphCrdtDirection;
  sourceEventId?: string;
}): string {
  const eventScope = input.sourceEventId?.trim();
  return [
    input.sourceUserId,
    input.sourcePkgNodeId,
    input.ckgTargetNodeId ?? 'no-target',
    (input.proposedLabel ?? 'no-label').trim().toLowerCase(),
    input.evidenceType,
    input.direction ?? 'support',
    eventScope !== undefined && eventScope.length > 0 ? eventScope : 'no-event',
  ].join(':');
}

function summarizeEvidenceRecords(
  records: readonly {
    sourceUserId: string;
    confidence: number;
    direction: string;
    createdAt: Date;
    id: string;
    orderingSeq: bigint;
  }[]
): IEvidenceSummary {
  if (records.length === 0) {
    return {
      totalCount: 0,
      contributingUserCount: 0,
      directionalContributorCount: { support: 0, oppose: 0, neutral: 0 },
      averageConfidence: 0 as ConfidenceScore,
      confidenceDistribution: { low: 0, medium: 0, high: 0 },
      achievedBand: 'none' as PromotionBand,
      netSupportContributorCount: 0,
    };
  }

  const totalCount = records.length;
  const orderedLatestPerUser = new Map<
    string,
    { sourceUserId: string; confidence: number; direction: string; createdAt: Date; id: string }
  >();
  const sorted = [...records].sort((left, right) => {
    const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();
    if (createdDiff !== 0) {
      return createdDiff;
    }
    const orderingDiff = Number(right.orderingSeq - left.orderingSeq);
    if (orderingDiff !== 0) {
      return orderingDiff;
    }
    return right.id.localeCompare(left.id);
  });

  for (const record of sorted) {
    if (!orderedLatestPerUser.has(record.sourceUserId)) {
      orderedLatestPerUser.set(record.sourceUserId, record);
    }
  }

  const latestContributorRecords = [...orderedLatestPerUser.values()];
  const contributingUserCount = latestContributorRecords.length;
  const supportContributors = latestContributorRecords.filter(
    (record) => record.direction === 'support'
  ).length;
  const opposeContributors = latestContributorRecords.filter(
    (record) => record.direction === 'oppose'
  ).length;
  const neutralContributors = latestContributorRecords.filter(
    (record) => record.direction === 'neutral'
  ).length;

  const sumConfidence = records.reduce((sum, record) => sum + record.confidence, 0);
  const averageConfidence = sumConfidence / totalCount;

  let low = 0;
  let medium = 0;
  let high = 0;
  for (const record of records) {
    if (record.confidence < 0.3) low++;
    else if (record.confidence < 0.7) medium++;
    else high++;
  }

  return {
    totalCount,
    contributingUserCount,
    directionalContributorCount: {
      support: supportContributors,
      oppose: opposeContributors,
      neutral: neutralContributors,
    },
    averageConfidence: averageConfidence as ConfidenceScore,
    confidenceDistribution: { low, medium, high },
    achievedBand: PromotionBandUtil.fromEvidenceCount(supportContributors),
    netSupportContributorCount: supportContributors - opposeContributors,
  };
}

function toSupportBandCount(
  records: readonly {
    sourceUserId: string;
    direction: string;
    createdAt: Date;
    id: string;
    orderingSeq: bigint;
  }[]
): { count: number; band: PromotionBand } {
  const latestByUser = new Map<string, { direction: string; createdAt: Date; id: string }>();
  const sorted = [...records].sort((left, right) => {
    const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();
    if (createdDiff !== 0) {
      return createdDiff;
    }
    const orderingDiff = Number(right.orderingSeq - left.orderingSeq);
    if (orderingDiff !== 0) {
      return orderingDiff;
    }
    return right.id.localeCompare(left.id);
  });

  for (const record of sorted) {
    if (!latestByUser.has(record.sourceUserId)) {
      latestByUser.set(record.sourceUserId, {
        direction: record.direction,
        createdAt: record.createdAt,
        id: record.id,
      });
    }
  }

  const count = [...latestByUser.values()].filter(
    (record) => record.direction === 'support'
  ).length;
  return {
    count,
    band: PromotionBandUtil.fromEvidenceCount(count),
  };
}

// ============================================================================
// PrismaAggregationEvidenceRepository
// ============================================================================

export class PrismaAggregationEvidenceRepository implements IAggregationEvidenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordEvidence(input: {
    sourceUserId: UserId;
    sourcePkgNodeId: NodeId;
    ckgTargetNodeId?: NodeId;
    proposedLabel?: string;
    evidenceType: string;
    confidence: ConfidenceScore;
    metadata?: Metadata;
    direction?: GraphCrdtDirection;
    sourceEventId?: string;
    sourceObservedAt?: string;
  }): Promise<IAggregationEvidence> {
    const id = generateEvidenceId();
    const dedupeKey = buildEvidenceDedupeKey(input);
    try {
      const data: Prisma.AggregationEvidenceUncheckedCreateInput = {
        id,
        dedupeKey,
        sourceUserId: input.sourceUserId as string,
        sourcePkgNodeId: input.sourcePkgNodeId as string,
        ...(input.sourceEventId !== undefined ? { sourceEventId: input.sourceEventId } : {}),
        ...(input.sourceObservedAt !== undefined
          ? { sourceObservedAt: new Date(input.sourceObservedAt) }
          : {}),
        evidenceType: input.evidenceType,
        confidence: input.confidence as number,
        payload: toPrismaJson(input.metadata ?? {}),
        direction: input.direction ?? 'support',
      };
      if (input.ckgTargetNodeId !== undefined) {
        data.ckgTargetNodeId = input.ckgTargetNodeId as string;
      }
      if (input.proposedLabel !== undefined) {
        data.proposedLabel = input.proposedLabel;
      }

      const record = await this.prisma.aggregationEvidence.create({ data });
      return this.toDomain(record);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await this.prisma.aggregationEvidence.findFirst({
          where: { dedupeKey },
        });
        if (existing !== null) {
          return this.toDomain(existing);
        }
      }
      throw error;
    }
  }

  async getEvidenceForTarget(ckgTargetNodeId: NodeId): Promise<IAggregationEvidence[]> {
    const records = await this.prisma.aggregationEvidence.findMany({
      where: { ckgTargetNodeId: ckgTargetNodeId as string },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async getEvidenceForProposedLabel(proposedLabel: string): Promise<IAggregationEvidence[]> {
    const records = await this.prisma.aggregationEvidence.findMany({
      where: { proposedLabel },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async getEvidenceCountByBand(
    ckgTargetNodeId: NodeId
  ): Promise<{ count: number; band: PromotionBand }> {
    const records = await this.prisma.aggregationEvidence.findMany({
      where: {
        ckgTargetNodeId: ckgTargetNodeId as string,
      },
      select: {
        id: true,
        sourceUserId: true,
        direction: true,
        createdAt: true,
        orderingSeq: true,
      },
    });
    return toSupportBandCount(records);
  }

  async getEvidenceCountByProposedLabel(
    proposedLabel: string
  ): Promise<{ count: number; band: PromotionBand }> {
    const records = await this.prisma.aggregationEvidence.findMany({
      where: {
        proposedLabel,
      },
      select: {
        id: true,
        sourceUserId: true,
        direction: true,
        createdAt: true,
        orderingSeq: true,
      },
    });
    return toSupportBandCount(records);
  }

  async getEvidenceByUser(userId: UserId): Promise<IAggregationEvidence[]> {
    const records = await this.prisma.aggregationEvidence.findMany({
      where: { sourceUserId: userId as string },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findEvidence(input: {
    sourceUserId: UserId;
    sourcePkgNodeId: NodeId;
    ckgTargetNodeId?: NodeId;
    proposedLabel?: string;
    evidenceType: string;
    direction?: GraphCrdtDirection;
  }): Promise<IAggregationEvidence | null> {
    const dedupeKey = buildEvidenceDedupeKey(input);
    const record = await this.prisma.aggregationEvidence.findFirst({
      where: {
        dedupeKey,
      },
    });

    return record ? this.toDomain(record) : null;
  }

  async findLatestEvidenceSignal(input: {
    sourceUserId: UserId;
    sourcePkgNodeId: NodeId;
    ckgTargetNodeId?: NodeId;
    proposedLabel?: string;
    evidenceType: string;
  }): Promise<IAggregationEvidence | null> {
    const record = await this.prisma.aggregationEvidence.findFirst({
      where: {
        sourceUserId: input.sourceUserId as string,
        sourcePkgNodeId: input.sourcePkgNodeId as string,
        evidenceType: input.evidenceType,
        ...(input.ckgTargetNodeId !== undefined
          ? { ckgTargetNodeId: input.ckgTargetNodeId as string }
          : { ckgTargetNodeId: null }),
        ...(input.proposedLabel !== undefined
          ? { proposedLabel: input.proposedLabel }
          : { proposedLabel: null }),
      },
      orderBy: [{ sourceObservedAt: 'desc' }, { orderingSeq: 'desc' }, { id: 'desc' }],
    });

    return record ? this.toDomain(record) : null;
  }

  async deleteStaleEvidence(olderThan: string): Promise<number> {
    const result = await this.prisma.aggregationEvidence.deleteMany({
      where: {
        createdAt: { lt: new Date(olderThan) },
      },
    });

    return result.count;
  }

  async getEvidenceSummary(ckgTargetNodeId: NodeId): Promise<IEvidenceSummary> {
    const records = await this.prisma.aggregationEvidence.findMany({
      where: { ckgTargetNodeId: ckgTargetNodeId as string },
      select: {
        id: true,
        sourceUserId: true,
        confidence: true,
        direction: true,
        createdAt: true,
        orderingSeq: true,
      },
    });
    return summarizeEvidenceRecords(records);
  }

  async getEvidenceSummaryByProposedLabel(proposedLabel: string): Promise<IEvidenceSummary> {
    const records = await this.prisma.aggregationEvidence.findMany({
      where: { proposedLabel },
      select: {
        id: true,
        sourceUserId: true,
        confidence: true,
        direction: true,
        createdAt: true,
        orderingSeq: true,
      },
    });
    return summarizeEvidenceRecords(records);
  }

  async getLinkedMutationIds(input: {
    ckgTargetNodeId?: NodeId;
    proposedLabel?: string;
  }): Promise<readonly MutationId[]> {
    const records = await this.prisma.aggregationEvidence.findMany({
      where: {
        mutationId: { not: null },
        ...(input.ckgTargetNodeId !== undefined
          ? { ckgTargetNodeId: input.ckgTargetNodeId as string }
          : {}),
        ...(input.proposedLabel !== undefined ? { proposedLabel: input.proposedLabel } : {}),
      },
      select: {
        mutationId: true,
      },
    });

    return [
      ...new Set(
        records.flatMap((record) =>
          record.mutationId === null ? [] : [record.mutationId as MutationId]
        )
      ),
    ];
  }

  async linkEvidenceToMutation(input: {
    mutationId: MutationId;
    ckgTargetNodeId?: NodeId;
    proposedLabel?: string;
  }): Promise<number> {
    const result = await this.prisma.aggregationEvidence.updateMany({
      where: {
        mutationId: null,
        ...(input.ckgTargetNodeId !== undefined
          ? { ckgTargetNodeId: input.ckgTargetNodeId as string }
          : {}),
        ...(input.proposedLabel !== undefined ? { proposedLabel: input.proposedLabel } : {}),
      },
      data: {
        mutationId: input.mutationId as string,
      },
    });

    return result.count;
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private toDomain(record: {
    id: string;
    dedupeKey: string;
    orderingSeq: bigint;
    mutationId: string | null;
    sourceUserId: string;
    sourcePkgNodeId: string;
    sourceEventId: string | null;
    sourceObservedAt: Date | null;
    ckgTargetNodeId: string | null;
    proposedLabel: string | null;
    evidenceType: string;
    confidence: number;
    payload: Prisma.JsonValue;
    direction: string;
    createdAt: Date;
  }): IAggregationEvidence {
    return {
      id: record.id,
      mutationId: record.mutationId as MutationId | null,
      sourceUserId: record.sourceUserId as UserId,
      sourcePkgNodeId: record.sourcePkgNodeId as NodeId,
      sourceEventId: record.sourceEventId,
      sourceObservedAt: record.sourceObservedAt?.toISOString() ?? null,
      ckgTargetNodeId: record.ckgTargetNodeId as NodeId | null,
      proposedLabel: record.proposedLabel,
      evidenceType: record.evidenceType,
      confidence: record.confidence as ConfidenceScore,
      metadata: fromPrismaJson<Metadata>(record.payload),
      direction: record.direction as GraphCrdtDirection,
      recordedAt: record.createdAt.toISOString(),
    };
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && (error as { code?: string }).code === 'P2002';
}
