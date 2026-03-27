/**
 * @noema/knowledge-graph-service - Main Entry Point
 *
 * Service bootstrap and dependency injection.
 * Knowledge graph service manages the dual-graph architecture (PKG/CKG)
 * with Neo4j for graph data and PostgreSQL for workflow/metadata.
 * Verifies JWTs (issued by user-service) — does not create tokens.
 */

import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import path from 'node:path';
import pino from 'pino';
import { PrismaClient } from '../generated/prisma/index.js';

import { RedisEventPublisher } from '@noema/events';
import type { BaseEventConsumer } from '@noema/events/consumer';
import { createToolRegistry } from './agents/tools/tool.registry.js';
import { registerToolRoutes } from './agents/tools/tool.routes.js';
import { createAuthMiddleware } from './api/middleware/auth.middleware.js';
import { registerHealthRoutes } from './api/rest/health.routes.js';
import {
  registerCkgEdgeRoutes,
  registerCkgMutationRoutes,
  registerCkgNodeRoutes,
  registerCkgTraversalRoutes,
  registerComparisonRoutes,
  registerMetricsRoutes,
  registerMisconceptionRoutes,
  registerOntologyImportRoutes,
  registerPkgEdgeRoutes,
  registerPkgNodeRoutes,
  registerPkgOperationLogRoutes,
  registerPkgTraversalRoutes,
  registerStructuralHealthRoutes,
} from './api/rest/index.js';
import type { IRouteOptions } from './api/shared/route-helpers.js';
import { getTokenVerifierConfig, loadConfig } from './config/index.js';
import { AgentHintsFactory } from './domain/knowledge-graph-service/agent-hints.factory.js';
import { CkgMutationPipeline } from './domain/knowledge-graph-service/ckg-mutation-pipeline.js';
import type { CkgMutationOperation } from './domain/knowledge-graph-service/ckg-mutation-dsl.js';
import { CkgValidationPipeline } from './domain/knowledge-graph-service/ckg-validation-pipeline.js';
import {
  ConflictDetectionStage,
  EvidenceSufficiencyStage,
  OntologicalConsistencyStage,
  SchemaValidationStage,
  StructuralIntegrityStage,
} from './domain/knowledge-graph-service/ckg-validation-stages.js';
import { KnowledgeGraphService } from './domain/knowledge-graph-service/knowledge-graph.service.impl.js';
import { UserDeletedConsumer } from './events/consumers/index.js';
import { CkgEdgeAuthoringService } from './application/knowledge-graph/edge-authoring/index.js';
import { CkgNodeBatchAuthoringService } from './application/knowledge-graph/node-authoring/index.js';
import {
  NoopNormalizationPublisher,
  OntologyImportsApplicationService,
} from './application/knowledge-graph/ontology-imports/service.js';
import { GraphCanonicalNodeResolver } from './application/knowledge-graph/ontology-imports/mutation-generation/index.js';
import { CachedGraphRepository } from './infrastructure/cache/cached-graph.repository.js';
import { KgRedisCacheProvider } from './infrastructure/cache/kg-redis-cache.provider.js';
import { Neo4jClient } from './infrastructure/database/neo4j-client.js';
import { Neo4jGraphRepository } from './infrastructure/database/neo4j-graph.repository.js';
import { initializeNeo4jSchema } from './infrastructure/database/neo4j-schema.js';
import {
  PrismaAggregationEvidenceRepository,
  PrismaMetricsRepository,
  PrismaMetricsStalenessRepository,
  PrismaMisconceptionRepository,
  PrismaMutationRepository,
  PrismaOntologyImportArtifactRepository,
  PrismaOntologyImportCheckpointRepository,
  PrismaOntologyImportRunRepository,
  PrismaOntologyParsedBatchRepository,
  PrismaOntologySourceRepository,
  PrismaOperationLogRepository,
} from './infrastructure/database/repositories/index.js';
import { JwtTokenVerifier } from './infrastructure/external-apis/token-verifier.js';
import {
  ConceptNetSourceFetcher,
  ConceptNetSourceNormalizer,
  ConceptNetSourceParser,
  EscoSourceFetcher,
  EscoSourceNormalizer,
  EscoSourceParser,
  YagoSourceFetcher,
  YagoSourceNormalizer,
  YagoSourceParser,
} from './infrastructure/ontology-imports/index.js';
import { LocalRawArtifactStore } from './infrastructure/storage/index.js';

