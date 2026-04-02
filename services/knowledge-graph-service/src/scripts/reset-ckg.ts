/**
 * @noema/knowledge-graph-service - CKG Reset Script
 *
 * Explicitly wipes canonical graph state across PostgreSQL staging/workflow
 * tables, Neo4j CKG nodes, Redis CKG cache entries, and local ontology-import
 * artifacts. This is intentionally a manual command rather than a deploy-time
 * migration because it is destructive across multiple datastores.
 */

import path from 'node:path';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '../../generated/prisma/index.js';
import { loadConfig } from '../config/index.js';
import { Neo4jClient } from '../infrastructure/database/neo4j-client.js';
import { CkgResetService } from '../infrastructure/maintenance/index.js';

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

    const resetService = new CkgResetService(
      prisma,
      neo4jClient,
      redis,
      config.cache.prefix,
      ontologyArtifactRootDirectory,
      logger
    );

    await resetService.reset({ includeSources: flags.includeSources });

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

void main().catch((error: unknown) => {
  const logger = pino();
  logger.error({ error }, 'CKG reset failed');
  process.exit(1);
});
