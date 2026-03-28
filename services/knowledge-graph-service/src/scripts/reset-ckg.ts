/**
 * @noema/knowledge-graph-service - CKG Reset Script
 *
 * Explicitly wipes canonical graph state across PostgreSQL staging/workflow
 * tables, Neo4j CKG nodes, Redis CKG cache entries, and local ontology-import
 * artifacts. This is intentionally a manual command rather than a deploy-time
 * migration because it is destructive across multiple datastores.
 */

import { rm } from 'node:fs/promises';
import path from 'node:path';
import { Redis } from 'ioredis';
import pino, { type Logger } from 'pino';
import { PrismaClient } from '../../generated/prisma/index.js';
import { loadConfig } from '../config/index.js';
import { Neo4jClient } from '../infrastructure/database/neo4j-client.js';

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

interface IResetFlags {
  force: boolean;
  includeSources: boolean;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  if (!flags.force) {
    throw new Error(
      'Refusing to reset CKG without --force. Re-run with --force to confirm the wipe.'
    );
  }

  const config = loadConfig();
  const logger = pino({ level: config.logging.level }).child({ script: 'reset-ckg' });
  const prisma = new PrismaClient({
    log: config.service.environment === 'development' ? ['warn', 'error'] : ['error'],
  });
  const neo4jClient = new Neo4jClient(config.neo4j, logger);
  const redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
  const ontologyArtifactRootDirectory = path.join(
    process.cwd(),
    '.data',
    'knowledge-graph-service',
    'ontology-imports'
  );

  try {
    logger.warn(
      { includeSources: flags.includeSources, artifactRoot: ontologyArtifactRootDirectory },
      'Starting destructive CKG reset'
    );

    await prisma.$connect();
    await neo4jClient.verifyConnectivity();
    await redis.connect();

    await truncatePostgresState(prisma, flags.includeSources, logger);
    await wipeNeo4jCkg(neo4jClient, logger);
    await clearRedisCkgCache(redis, config.cache.prefix, logger);
    await rm(ontologyArtifactRootDirectory, { recursive: true, force: true });

    logger.info('CKG reset completed successfully');
  } finally {
    await Promise.allSettled([redis.quit(), neo4jClient.close(), prisma.$disconnect()]);
  }
}

function parseFlags(argv: string[]): IResetFlags {
  return {
    force: argv.includes('--force'),
    includeSources: argv.includes('--include-sources'),
  };
}

async function truncatePostgresState(
  prisma: PrismaClient,
  includeSources: boolean,
  logger: Logger
): Promise<void> {
  const tables: string[] = [...POSTGRES_CKG_TABLES];
  if (includeSources) {
    tables.push(ONTOLOGY_SOURCE_TABLE);
  }

  const sql = `TRUNCATE TABLE ${tables.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`;
  await prisma.$executeRawUnsafe(sql);
  logger.info({ tables }, 'Truncated PostgreSQL CKG tables');
}

async function wipeNeo4jCkg(neo4jClient: Neo4jClient, logger: Logger): Promise<void> {
  const session = neo4jClient.getSession();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run('MATCH (n:CkgNode) DETACH DELETE n');
    });
    logger.info('Deleted Neo4j CKG nodes and relationships');
  } finally {
    await session.close();
  }
}

async function clearRedisCkgCache(
  redis: Redis,
  cachePrefix: string,
  logger: Logger
): Promise<void> {
  for (const pattern of CKG_CACHE_PATTERNS) {
    await deleteByPattern(redis, `${cachePrefix}:${pattern}`);
  }

  logger.info({ patterns: CKG_CACHE_PATTERNS }, 'Cleared Redis CKG cache entries');
}

async function deleteByPattern(redis: Redis, pattern: string): Promise<void> {
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== '0');
}

void main().catch((error: unknown) => {
  const logger = pino();
  logger.error({ error }, 'CKG reset failed');
  process.exit(1);
});
