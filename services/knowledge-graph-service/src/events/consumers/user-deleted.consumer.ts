/**
 * @noema/knowledge-graph-service - User Deleted Event Consumer (T2.3)
 *
 * Listens for 'user.deleted' events from the user-service stream.
 *
 * - Soft delete (payload.soft === true):
 *   → Soft-deletes all PKG nodes owned by the user in Neo4j
 *     (sets deletedAt timestamp, preserving graph structure).
 *   → Marks misconception detections as resolved.
 *
 * - Hard delete (payload.soft === false):
 *   → Hard-deletes all PKG nodes and edges for the user from Neo4j.
 *   → Deletes all PostgreSQL records: operation logs, metric snapshots,
 *     metrics staleness, misconception detections, aggregation evidence,
 *     and CKG mutations authored by the user (GDPR erasure).
 *
 * Uses BaseEventConsumer directly — no service-specific subclass needed
 * since KG-service does not require scheduler-style inbox dedup.
 *
 * @see BaseEventConsumer  — shared XREADGROUP lifecycle
 * @see ADR-003            — Event consumer architecture unification
 */

import type { IEventConsumerConfig, IStreamEventEnvelope } from '@noema/events/consumer';
import { BaseEventConsumer } from '@noema/events/consumer';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import type { Neo4jClient } from '../../infrastructure/database/neo4j-client.js';

// ============================================================================
// Default config
// ============================================================================

function buildConfig(overrides: {
  sourceStreamKey: string;
  consumerName: string;
}): IEventConsumerConfig {
  return {
    sourceStreamKey: overrides.sourceStreamKey,
    consumerGroup: 'kg-service:user-deleted',
    consumerName: overrides.consumerName,
    batchSize: 10,
    blockMs: 5000,
    retryBaseDelayMs: 500,
    maxProcessAttempts: 5,
    pendingIdleMs: 60_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 15_000,
    deadLetterStreamKey: 'noema:dlq:kg-service:user-deleted',
  };
}

function getNeo4jCount(record: { get: (key: string) => unknown } | undefined, key: string): number {
  const value = record?.get(key);
  if (hasToNumber(value)) {
    return value.toNumber();
  }

  return 0;
}

function hasToNumber(value: unknown): value is { toNumber: () => number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  );
}

// ============================================================================
// Consumer
// ============================================================================

