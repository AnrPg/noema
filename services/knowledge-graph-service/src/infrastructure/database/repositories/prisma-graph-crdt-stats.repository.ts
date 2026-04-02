import type { Metadata, UserId } from '@noema/types';
import { nanoid } from 'nanoid';
import type { Prisma, PrismaClient } from '../../../../generated/prisma/index.js';

import type {
  GraphCrdtDirection,
  GraphCrdtTargetKind,
  IGraphCrdtStat,
  IGraphCrdtStatsRepository,
} from '../../../domain/knowledge-graph-service/crdt-stats.repository.js';
import { fromPrismaJson, toPrismaJson } from './prisma-json.helpers.js';

function generateStatId(): string {
  return `gcrdt_${nanoid()}`;
}

function generateAppliedSignalId(): string {
  return `gcrdtsig_${nanoid()}`;
}

function buildStatKey(input: {
  targetKind: GraphCrdtTargetKind;
  targetNodeId?: string;
  proposedLabel?: string;
  evidenceType: string;
}): string {
  return input.targetKind === 'ckg_node'
    ? `ckg_node:${input.targetNodeId ?? ''}:${input.evidenceType}`
    : `proposed_label:${(input.proposedLabel ?? '').trim().toLowerCase()}:${input.evidenceType}`;
}

function incrementCounter(
  counter: Readonly<Record<string, number>>,
  replicaId: string,
  delta: number
): Record<string, number> {
  return {
    ...counter,
    [replicaId]: Math.max(counter[replicaId] ?? 0, (counter[replicaId] ?? 0) + delta),
  };
}

function sumCounter(counter: Readonly<Record<string, number>>): number {
  return Object.values(counter).reduce((sum, value) => sum + value, 0);
}

