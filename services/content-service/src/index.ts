/**
 * @noema/content-service - Main Entry Point
 *
 * Service bootstrap and dependency injection.
 * Content service verifies JWTs (issued by user-service) — does not create tokens.
 */

import cors from '@fastify/cors';
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
import { RedisEventPublisher } from './infrastructure/cache/redis-event-publisher.js';
import { PrismaContentRepository } from './infrastructure/database/prisma-content.repository.js';
import { PrismaMediaRepository } from './infrastructure/database/prisma-media.repository.js';
import { PrismaTemplateRepository } from './infrastructure/database/prisma-template.repository.js';
import { JwtTokenVerifier } from './infrastructure/external-apis/token-verifier.js';
import { MinioStorageProvider } from './infrastructure/storage/minio-storage.provider.js';
import { createAuthMiddleware } from './middleware/auth.middleware.js';

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
  const contentRepository = new PrismaContentRepository(prisma);
  const templateRepository = new PrismaTemplateRepository(prisma);
  const mediaRepository = new PrismaMediaRepository(prisma);
  const tokenVerifier = new JwtTokenVerifier(getTokenVerifierConfig(config));
  const eventPublisher = new RedisEventPublisher(redis, getEventPublisherConfig(config), logger);

  // Initialize MinIO storage
  const minioConfig = getMinioConfig(config);
  const storageProvider = new MinioStorageProvider(minioConfig, logger);
  await storageProvider.ensureBucket();
  logger.info({ bucket: minioConfig.bucket }, 'Connected to object storage');

  // Create services
  const contentService = new ContentService(contentRepository, eventPublisher, logger);
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

  // Create auth middleware
  const authMiddleware = createAuthMiddleware(tokenVerifier);

  // Create MCP tool registry
  const toolRegistry = createToolRegistry(contentService);
  logger.info({ toolCount: toolRegistry.size }, 'MCP tool registry initialized');

  // Register routes
  registerHealthRoutes(fastify as unknown as FastifyInstance, prisma, redis);
  registerContentRoutes(fastify as unknown as FastifyInstance, contentService, authMiddleware);
  registerTemplateRoutes(fastify as unknown as FastifyInstance, templateService, authMiddleware);
  registerMediaRoutes(fastify as unknown as FastifyInstance, mediaService, authMiddleware);
  registerToolRoutes(fastify as unknown as FastifyInstance, toolRegistry, authMiddleware);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Received shutdown signal');

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
