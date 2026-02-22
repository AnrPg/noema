/**
 * @noema/session-service - Main Entry Point
 *
 * Service bootstrap and dependency injection.
 */

import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '../generated/prisma/index.js';

import { createToolRegistry } from './agents/tools/tool.registry.js';
import { registerToolRoutes } from './agents/tools/tool.routes.js';
import { registerHealthRoutes } from './api/rest/health.routes.js';
import { registerSessionRoutes } from './api/rest/session.routes.js';
import { getEventPublisherConfig, loadConfig } from './config/index.js';
import { SessionService } from './domain/session-service/session.service.js';
import { RedisEventPublisher } from './infrastructure/cache/redis-event-publisher.js';
import { PrismaSessionRepository } from './infrastructure/database/prisma-session.repository.js';
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

  // Create infrastructure
  const sessionRepository = new PrismaSessionRepository(prisma, logger);
  const eventPublisher = new RedisEventPublisher(redis, getEventPublisherConfig(config), logger);

  // Create domain service
  const sessionService = new SessionService(sessionRepository, eventPublisher, logger);

  // Create tool registry
  const toolRegistry = createToolRegistry(sessionService);

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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'X-User-Id'],
  });

  // Create auth middleware
  const jwtSecret = process.env['JWT_SECRET'] || process.env['ACCESS_TOKEN_SECRET'] || '';
  const authMiddleware = createAuthMiddleware({
    jwtSecret,
    issuer: process.env['JWT_ISSUER'] || 'noema.app',
    audience: process.env['JWT_AUDIENCE'] || 'noema.app',
  });

  // Register routes
  await registerHealthRoutes(fastify as unknown as FastifyInstance, prisma, redis);
  registerSessionRoutes(
    fastify as unknown as FastifyInstance,
    sessionService,
    authMiddleware
  );
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
