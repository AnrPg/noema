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
import pino from 'pino';
import { PrismaClient } from '../generated/prisma/index.js';

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
  registerPkgEdgeRoutes,
  registerPkgNodeRoutes,
  registerPkgOperationLogRoutes,
  registerPkgTraversalRoutes,
  registerStructuralHealthRoutes,
} from './api/rest/index.js';
import type { IRouteOptions } from './api/shared/route-helpers.js';
import { getTokenVerifierConfig, loadConfig } from './config/index.js';
import { Neo4jClient } from './infrastructure/database/neo4j-client.js';
import { initializeNeo4jSchema } from './infrastructure/database/neo4j-schema.js';
import { JwtTokenVerifier } from './infrastructure/external-apis/token-verifier.js';

// ============================================================================
// Constants
// ============================================================================

const SERVICE_VERSION = '0.1.0';

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

  // Initialize Prisma (PostgreSQL — workflow data)
  const prisma = new PrismaClient({
    log:
      config.service.environment === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
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

  // Create Fastify instance
  const fastify = Fastify({
    loggerInstance: logger,
    requestIdHeader: 'x-correlation-id',
    requestIdLogLabel: 'correlationId',
    genReqId: () => `cor_${Date.now().toString(36)}`,
    bodyLimit: config.server.bodyLimit,
  });

  // Register CORS
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

  // Register rate limiting
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
        } catch {
          /* fall through to IP */
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
  registerHealthRoutes(fastify as unknown as FastifyInstance, prisma, neo4jClient, redis);

  // --------------------------------------------------------------------------
  // Auth middleware & route wiring (Phase 8 Wave 1)
  // --------------------------------------------------------------------------

  const tokenVerifier = new JwtTokenVerifier(getTokenVerifierConfig(config));
  const authMiddleware = createAuthMiddleware(tokenVerifier);

  // TODO [TECH-DEBT]: Replace stub service with full DI-wired KnowledgeGraphService.
  // The service construction requires wiring together:
  //   - Neo4jGraphRepository (neo4jClient)
  //   - PrismaMetricsRepository (prisma)
  //   - PrismaMutationRepository (prisma)
  //   - PrismaMisconceptionRepository (prisma)
  //   - RedisEventPublisher (redis, config)
  //   - CkgMutationPipeline (with validation stages including OntologicalConsistencyStage)
  //   - MisconceptionDetectionEngine
  // See ADR-008-phase8-api-layer.md for full wiring plan.
  // Phase 8e: OntologicalConsistencyStage (order 250) must be registered via
  //   validationPipeline.addStage(new OntologicalConsistencyStage(graphRepository))
  // For now, routes are registered but will throw at runtime until
  // the service is properly constructed.
  const service = null as unknown as Parameters<typeof registerPkgNodeRoutes>[1];

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
  const f = fastify as unknown as FastifyInstance;
  registerPkgNodeRoutes(f, service, authMiddleware, routeOptions);
  registerPkgEdgeRoutes(f, service, authMiddleware, routeOptions);
  registerPkgTraversalRoutes(f, service, authMiddleware, routeOptions);

  // CKG routes (shared graph)
  registerCkgNodeRoutes(f, service, authMiddleware, routeOptions);
  registerCkgEdgeRoutes(f, service, authMiddleware, routeOptions);
  registerCkgTraversalRoutes(f, service, authMiddleware, routeOptions);
  registerCkgMutationRoutes(f, service, authMiddleware, routeOptions);

  // PKG operation log (user-scoped)
  registerPkgOperationLogRoutes(f, service, authMiddleware, routeOptions);

  // User-scoped analytics routes
  registerMetricsRoutes(f, service, authMiddleware, routeOptions);
  registerMisconceptionRoutes(f, service, authMiddleware, routeOptions);
  registerStructuralHealthRoutes(f, service, authMiddleware, routeOptions);
  registerComparisonRoutes(f, service, authMiddleware, routeOptions);

  logger.info('All API routes registered (Phase 8 Wave 1 + Wave 2)');

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Received shutdown signal');

    await fastify.close();
    await redis.quit();
    await neo4jClient.close();
    await prisma.$disconnect();

    logger.info('Service shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
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
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
