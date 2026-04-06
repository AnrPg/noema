import type { Metadata, UserId } from '@noema/types';
import { nanoid } from 'nanoid';
import { Prisma, type PrismaClient } from '../../../../generated/prisma/index.js';

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

function generateReplicaStateId(): string {
  return `gcrdtrep_${nanoid()}`;
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
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  replicaStates: readonly {
    replicaId: string;
    supportCount: number;
    opposeCount: number;
    neutralCount: number;
    confidenceCount: number;
  }[];
}): IGraphCrdtStat {
  const { supportCounterByReplica, opposeCounterByReplica, neutralCounterByReplica, confidenceCounterByReplica } =
    buildReplicaCounters(record.replicaStates);
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
        const replicaStates = await this.getReplicaStates(tx, applied.statKey);
        return toDomain({
          ...existing,
          replicaStates,
        });
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
            metadata: toPrismaJson({
              ...(input.metadata ?? {}),
              latestSourceUserId: input.sourceUserId,
            }),
          },
        }));

      await this.upsertReplicaState(tx, {
        statKey,
        replicaId: input.replicaId,
        direction: input.direction,
        confidenceCount: Math.round(input.confidence * 1000),
      });

      const replicaStates = await this.getReplicaStates(tx, statKey);

      const updated = await tx.graphCrdtStat.update({
        where: { statKey },
        data: {
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

      return toDomain({
        ...updated,
        replicaStates,
      });
    });
  }

  async listStats(filters: {
    targetKind?: GraphCrdtTargetKind;
    targetNodeId?: string;
    proposedLabel?: string;
    evidenceType?: string;
  }, pagination: {
    limit: number;
    offset: number;
  } = {
    limit: 25,
    offset: 0,
  }): Promise<{
    items: IGraphCrdtStat[];
    total: number;
    hasMore: boolean;
  }> {
    const where = {
      ...(filters.targetKind !== undefined ? { targetKind: filters.targetKind } : {}),
      ...(filters.targetNodeId !== undefined ? { targetNodeId: filters.targetNodeId } : {}),
      ...(filters.proposedLabel !== undefined ? { proposedLabel: filters.proposedLabel } : {}),
      ...(filters.evidenceType !== undefined ? { evidenceType: filters.evidenceType } : {}),
    };

    const [records, total] = await Promise.all([
      this.prisma.graphCrdtStat.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: pagination.limit,
        skip: pagination.offset,
      }),
      this.prisma.graphCrdtStat.count({ where }),
    ]);

    const replicaStatesByStatKey = await this.getReplicaStatesForStatKeys(
      this.prisma,
      records.map((record) => record.statKey)
    );

    const items = records.map((record) =>
      toDomain({
        ...record,
        replicaStates: replicaStatesByStatKey.get(record.statKey) ?? [],
      })
    );

    return {
      items,
      total,
      hasMore: pagination.offset + items.length < total,
    };
  }

  private async getReplicaStates(
    client: PrismaClient | Prisma.TransactionClient,
    statKey: string
  ): Promise<
    {
      replicaId: string;
      supportCount: number;
      opposeCount: number;
      neutralCount: number;
      confidenceCount: number;
    }[]
  > {
    const rows = await client.$queryRaw<
      {
        replicaId: string;
        supportCount: number;
        opposeCount: number;
        neutralCount: number;
        confidenceCount: number;
      }[]
    >(
      Prisma.sql`
        SELECT
          "replica_id" AS "replicaId",
          "support_count" AS "supportCount",
          "oppose_count" AS "opposeCount",
          "neutral_count" AS "neutralCount",
          "confidence_count" AS "confidenceCount"
        FROM "graph_crdt_replica_states"
        WHERE "stat_key" = ${statKey}
      `
    );

    return rows;
  }

  private async getReplicaStatesForStatKeys(
    client: PrismaClient | Prisma.TransactionClient,
    statKeys: readonly string[]
  ): Promise<
    Map<
      string,
      {
        replicaId: string;
        supportCount: number;
        opposeCount: number;
        neutralCount: number;
        confidenceCount: number;
      }[]
    >
  > {
    if (statKeys.length === 0) {
      return new Map();
    }

    const rows = await client.$queryRaw<
      {
        statKey: string;
        replicaId: string;
        supportCount: number;
        opposeCount: number;
        neutralCount: number;
        confidenceCount: number;
      }[]
    >(
      Prisma.sql`
        SELECT
          "stat_key" AS "statKey",
          "replica_id" AS "replicaId",
          "support_count" AS "supportCount",
          "oppose_count" AS "opposeCount",
          "neutral_count" AS "neutralCount",
          "confidence_count" AS "confidenceCount"
        FROM "graph_crdt_replica_states"
        WHERE "stat_key" IN (${Prisma.join(statKeys)})
      `
    );

    const map = new Map<
      string,
      {
        replicaId: string;
        supportCount: number;
        opposeCount: number;
        neutralCount: number;
        confidenceCount: number;
      }[]
    >();
    for (const row of rows) {
      const existing = map.get(row.statKey) ?? [];
      existing.push({
        replicaId: row.replicaId,
        supportCount: row.supportCount,
        opposeCount: row.opposeCount,
        neutralCount: row.neutralCount,
        confidenceCount: row.confidenceCount,
      });
      map.set(row.statKey, existing);
    }
    return map;
  }

  private async upsertReplicaState(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      statKey: string;
      replicaId: string;
      direction: GraphCrdtDirection;
      confidenceCount: number;
    }
  ): Promise<void> {
    await client.$executeRaw(
      Prisma.sql`
        INSERT INTO "graph_crdt_replica_states" (
          "id",
          "stat_key",
          "replica_id",
          "support_count",
          "oppose_count",
          "neutral_count",
          "confidence_count"
        ) VALUES (
          ${generateReplicaStateId()},
          ${input.statKey},
          ${input.replicaId},
          ${input.direction === 'support' ? 1 : 0},
          ${input.direction === 'oppose' ? 1 : 0},
          ${input.direction === 'neutral' ? 1 : 0},
          ${input.confidenceCount}
        )
        ON CONFLICT ("stat_key", "replica_id")
        DO UPDATE SET
          "support_count" = "graph_crdt_replica_states"."support_count" + ${
            input.direction === 'support' ? 1 : 0
          },
          "oppose_count" = "graph_crdt_replica_states"."oppose_count" + ${
            input.direction === 'oppose' ? 1 : 0
          },
          "neutral_count" = "graph_crdt_replica_states"."neutral_count" + ${
            input.direction === 'neutral' ? 1 : 0
          },
          "confidence_count" = "graph_crdt_replica_states"."confidence_count" + ${
            input.confidenceCount
          },
          "updated_at" = CURRENT_TIMESTAMP
      `
    );
  }
}