function toDomain(record: {
  statKey: string;
  graphType: string;
  targetKind: string;
  targetNodeId: string | null;
  proposedLabel: string | null;
  evidenceType: string;
  supportCounter: Prisma.JsonValue;
  opposeCounter: Prisma.JsonValue;
  neutralCounter: Prisma.JsonValue;
  confidenceCounter: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): IGraphCrdtStat {
  const supportCounterByReplica = fromPrismaJson<Record<string, number>>(record.supportCounter);
  const opposeCounterByReplica = fromPrismaJson<Record<string, number>>(record.opposeCounter);
  const neutralCounterByReplica = fromPrismaJson<Record<string, number>>(record.neutralCounter);
  const confidenceCounterByReplica = fromPrismaJson<Record<string, number>>(
    record.confidenceCounter
  );
  const supportCount = sumCounter(supportCounterByReplica);
  const opposeCount = sumCounter(opposeCounterByReplica);
  const neutralCount = sumCounter(neutralCounterByReplica);
  const totalObservations = supportCount + opposeCount + neutralCount;
  const confidenceSum = sumCounter(confidenceCounterByReplica);

  return {
    statKey: record.statKey,
    graphType: 'ckg',
    targetKind: record.targetKind as GraphCrdtTargetKind,
    targetNodeId: record.targetNodeId,
    proposedLabel: record.proposedLabel,
    evidenceType: record.evidenceType,
    supportCount,
    opposeCount,
    neutralCount,
    totalObservations,
    averageConfidence: totalObservations === 0 ? 0 : confidenceSum / totalObservations / 1000,
    supportCounterByReplica,
    opposeCounterByReplica,
    neutralCounterByReplica,
    confidenceCounterByReplica,
    metadata: fromPrismaJson<Metadata>(record.metadata),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class PrismaGraphCrdtStatsRepository implements IGraphCrdtStatsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async applyEvidenceSignal(input: {
    evidenceId: string;
    replicaId: string;
    graphType: 'ckg';
    targetKind: GraphCrdtTargetKind;
    targetNodeId?: string;
    proposedLabel?: string;
    evidenceType: string;
    direction: GraphCrdtDirection;
    confidence: number;
    sourceUserId: UserId;
    metadata?: Metadata;
  }): Promise<IGraphCrdtStat> {
    const statKey = buildStatKey(input);

    return this.prisma.$transaction(async (tx) => {
      const applied = await tx.graphCrdtAppliedSignal.findUnique({
        where: { evidenceId: input.evidenceId },
      });
      if (applied !== null) {
        const existing = await tx.graphCrdtStat.findUniqueOrThrow({
          where: { statKey: applied.statKey },
        });
        return toDomain(existing);
      }

      const existing =
        (await tx.graphCrdtStat.findUnique({
          where: { statKey },
        })) ??
        (await tx.graphCrdtStat.create({
          data: {
            id: generateStatId(),
            statKey,
            graphType: input.graphType,
            targetKind: input.targetKind,
            targetNodeId: input.targetNodeId ?? null,
            proposedLabel: input.proposedLabel ?? null,
            evidenceType: input.evidenceType,
            supportCounter: toPrismaJson({}),
            opposeCounter: toPrismaJson({}),
            neutralCounter: toPrismaJson({}),
            confidenceCounter: toPrismaJson({}),
            metadata: toPrismaJson({
              ...(input.metadata ?? {}),
              latestSourceUserId: input.sourceUserId,
            }),
          },
        }));

      const supportCounter = fromPrismaJson<Record<string, number>>(existing.supportCounter);
      const opposeCounter = fromPrismaJson<Record<string, number>>(existing.opposeCounter);
      const neutralCounter = fromPrismaJson<Record<string, number>>(existing.neutralCounter);
      const confidenceCounter = fromPrismaJson<Record<string, number>>(existing.confidenceCounter);

      const updatedSupportCounter =
        input.direction === 'support'
          ? incrementCounter(supportCounter, input.replicaId, 1)
          : supportCounter;
      const updatedOpposeCounter =
        input.direction === 'oppose'
          ? incrementCounter(opposeCounter, input.replicaId, 1)
          : opposeCounter;
      const updatedNeutralCounter =
        input.direction === 'neutral'
          ? incrementCounter(neutralCounter, input.replicaId, 1)
          : neutralCounter;
      const updatedConfidenceCounter = incrementCounter(
        confidenceCounter,
        input.replicaId,
        Math.round(input.confidence * 1000)
      );

      const updated = await tx.graphCrdtStat.update({
        where: { statKey },
        data: {
          supportCounter: toPrismaJson(updatedSupportCounter),
          opposeCounter: toPrismaJson(updatedOpposeCounter),
          neutralCounter: toPrismaJson(updatedNeutralCounter),
          confidenceCounter: toPrismaJson(updatedConfidenceCounter),
          metadata: toPrismaJson({
            ...fromPrismaJson<Metadata>(existing.metadata),
            ...(input.metadata ?? {}),
            latestSourceUserId: input.sourceUserId,
          }),
        },
      });

      await tx.graphCrdtAppliedSignal.create({
        data: {
          id: generateAppliedSignalId(),
          statKey,
          evidenceId: input.evidenceId,
          replicaId: input.replicaId,
        },
      });

      return toDomain(updated);
    });
  }

  async listStats(filters: {
    targetKind?: GraphCrdtTargetKind;
    targetNodeId?: string;
    proposedLabel?: string;
    evidenceType?: string;
  }): Promise<IGraphCrdtStat[]> {
    const records = await this.prisma.graphCrdtStat.findMany({
      where: {
        ...(filters.targetKind !== undefined ? { targetKind: filters.targetKind } : {}),
        ...(filters.targetNodeId !== undefined ? { targetNodeId: filters.targetNodeId } : {}),
        ...(filters.proposedLabel !== undefined ? { proposedLabel: filters.proposedLabel } : {}),
        ...(filters.evidenceType !== undefined ? { evidenceType: filters.evidenceType } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });

    return records.map((record) => toDomain(record));
  }
}

export class NoopGraphCrdtStatsRepository implements IGraphCrdtStatsRepository {
  applyEvidenceSignal(input: {
    evidenceId: string;
    replicaId: string;
    graphType: 'ckg';
    targetKind: GraphCrdtTargetKind;
    targetNodeId?: string;
    proposedLabel?: string;
    evidenceType: string;
    direction: GraphCrdtDirection;
    confidence: number;
    sourceUserId: UserId;
    metadata?: Metadata;
  }): Promise<IGraphCrdtStat> {
    return Promise.resolve({
      statKey: buildStatKey(input),
      graphType: 'ckg',
      targetKind: input.targetKind,
      targetNodeId: input.targetNodeId ?? null,
      proposedLabel: input.proposedLabel ?? null,
      evidenceType: input.evidenceType,
      supportCount: input.direction === 'support' ? 1 : 0,
      opposeCount: input.direction === 'oppose' ? 1 : 0,
      neutralCount: input.direction === 'neutral' ? 1 : 0,
      totalObservations: 1,
      averageConfidence: input.confidence,
      supportCounterByReplica: input.direction === 'support' ? { [input.replicaId]: 1 } : {},
      opposeCounterByReplica: input.direction === 'oppose' ? { [input.replicaId]: 1 } : {},
      neutralCounterByReplica: input.direction === 'neutral' ? { [input.replicaId]: 1 } : {},
      confidenceCounterByReplica: { [input.replicaId]: Math.round(input.confidence * 1000) },
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  listStats(): Promise<IGraphCrdtStat[]> {
    return Promise.resolve([]);
  }
}
