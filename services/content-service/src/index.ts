/**
 * @noema/content-service - Main Entry Point
 *
 * Service bootstrap and dependency injection.
 * Content service verifies JWTs (issued by user-service) — does not create tokens.
 */

import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';

import { registerHealthRoutes } from './api/rest/health.routes.js';
import { registerContentRoutes } from './api/rest/content.routes.js';
import { getEventPublisherConfig, getTokenVerifierConfig, loadConfig } from './config/index.js';
import { ContentService } from './domain/content-service/content.service.js';
import { RedisEventPublisher } from './infrastructure/cache/redis-event-publisher.js';
import { PrismaContentRepository } from './infrastructure/database/prisma-content.repository.js';
import { JwtTokenVerifier } from './infrastructure/external-apis/token-verifier.js';
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
  const tokenVerifier = new JwtTokenVerifier(getTokenVerifierConfig(config));
  const eventPublisher = new RedisEventPublisher(redis, getEventPublisherConfig(config), logger);

  // Create service
  const contentService = new ContentService(contentRepository, eventPublisher, logger);

  // Create Fastify instance
  const fastify = Fastify({
    loggerInstance: logger,
    requestIdHeader: 'x-correlation-id',
    requestIdLogLabel: 'correlationId',
    genReqId: () => `cor_${Date.now().toString(36)}`,
  });

  // Register CORS
  await fastify.register(cors, {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
  });

  // Create auth middleware
  const authMiddleware = createAuthMiddleware(tokenVerifier);

  // Register routes
  await registerHealthRoutes(fastify as unknown as FastifyInstance, prisma, redis);
  await registerContentRoutes(fastify as unknown as FastifyInstance, contentService, authMiddleware);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Received shutdown signal');

    await fastify.close();
    await redis.quit();
    await prisma.$disconnect();

    logger.info('Service shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

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
bootstrap().catch((error) => {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