import { SERVICE_VERSION } from './api/shared/route-helpers.js';

// ============================================================================
// Bootstrap
// ============================================================================

async function bootstrap(): Promise<void> {
  // Load configuration
  const config = loadConfig();

  // Create logger
  let logger: pino.Logger;
  if (config.logging.pretty) {
    const pinoPretty = await import('pino-pretty');
    logger = pino({ level: config.logging.level }, pinoPretty.default({ colorize: true }));
  } else {
    logger = pino({ level: config.logging.level });
  }

  logger.info(
    { serviceName: config.service.name, version: config.service.version },
    'Starting service'
  );

  const prismaLogQueries = process.env['PRISMA_LOG_QUERIES'] === 'true';

  // Initialize Prisma (PostgreSQL — workflow data)
  const prisma = new PrismaClient({
    log:
      config.service.environment === 'development'
        ? prismaLogQueries
          ? ['query', 'info', 'warn', 'error']
          : ['info', 'warn', 'error']
        : ['error'],
  });

  await prisma.$connect();
  logger.info('Connected to PostgreSQL');

  // Initialize Neo4j (graph database — PKG/CKG)
  const neo4jClient = new Neo4jClient(config.neo4j, logger);
  await neo4jClient.verifyConnectivity();
  logger.info({ uri: config.neo4j.uri, database: config.neo4j.database }, 'Connected to Neo4j');

  // Run Neo4j schema initialization (indexes/constraints — idempotent)
  await initializeNeo4jSchema(neo4jClient, logger);

  // Initialize Redis
  const redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  await redis.connect();
  logger.info('Connected to Redis');

  // Dedicated Redis clients for blocking stream consumers.
  // XREADGROUP with BLOCK must not share the HTTP/cache/rate-limit connection.
  const consumerRedisClients: Redis[] = [];

  // Create Fastify instance
  const fastify = Fastify({
    loggerInstance: logger,
    requestIdHeader: 'x-correlation-id',
    requestIdLogLabel: 'correlationId',
    genReqId: () => `cor_${Date.now().toString(36)}`,
    bodyLimit: config.server.bodyLimit,
    // Detached Windows dev launches redirect stdout/stderr to log files.
    // Per-request logging can flood those files and stall responses.
    disableRequestLogging: true,
  });

  // Register CORS (disabled by default — the API gateway handles CORS.
  // Set CORS_ENABLED=true only when running without the gateway.)
  if (config.cors.enabled) {
    const corsOrigin =
      config.cors.origin.length === 1 && config.cors.origin[0] === '*'
        ? true // Fastify CORS: true = reflect request origin (wildcard)
        : config.cors.origin;
    await fastify.register(cors, {
      origin: corsOrigin,
      credentials: config.cors.origin[0] !== '*' && config.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
    });
  } else {
    logger.info('CORS disabled at service level — handled by API gateway');
    fastify.options('/*', async (_request, reply) => {
      await reply.status(204).send();
    });
  }

  // Register rate limiting
  if (process.env['DISABLE_RATE_LIMIT'] === 'true') {
    logger.warn('Rate limiting disabled via DISABLE_RATE_LIMIT=true');
  } else {
    await fastify.register(rateLimit, {
      max: config.rateLimit.max,
      timeWindow: config.rateLimit.timeWindow,
      redis,
      keyGenerator: (request) => {
        // Try to extract userId from JWT (fast base64 decode — no crypto)
        // for user-scoped rate limiting. Falls back to IP for unauthenticated requests.
        const authHeader = request.headers.authorization;
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
          try {
            const token = authHeader.slice(7);
            const parts = token.split('.');
            if (parts[1] !== undefined && parts[1] !== '') {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as {
                sub?: string;
              };
              if (typeof payload.sub === 'string') return `user:${payload.sub}`;
            }
          } catch (err) {
            logger.debug({ err }, 'JWT parse failed for rate-limit key — falling back to IP');
          }
        }
        return `ip:${request.ip}`;
      },
      errorResponseBuilder: (_request, context) => ({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Retry after ${String(Math.ceil(context.ttl / 1000))} seconds.`,
          details: {
            limit: context.max,
            remaining: 0,
            retryAfterMs: context.ttl,
          },
        },
      }),
    });
    logger.info(
      { max: config.rateLimit.max, timeWindow: config.rateLimit.timeWindow },
      'Rate limiting registered'
    );
  }

  // Register OpenAPI / Swagger
  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Noema Knowledge Graph Service API',
        description:
          'Dual-graph architecture (PKG/CKG) with formally guarded canonical core. Manages knowledge graphs, structural metrics, misconception patterns, and CKG mutation pipeline.',
        version: SERVICE_VERSION,
      },
      tags: [
        { name: 'Health', description: 'Health check endpoints' },
        { name: 'PKG Nodes', description: 'Personal Knowledge Graph node operations' },
        { name: 'PKG Edges', description: 'Personal Knowledge Graph edge operations' },
        {
          name: 'PKG Traversal',
          description: 'PKG subgraph, ancestor, descendant, and path operations',
        },
        { name: 'CKG Nodes', description: 'Canonical Knowledge Graph node read operations' },
        { name: 'CKG Edges', description: 'Canonical Knowledge Graph edge read operations' },
        {
          name: 'CKG Mutations',
          description: 'CKG mutation pipeline (propose, cancel, retry, health)',
        },
        {
          name: 'CKG Traversal',
          description: 'CKG subgraph, ancestor, descendant, and path operations',
        },
        { name: 'Metrics', description: 'Structural metric endpoints' },
        { name: 'Misconceptions', description: 'Misconception detection and lifecycle' },
        { name: 'Structural Health', description: 'Structural health and metacognitive stage' },
        { name: 'PKG Operations', description: 'PKG operation log (audit trail)' },
        { name: 'Comparison', description: 'PKG↔CKG comparison endpoints' },
        {
          name: 'Ontology Imports',
          description: 'Admin ontology source catalog and import-run orchestration',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT token issued by user-service',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });
  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });
  logger.info('OpenAPI documentation registered at /docs');

  // Register routes (Phase 1: health checks only)
  const app = fastify as unknown as FastifyInstance;
  registerHealthRoutes(app, prisma, neo4jClient, redis);

  // --------------------------------------------------------------------------
  // Dependency Injection — Composition Root
  // --------------------------------------------------------------------------

  // 1. Graph repository (Neo4j) with optional Redis cache decorator
  const neo4jGraphRepository = new Neo4jGraphRepository(neo4jClient, logger);

  const cacheProvider = new KgRedisCacheProvider(
    redis,
    {
      entityTtl: config.cache.ttl,
      queryTtl: config.cache.ttl,
      prefix: config.cache.prefix,
    },
    logger
  );

  const graphRepository = config.cache.enabled
    ? new CachedGraphRepository(
        neo4jGraphRepository,
        cacheProvider,
        config.cache.ttl,
        config.cache.ttl
      )
    : neo4jGraphRepository;

  // 2. Prisma repositories (PostgreSQL)
  const metricsRepository = new PrismaMetricsRepository(prisma);
  const mutationRepository = new PrismaMutationRepository(prisma);
  const misconceptionRepository = new PrismaMisconceptionRepository(prisma);
  const operationLogRepository = new PrismaOperationLogRepository(prisma);
  const metricsStalenessRepository = new PrismaMetricsStalenessRepository(prisma);
  const aggregationEvidenceRepository = new PrismaAggregationEvidenceRepository(prisma);
  const ontologySourceRepository = new PrismaOntologySourceRepository(prisma);
  const ontologyImportRunRepository = new PrismaOntologyImportRunRepository(prisma);
  const ontologyImportArtifactRepository = new PrismaOntologyImportArtifactRepository(prisma);
  const ontologyImportCheckpointRepository = new PrismaOntologyImportCheckpointRepository(prisma);
  const ontologyParsedBatchRepository = new PrismaOntologyParsedBatchRepository(prisma);
  const ontologyArtifactRootDirectory = path.join(
    process.cwd(),
    '.data',
    'knowledge-graph-service',
    'ontology-imports'
  );
  const rawArtifactStore = new LocalRawArtifactStore(
    ontologyArtifactRootDirectory,
    ontologyImportArtifactRepository
  );

  // 3. Event publisher (Redis Streams)
  const eventPublisher = new RedisEventPublisher(
    redis,
    {
      streamKey: config.redis.eventStreamKey,
      maxLen: config.redis.maxStreamLen,
      serviceName: config.service.name,
      serviceVersion: config.service.version,
      environment: config.service.environment,
    },
    logger
  );

  // 4. CKG validation pipeline (5 stages, ordered)
  const validationPipeline = new CkgValidationPipeline();
  validationPipeline.addStage(new SchemaValidationStage()); // order 100
  validationPipeline.addStage(new StructuralIntegrityStage(graphRepository)); // order 200
  validationPipeline.addStage(new OntologicalConsistencyStage(graphRepository)); // order 250
  validationPipeline.addStage(new ConflictDetectionStage(mutationRepository)); // order 300
  validationPipeline.addStage(new EvidenceSufficiencyStage(aggregationEvidenceRepository)); // order 400

  // 5. CKG mutation pipeline (orchestrates lifecycle + validation)
  const mutationPipeline = new CkgMutationPipeline(
    mutationRepository,
    graphRepository,
    validationPipeline,
    eventPublisher,
    logger,
    config.mutation.proofStageEnabled
  );

  // 6. Knowledge Graph Service (domain service)
  const service = new KnowledgeGraphService(
    graphRepository,
    operationLogRepository,
    metricsStalenessRepository,
    metricsRepository,
    misconceptionRepository,
    eventPublisher,
    mutationPipeline,
    new AgentHintsFactory(),
    logger
  );
  const ckgEdgeAuthoringService = new CkgEdgeAuthoringService(graphRepository);
  const ckgNodeBatchAuthoringService = new CkgNodeBatchAuthoringService(graphRepository);

  const ontologyImportsService = new OntologyImportsApplicationService(
    ontologySourceRepository,
    ontologyImportRunRepository,
    ontologyImportArtifactRepository,
    ontologyImportCheckpointRepository,
    ontologyParsedBatchRepository,
    new NoopNormalizationPublisher(),
    rawArtifactStore,
    [
      new YagoSourceFetcher(rawArtifactStore, {
        artifactRootDirectory: ontologyArtifactRootDirectory,
      }),
      new EscoSourceFetcher(rawArtifactStore, {
        artifactRootDirectory: ontologyArtifactRootDirectory,
      }),
      new ConceptNetSourceFetcher(rawArtifactStore, {
        artifactRootDirectory: ontologyArtifactRootDirectory,
      }),
    ],
    [
      new YagoSourceParser(ontologyArtifactRootDirectory),
      new EscoSourceParser(ontologyArtifactRootDirectory),
      new ConceptNetSourceParser(ontologyArtifactRootDirectory),
    ],
    [new YagoSourceNormalizer(), new EscoSourceNormalizer(), new ConceptNetSourceNormalizer()],
    {
      canonicalNodeResolver: new GraphCanonicalNodeResolver(graphRepository),
      mutationSubmissionPort: {
        async submitProposal(proposal, context) {
          const proposerId = (context.userId ?? 'agent_unknown') as Parameters<
            typeof mutationPipeline.proposeMutation
          >[0];
          const mutation = await mutationPipeline.proposeMutation(
            proposerId,
            proposal.operations as CkgMutationOperation[],
            proposal.rationale,
            proposal.evidenceCount,
            proposal.priority,
            context
          );

          return {
            mutationId: mutation.mutationId,
          };
        },
      },
    }
  );
  try {
    await ontologyImportsService.ensureDefaultSources();
  } catch (error) {
    logger.warn(
      { error },
      'Ontology import bootstrap is running in degraded mode because the registry tables are not ready yet'
    );
  }

  // --------------------------------------------------------------------------
  // Auth middleware & route wiring
  // --------------------------------------------------------------------------

  const tokenVerifier = new JwtTokenVerifier(getTokenVerifierConfig(config));
  const authMiddleware = createAuthMiddleware(tokenVerifier);

  const routeOptions: IRouteOptions = {
    rateLimit: {
      writeMax: config.rateLimit.writeMax,
      batchMax: config.rateLimit.batchMax,
      timeWindow: config.rateLimit.timeWindow,
    },
    bodyLimits: {
      defaultLimit: config.server.bodyLimit,
      batchLimit: config.server.batchBodyLimit,
    },
  };

  // PKG routes (user-scoped)
  registerPkgNodeRoutes(app, service, authMiddleware, routeOptions);
  registerPkgEdgeRoutes(app, service, authMiddleware, routeOptions);
  registerPkgTraversalRoutes(app, service, authMiddleware, routeOptions);

  // CKG routes (shared graph)
  registerCkgNodeRoutes(app, service, ckgNodeBatchAuthoringService, authMiddleware, routeOptions);
  registerCkgEdgeRoutes(app, service, ckgEdgeAuthoringService, authMiddleware, routeOptions);
  registerCkgTraversalRoutes(app, service, authMiddleware, routeOptions);
  registerCkgMutationRoutes(app, service, authMiddleware, routeOptions);

  // PKG operation log (user-scoped)
  registerPkgOperationLogRoutes(app, service, authMiddleware, routeOptions);

  // User-scoped analytics routes
  registerMetricsRoutes(app, service, authMiddleware, routeOptions);
  registerMisconceptionRoutes(app, service, authMiddleware, routeOptions);
  registerStructuralHealthRoutes(app, service, authMiddleware, routeOptions);
  registerComparisonRoutes(app, service, authMiddleware, routeOptions);
  registerOntologyImportRoutes(app, ontologyImportsService, authMiddleware, routeOptions);

  // MCP Tool Registry (Phase 9)
  const toolRegistry = createToolRegistry(service);
  registerToolRoutes(app, toolRegistry, authMiddleware);

  logger.info(
    { toolCount: toolRegistry.size },
    'MCP tool registry initialized and tool routes registered (Phase 9)'
  );
  logger.info('All API routes registered (Phase 8 Wave 1 + Wave 2 + Phase 9 MCP tools)');

  // ==========================================================================
  // Event Consumers
  // ==========================================================================

  const consumers: BaseEventConsumer[] = [];

  if (config.consumers.enabled) {
    const { consumerName, streams } = config.consumers;
    const userDeletedConsumerRedis = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    await userDeletedConsumerRedis.connect();
    consumerRedisClients.push(userDeletedConsumerRedis);

    const userDeletedConsumer = new UserDeletedConsumer(
      userDeletedConsumerRedis,
      prisma,
      neo4jClient,
      logger,
      consumerName,
      streams.userService
    );

    consumers.push(userDeletedConsumer);

    // Initialize consumer groups (idempotent)
    await Promise.all(consumers.map((c) => c.initialize()));

    // Start consumers (non-blocking — they run in background loops)
    for (const consumer of consumers) {
      consumer.start().catch((error: unknown) => {
        logger.error({ error, consumer: consumer.constructor.name }, 'Consumer crashed');
      });
    }

    logger.info({ consumerCount: consumers.length }, 'Event consumers started');
  }

  // Graceful shutdown
  const SHUTDOWN_TIMEOUT_MS = 10_000;
  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return; // Prevent double-shutdown
    isShuttingDown = true;

    logger.info({ signal }, 'Received shutdown signal');

    // Safety net: force exit if graceful shutdown hangs
    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref(); // Don't keep event loop alive for this timer

    try {
      // Stop consumers first and drain in-flight messages
      for (const consumer of consumers) {
        consumer.stop();
      }
      await Promise.all(consumers.map((c) => c.drain()));

      await fastify.close();
      await Promise.all(consumerRedisClients.map(async (client) => client.quit()));
      await redis.quit();
      await neo4jClient.close();
      await prisma.$disconnect();
      logger.info('Service shutdown complete');
    } catch (shutdownError) {
      logger.error({ error: shutdownError }, 'Error during graceful shutdown');
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  // Crash handlers — log and force exit on unrecoverable errors
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection — shutting down');
    void shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception — shutting down');
    void shutdown('uncaughtException');
  });

  // Start server
  try {
    await fastify.listen({ host: config.server.host, port: config.server.port });
    logger.info({ host: config.server.host, port: config.server.port }, 'Service started');
  } catch (error) {
    logger.fatal({ error }, 'Failed to start service');
    process.exit(1);
  }
}

// Run
bootstrap().catch((error: unknown) => {
  pino().fatal({ error }, 'Fatal error during bootstrap');
  process.exit(1);
});
