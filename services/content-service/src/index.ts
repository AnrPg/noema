/**
 * @noema/content-service - Main Entry Point
 *
 * Service bootstrap and dependency injection.
 * Content service verifies JWTs (issued by user-service) — does not create tokens.
 */

import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '../generated/prisma/index.js';

import { createToolRegistry } from './agents/tools/tool.registry.js';
import { registerToolRoutes } from './agents/tools/tool.routes.js';
import { registerContentRoutes } from './api/rest/content.routes.js';
import { registerHealthRoutes } from './api/rest/health.routes.js';
import { registerMediaRoutes } from './api/rest/media.routes.js';
import { registerTemplateRoutes } from './api/rest/template.routes.js';
import {
  getEventPublisherConfig,
  getMinioConfig,
  getTokenVerifierConfig,
  loadConfig,
} from './config/index.js';
import { ContentService } from './domain/content-service/content.service.js';
import { MediaService } from './domain/content-service/media.service.js';
import { TemplateService } from './domain/content-service/template.service.js';
import { AttemptRecordedConsumer } from './events/consumers/attempt-recorded.consumer.js';
import type { BaseEventConsumer } from './events/consumers/base-consumer.js';
import { KgNodeDeletedConsumer } from './events/consumers/kg-node-deleted.consumer.js';
import { UserDeletedConsumer } from './events/consumers/user-deleted.consumer.js';
import { CachedContentRepository } from './infrastructure/cache/cached-content.repository.js';
import { RedisCacheProvider } from './infrastructure/cache/redis-cache.provider.js';
import { RedisEventPublisher } from './infrastructure/cache/redis-event-publisher.js';
import { PrismaContentRepository } from './infrastructure/database/prisma-content.repository.js';
import { PrismaHistoryRepository } from './infrastructure/database/prisma-history.repository.js';
import { PrismaMediaRepository } from './infrastructure/database/prisma-media.repository.js';
import { PrismaTemplateRepository } from './infrastructure/database/prisma-template.repository.js';
import { JwtTokenVerifier } from './infrastructure/external-apis/token-verifier.js';
import { MinioStorageProvider } from './infrastructure/storage/minio-storage.provider.js';
import { createAuthMiddleware } from './middleware/auth.middleware.js';

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

  // Initialize Prisma
  const prisma = new PrismaClient({
    log:
      config.service.environment === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  });

  await prisma.$connect();
  logger.info('Connected to database');

  // Initialize Redis
  const redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  await redis.connect();
  logger.info('Connected to Redis');

  // Create infrastructure instances
  const baseContentRepository = new PrismaContentRepository(prisma);
  const templateRepository = new PrismaTemplateRepository(prisma);
  const mediaRepository = new PrismaMediaRepository(prisma);
  const tokenVerifier = new JwtTokenVerifier(getTokenVerifierConfig(config));
  const eventPublisher = new RedisEventPublisher(redis, getEventPublisherConfig(config), logger);

  // Wrap content repository with read-through cache (conditional)
  const cacheProvider = new RedisCacheProvider(
    redis,
    {
      cardTtl: config.cache.cardTtl,
      queryTtl: config.cache.queryTtl,
      prefix: config.cache.prefix,
    },
    logger
  );
  const contentRepository = config.cache.enabled
    ? new CachedContentRepository(
        baseContentRepository,
        cacheProvider,
        config.cache.cardTtl,
        config.cache.queryTtl
      )
    : baseContentRepository;
  logger.info({ cacheEnabled: config.cache.enabled }, 'Content repository initialized');

  // Initialize MinIO storage
  const minioConfig = getMinioConfig(config);
  const storageProvider = new MinioStorageProvider(minioConfig, logger);
  await storageProvider.ensureBucket();
  logger.info({ bucket: minioConfig.bucket }, 'Connected to object storage');

  // Create services
  const historyRepository = new PrismaHistoryRepository(prisma);
  const contentService = new ContentService(
    contentRepository,
    eventPublisher,
    logger,
    historyRepository
  );
  const templateService = new TemplateService(templateRepository, eventPublisher, logger);
  const mediaService = new MediaService(
    mediaRepository,
    storageProvider,
    eventPublisher,
    minioConfig.bucket,
    minioConfig.presignedUrlExpiry,
    logger
  );

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
        title: 'Noema Content Service API',
        description:
          'Pure card archive with polymorphic JSONB content. Provides CRUD, DeckQuery, batch operations, version history, and statistics.',
        version: SERVICE_VERSION,
      },
      tags: [
        { name: 'Health', description: 'Health check endpoints' },
        { name: 'Cards', description: 'Card CRUD, query, and management endpoints' },
        { name: 'Templates', description: 'Reusable card blueprint endpoints' },
        { name: 'Media', description: 'Media file management endpoints' },
        { name: 'Tools', description: 'MCP tool execution endpoints' },
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

  // Create auth middleware
  const authMiddleware = createAuthMiddleware(tokenVerifier);

  // Create MCP tool registry
  const toolRegistry = createToolRegistry(contentService);
  logger.info({ toolCount: toolRegistry.size }, 'MCP tool registry initialized');

  // Shared route options
  const routeOptions = {
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

  // Register routes
  registerHealthRoutes(fastify as unknown as FastifyInstance, prisma, redis, storageProvider);
  registerContentRoutes(
    fastify as unknown as FastifyInstance,
    contentService,
    authMiddleware,
    routeOptions
  );
  registerTemplateRoutes(
    fastify as unknown as FastifyInstance,
    templateService,
    authMiddleware,
    routeOptions
  );
  registerMediaRoutes(
    fastify as unknown as FastifyInstance,
    mediaService,
    authMiddleware,
    routeOptions
  );
  registerToolRoutes(fastify as unknown as FastifyInstance, toolRegistry, authMiddleware);

  // ==========================================================================
  // Event Consumers
  // ==========================================================================

  const consumers: BaseEventConsumer[] = [];

  if (config.consumers.enabled) {
    const userDeletedConsumer = new UserDeletedConsumer(
      redis,
      prisma,
      logger,
      config.consumers.consumerName,
      config.consumers.streams.userService
    );
    const kgNodeDeletedConsumer = new KgNodeDeletedConsumer(
      redis,
      prisma,
      logger,
      config.consumers.consumerName,
      config.consumers.streams.knowledgeGraphService
    );
    const attemptRecordedConsumer = new AttemptRecordedConsumer(
      redis,
      prisma,
      logger,
      config.consumers.consumerName,
      config.consumers.streams.sessionService
    );

    consumers.push(userDeletedConsumer, kgNodeDeletedConsumer, attemptRecordedConsumer);

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
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Received shutdown signal');

    // Stop consumers first and drain in-flight messages
    for (const consumer of consumers) {
      consumer.stop();
    }
    await Promise.all(consumers.map((c) => c.drain()));

    await fastify.close();
    await redis.quit();
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
