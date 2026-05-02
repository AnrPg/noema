import type { Redis } from 'ioredis';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import type {
  IPkgMaintenancePort,
  IPkgResetInput,
  IPkgResetResult,
} from '../../application/knowledge-graph/pkg-maintenance/contracts.js';
import type { Neo4jClient } from '../database/neo4j-client.js';

const PKG_CACHE_PATTERNS = [
  (userId: string) => `siblings:${userId}:*`,
  (userId: string) => `co-parents:${userId}:*`,
  (userId: string) => `neighborhood:${userId}:*`,
  (userId: string) => `domain-subgraph:${userId}:*`,
  (userId: string) => `frontier:${userId}:*`,
  (userId: string) => `common-ancestors:${userId}:*`,
  (userId: string) => `centrality-degree:${userId}:*`,
] as const;

interface IResetLogger {
  info(obj: unknown, msg?: string): void;
}

export class PkgResetService implements IPkgMaintenancePort {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly neo4jClient: Neo4jClient,
    private readonly redis: Redis,
    private readonly cachePrefix: string,
    private readonly logger: IResetLogger
  ) {}

  async reset(input: IPkgResetInput): Promise<IPkgResetResult> {
    const graphCounts = await this.countUserGraph(input.userId);
    await this.deleteUserGraph(input.userId);

    const [
      operationLogs,
      metricSnapshots,
      metricsStaleness,
      misconceptions,
      aggregationEvidence,
    ] = await Promise.all([
      this.prisma.pkgOperationLog.deleteMany({ where: { userId: input.userId } }),
      this.prisma.structuralMetricSnapshot.deleteMany({ where: { userId: input.userId } }),
      this.prisma.metricsStaleness.deleteMany({ where: { userId: input.userId } }),
      this.prisma.misconceptionDetection.deleteMany({ where: { userId: input.userId } }),
      this.prisma.aggregationEvidence.deleteMany({ where: { sourceUserId: input.userId } }),
    ]);

    const clearedCachePatterns = PKG_CACHE_PATTERNS.map((buildPattern) => buildPattern(input.userId));
    for (const pattern of clearedCachePatterns) {
      await this.deleteByPattern(this.withPrefix(pattern));
    }

    const result: IPkgResetResult = {
      userId: input.userId,
      deletedNeo4jPkgNodes: graphCounts.nodes,
      deletedNeo4jPkgEdges: graphCounts.edges,
      deletedOperationLogCount: operationLogs.count,
      deletedMetricSnapshotCount: metricSnapshots.count,
      deletedMetricsStalenessCount: metricsStaleness.count,
      deletedMisconceptionCount: misconceptions.count,
      deletedAggregationEvidenceCount: aggregationEvidence.count,
      clearedCachePatterns,
      resetAt: new Date().toISOString(),
    };

    this.logger.info(
      {
        userId: input.userId,
        deletedNeo4jPkgNodes: result.deletedNeo4jPkgNodes,
        deletedNeo4jPkgEdges: result.deletedNeo4jPkgEdges,
      },
      'Reset personal knowledge graph contents'
    );

    return result;
  }

  private async countUserGraph(userId: string): Promise<{ nodes: number; edges: number }> {
    const session = this.neo4jClient.getSession();
    try {
      const result = await session.executeRead(async (tx) =>
        tx.run(
          `MATCH (n:PkgNode {userId: $userId})
           WHERE coalesce(n.isDeleted, false) = false
           OPTIONAL MATCH (n)-[r]-()
           WHERE coalesce(r.isDeleted, false) = false
           RETURN count(DISTINCT n) AS nodeCount, count(DISTINCT r) AS edgeCount`,
          { userId }
        )
      );

      return {
        nodes: Number(result.records[0]?.get('nodeCount') ?? 0),
        edges: Number(result.records[0]?.get('edgeCount') ?? 0),
      };
    } finally {
      await session.close();
    }
  }

  private async deleteUserGraph(userId: string): Promise<void> {
    const session = this.neo4jClient.getSession();
    try {
      await session.executeWrite(async (tx) => {
        await tx.run(
          `MATCH (n:PkgNode {userId: $userId})
           DETACH DELETE n`,
          { userId }
        );
      });
    } finally {
      await session.close();
    }
  }

  private withPrefix(pattern: string): string {
    return this.cachePrefix === '' ? pattern : `${this.cachePrefix}:${pattern}`;
  }

  private async deleteByPattern(pattern: string): Promise<void> {
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }
}
