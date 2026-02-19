/**
 * @noema/user-service - Main Entry Point
 *
 * Service bootstrap and dependency injection.
 */

import { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';

import { registerHealthRoutes } from './api/rest/health.routes.js';
import { registerUserRoutes } from './api/rest/user.routes.js';
import { getEventPublisherConfig, getTokenConfig, loadConfig } from './config/index.js';
import { UserService } from './domain/user-service/user.service.js';
import { RedisEventPublisher } from './infrastructure/cache/redis-event-publisher.js';
import { PrismaUserRepository } from './infrastructure/database/prisma-user.repository.js';
import { JwtTokenService } from './infrastructure/external-apis/token.service.js';
import { createAuthMiddleware } from './middleware/auth.middleware.js';

// ============================================================================
// Bootstrap
// ============================================================================

async function bootstrap(): Promise<void> {
  // Load configuration
  const config = loadConfig();

  // Create logger - use pino-pretty via stream for dev, standard for prod
  let logger: pino.Logger;
  if (config.logging.pretty) {
    // Dynamic import pino-pretty for development
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
  const userRepository = new PrismaUserRepository(prisma);
  const tokenService = new JwtTokenService(getTokenConfig(config));
  const eventPublisher = new RedisEventPublisher(redis, getEventPublisherConfig(config), logger);

  // Create service
  const userService = new UserService(userRepository, eventPublisher, tokenService, logger);

  // Create Fastify instance
  const fastify = Fastify({
    loggerInstance: logger,
    requestIdHeader: 'x-correlation-id',
    requestIdLogLabel: 'correlationId',
    genReqId: () => `cor_${Date.now().toString(36)}`,
  });

  // Create auth middleware
  const authMiddleware = createAuthMiddleware(tokenService);

  // Register routes
  await registerHealthRoutes(fastify as unknown as FastifyInstance, prisma, redis);
  await registerUserRoutes(fastify as unknown as FastifyInstance, userService, authMiddleware);

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