export class UserDeletedConsumer extends BaseEventConsumer {
  private readonly prisma: PrismaClient;
  private readonly neo4jClient: Neo4jClient;

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    neo4jClient: Neo4jClient,
    logger: Logger,
    consumerName: string,
    sourceStreamKey = 'noema:events:user-service'
  ) {
    super(redis, buildConfig({ sourceStreamKey, consumerName }), logger);
    this.prisma = prisma;
    this.neo4jClient = neo4jClient;
  }

  protected async handleEvent(envelope: IStreamEventEnvelope): Promise<boolean> {
    if (envelope.eventType !== 'user.deleted') {
      return true; // Not our event — acknowledge
    }

    const userId = envelope.aggregateId;
    if (userId === '') {
      this.logger.warn({ envelope }, 'user.deleted event missing aggregateId');
      return true;
    }

    const isSoft = (envelope.payload as { soft?: boolean }).soft !== false;

    this.logger.info(
      { userId, soft: isSoft },
      'Processing user.deleted — cleaning knowledge graph data'
    );

    if (isSoft) {
      await this.softDeleteUserData(userId);
    } else {
      await this.hardDeleteUserData(userId);
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // Soft delete — mark PKG nodes and related records
  // --------------------------------------------------------------------------

  private async softDeleteUserData(userId: string): Promise<void> {
    const now = new Date();

    // 1. Soft-delete PKG nodes in Neo4j
    const nodesUpdated = await this.softDeletePkgNodes(userId, now);

    // 2. Mark misconception detections as resolved
    const misconceptionResult = await this.prisma.misconceptionDetection.updateMany({
      where: {
        userId,
        status: { notIn: ['resolved'] },
      },
      data: {
        status: 'resolved',
        resolvedAt: now,
      },
    });

    this.logger.info(
      {
        userId,
        pkgNodesSoftDeleted: nodesUpdated,
        misconceptionsResolved: misconceptionResult.count,
      },
      'User knowledge graph data soft-deleted'
    );
  }

  // --------------------------------------------------------------------------
  // Hard delete — permanent removal (GDPR)
  // --------------------------------------------------------------------------

  private async hardDeleteUserData(userId: string): Promise<void> {
    // 1. Hard-delete all PKG nodes and edges from Neo4j
    const graphResult = await this.hardDeletePkgGraph(userId);

    // 2. Delete all PostgreSQL records for the user
    // Order: delete children before parents to respect FK constraints.
    //
    // CKG mutation audit logs reference mutations,
    // aggregation evidence references mutations.
    // Delete those first, then mutations.

    // Step 2a: Get mutation IDs for cascading child deletes
    const mutations = await this.prisma.ckgMutation.findMany({
      where: { userId },
      select: { id: true },
    });
    const mutationIds = mutations.map((m) => m.id);

    // Step 2b: Delete mutation children first (FK constraints)
    if (mutationIds.length > 0) {
      await Promise.all([
        this.prisma.ckgMutationAuditLog.deleteMany({
          where: { mutationId: { in: mutationIds } },
        }),
        this.prisma.aggregationEvidence.deleteMany({
          where: { mutationId: { in: mutationIds } },
        }),
      ]);
    }

    // Step 2c: Delete mutations and all other user-scoped records
    const [
      mutationResult,
      operationLogResult,
      metricSnapshotResult,
      stalenessResult,
      misconceptionResult,
    ] = await Promise.all([
      this.prisma.ckgMutation.deleteMany({ where: { userId } }),
      this.prisma.pkgOperationLog.deleteMany({ where: { userId } }),
      this.prisma.structuralMetricSnapshot.deleteMany({ where: { userId } }),
      this.prisma.metricsStaleness.deleteMany({ where: { userId } }),
      this.prisma.misconceptionDetection.deleteMany({ where: { userId } }),
    ]);

    this.logger.info(
      {
        userId,
        pkgNodesDeleted: graphResult.nodesDeleted,
        pkgEdgesDeleted: graphResult.edgesDeleted,
        mutationsDeleted: mutationResult.count,
        operationLogsDeleted: operationLogResult.count,
        metricSnapshotsDeleted: metricSnapshotResult.count,
        stalenessDeleted: stalenessResult.count,
        misconceptionsDeleted: misconceptionResult.count,
      },
      'User knowledge graph data hard-deleted (GDPR)'
    );
  }

  // --------------------------------------------------------------------------
  // Neo4j operations
  // --------------------------------------------------------------------------

  /**
   * Soft-delete all PKG nodes for a user by setting deletedAt.
   * Returns the number of nodes updated.
   */
  private async softDeletePkgNodes(userId: string, deletedAt: Date): Promise<number> {
    const session = this.neo4jClient.getSession({ defaultAccessMode: 'WRITE' });
    try {
      const result = await session.run(
        `MATCH (n:PkgNode {userId: $userId})
         WHERE n.deletedAt IS NULL
         SET n.deletedAt = datetime($deletedAt)
         RETURN count(n) AS updated`,
        { userId, deletedAt: deletedAt.toISOString() }
      );
      return getNeo4jCount(result.records[0], 'updated');
    } finally {
      await session.close();
    }
  }

  /**
   * Hard-delete all PKG nodes and their edges for a user.
   * Returns counts of deleted nodes and relationships.
   */
  private async hardDeletePkgGraph(
    userId: string
  ): Promise<{ nodesDeleted: number; edgesDeleted: number }> {
    const session = this.neo4jClient.getSession({ defaultAccessMode: 'WRITE' });
    try {
      // DETACH DELETE removes the node and all its relationships
      const result = await session.run(
        `MATCH (n:PkgNode {userId: $userId})
         DETACH DELETE n
         RETURN count(n) AS nodesDeleted`,
        { userId }
      );

      const nodesDeleted = getNeo4jCount(result.records[0], 'nodesDeleted');

      // Neo4j's DETACH DELETE doesn't return relationship count,
      // so we report 0 as a conservative estimate.
      // The actual edges are still deleted — they just aren't counted.
      return { nodesDeleted, edgesDeleted: 0 };
    } finally {
      await session.close();
    }
  }
}
