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
  return `evid_${nanoid()}`;
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
  }): Promise<IAggregationEvidence> {
    const id = generateEvidenceId();

    const data: Prisma.AggregationEvidenceUncheckedCreateInput = {
      id,
      sourceUserId: input.sourceUserId as string,
      sourcePkgNodeId: input.sourcePkgNodeId as string,
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
    // Count distinct contributing users (each user counts once)
    const result = await this.prisma.aggregationEvidence.groupBy({
      by: ['sourceUserId'],
      where: { ckgTargetNodeId: ckgTargetNodeId as string },
    });

    const count = result.length; // Number of distinct users
    const band = PromotionBandUtil.fromEvidenceCount(count);

    return { count, band };
  }

  async getEvidenceCountByProposedLabel(
    proposedLabel: string
  ): Promise<{ count: number; band: PromotionBand }> {
    const result = await this.prisma.aggregationEvidence.groupBy({
      by: ['sourceUserId'],
      where: { proposedLabel },
    });

    const count = result.length;
    const band = PromotionBandUtil.fromEvidenceCount(count);

    return { count, band };
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
        sourceUserId: true,
        confidence: true,
      },
    });

    if (records.length === 0) {
      return {
        totalCount: 0,
        contributingUserCount: 0,
        averageConfidence: 0 as ConfidenceScore,
        confidenceDistribution: { low: 0, medium: 0, high: 0 },
        achievedBand: 'none' as PromotionBand,
      };
    }

    // Aggregate
    const totalCount = records.length;
    const uniqueUsers = new Set(records.map((r) => r.sourceUserId));
    const contributingUserCount = uniqueUsers.size;

    const sumConfidence = records.reduce((sum, r) => sum + r.confidence, 0);
    const averageConfidence = sumConfidence / totalCount;

    // Confidence distribution
    let low = 0;
    let medium = 0;
    let high = 0;
    for (const r of records) {
      if (r.confidence < 0.3) low++;
      else if (r.confidence < 0.7) medium++;
      else high++;
    }

    const achievedBand = PromotionBandUtil.fromEvidenceCount(contributingUserCount);

    return {
      totalCount,
      contributingUserCount,
      averageConfidence: averageConfidence as ConfidenceScore,
      confidenceDistribution: { low, medium, high },
      achievedBand,
    };
  }

  async getEvidenceSummaryByProposedLabel(proposedLabel: string): Promise<IEvidenceSummary> {
    const records = await this.prisma.aggregationEvidence.findMany({
      where: { proposedLabel },
      select: {
        sourceUserId: true,
        confidence: true,
      },
    });

    if (records.length === 0) {
      return {
        totalCount: 0,
        contributingUserCount: 0,
        averageConfidence: 0 as ConfidenceScore,
        confidenceDistribution: { low: 0, medium: 0, high: 0 },
        achievedBand: 'none' as PromotionBand,
      };
    }

    const totalCount = records.length;
    const uniqueUsers = new Set(records.map((r) => r.sourceUserId));
    const contributingUserCount = uniqueUsers.size;
    const sumConfidence = records.reduce((sum, r) => sum + r.confidence, 0);
    const averageConfidence = sumConfidence / totalCount;

    let low = 0;
    let medium = 0;
    let high = 0;
    for (const r of records) {
      if (r.confidence < 0.3) low++;
      else if (r.confidence < 0.7) medium++;
      else high++;
    }

    const achievedBand = PromotionBandUtil.fromEvidenceCount(contributingUserCount);

    return {
      totalCount,
      contributingUserCount,
      averageConfidence: averageConfidence as ConfidenceScore,
      confidenceDistribution: { low, medium, high },
      achievedBand,
    };
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
    mutationId: string | null;
    sourceUserId: string;
    sourcePkgNodeId: string;
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
