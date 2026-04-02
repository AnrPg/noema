import { rm } from 'node:fs/promises';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import type {
  ICkgResetInput,
  ICkgResetPort,
  ICkgResetResult,
} from '../../application/knowledge-graph/maintenance/contracts.js';
import type { Neo4jClient } from '../database/neo4j-client.js';

const POSTGRES_CKG_TABLES = [
  'aggregation_evidence',
  'ckg_mutation_audit_log',
  'ckg_mutations',
  'ontology_parsed_batches',
  'ontology_import_checkpoints',
  'ontology_import_artifacts',
  'ontology_import_runs',
] as const;

const ONTOLOGY_SOURCE_TABLE = 'ontology_import_sources';
const CKG_CACHE_PATTERNS = [
  'ckg:*',
  'siblings:ckg:*',
  'co-parents:ckg:*',
  'neighborhood:ckg:*',
  'domain-subgraph:ckg:*',
  'common-ancestors:ckg:*',
  'centrality-degree:ckg:*',
] as const;

interface IResetLogger {
  info(obj: unknown, msg?: string): void;
}

export class CkgResetService implements ICkgResetPort {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly neo4jClient: Neo4jClient,
    private readonly redis: Redis,
    private readonly cachePrefix: string,
    private readonly artifactRootDirectory: string,
    private readonly logger: IResetLogger
  ) {}

  async reset(input?: ICkgResetInput): Promise<ICkgResetResult> {
    const includeSources = input?.includeSources ?? false;
    const truncatedTables = await this.truncatePostgresState(includeSources);
    const deletedNeo4jCkgNodes = await this.wipeNeo4jCkg();
    await this.clearRedisCkgCache();
    await rm(this.artifactRootDirectory, { recursive: true, force: true });

    const result: ICkgResetResult = {
      includeSources,
      truncatedTables,
      deletedNeo4jCkgNodes,
      clearedCachePatterns: [...CKG_CACHE_PATTERNS],
      artifactRootDirectory: this.artifactRootDirectory,
      resetAt: new Date().toISOString(),
    };

    this.logger.info(
      {
        includeSources,
        truncatedTables,
        deletedNeo4jCkgNodes,
        artifactRootDirectory: this.artifactRootDirectory,
      },
      'Reset canonical knowledge graph contents'
    );

    return result;
  }

  private async truncatePostgresState(includeSources: boolean): Promise<string[]> {
    const tables: string[] = [...POSTGRES_CKG_TABLES];
    if (includeSources) {
      tables.push(ONTOLOGY_SOURCE_TABLE);
    }

    const sql = `TRUNCATE TABLE ${tables.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`;
    await this.prisma.$executeRawUnsafe(sql);
    return tables;
  }

  private async wipeNeo4jCkg(): Promise<number> {
    const session = this.neo4jClient.getSession();
    try {
      const countResult = await session.executeRead(async (tx) =>
        tx.run('MATCH (n:CkgNode) RETURN count(n) AS count')
      );
      const deletedNeo4jCkgNodes = Number(countResult.records[0]?.get('count') ?? 0);

      await session.executeWrite(async (tx) => {
        await tx.run('MATCH (n:CkgNode) DETACH DELETE n');
      });

      return deletedNeo4jCkgNodes;
    } finally {
      await session.close();
    }
  }

  private async clearRedisCkgCache(): Promise<void> {
    for (const pattern of CKG_CACHE_PATTERNS) {
      await this.deleteByPattern(this.withPrefix(pattern));
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