function buildReplicaCounters(
  replicaStates: readonly {
    replicaId: string;
    supportCount: number;
    opposeCount: number;
    neutralCount: number;
    confidenceCount: number;
  }[]
): {
  supportCounterByReplica: Record<string, number>;
  opposeCounterByReplica: Record<string, number>;
  neutralCounterByReplica: Record<string, number>;
  confidenceCounterByReplica: Record<string, number>;
} {
  return replicaStates.reduce(
    (acc, replicaState) => {
      acc.supportCounterByReplica[replicaState.replicaId] = replicaState.supportCount;
      acc.opposeCounterByReplica[replicaState.replicaId] = replicaState.opposeCount;
      acc.neutralCounterByReplica[replicaState.replicaId] = replicaState.neutralCount;
      acc.confidenceCounterByReplica[replicaState.replicaId] = replicaState.confidenceCount;
      return acc;
    },
    {
      supportCounterByReplica: {} as Record<string, number>,
      opposeCounterByReplica: {} as Record<string, number>,
      neutralCounterByReplica: {} as Record<string, number>,
      confidenceCounterByReplica: {} as Record<string, number>,
    }
  );
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

  listStats(): Promise<{ items: IGraphCrdtStat[]; total: number; hasMore: boolean }> {
    return Promise.resolve({ items: [], total: 0, hasMore: false });
  }
}
