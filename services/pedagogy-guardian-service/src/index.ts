import cors from '@fastify/cors';
import { RedisEventPublisher } from '@noema/events';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '../generated/prisma/index.js';

import { createToolRegistry } from './agents/tools/tool.registry.js';
import { registerToolRoutes } from './agents/tools/tool.routes.js';
import { registerGuardianRoutes } from './api/rest/guardian.routes.js';
import { registerHealthRoutes } from './api/rest/health.routes.js';
import { getEventPublisherConfig, loadConfig } from './config/index.js';
import { PedagogyGuardianService } from './domain/pedagogy-guardian-service/index.js';
import { PrismaGuardianRepository } from './infrastructure/database/index.js';
import { createAuthMiddleware } from './middleware/auth.middleware.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = config.logging.pretty
    ? pino(
        { level: config.logging.level },
        (await import('pino-pretty')).default({ colorize: true })
      )
    : pino({ level: config.logging.level });

  const authDisabled = process.env['AUTH_DISABLED'] === 'true';
  const jwtSecret = process.env['JWT_SECRET'] ?? process.env['ACCESS_TOKEN_SECRET'] ?? '';
  const isDevLikeEnvironment =
    config.service.environment === 'development' || config.service.environment === 'test';

  if (authDisabled && !isDevLikeEnvironment) {
    throw new Error('AUTH_DISABLED=true is only allowed in development or test environments');
  }
  if (!authDisabled && jwtSecret.trim().length === 0) {
    throw new Error('JWT_SECRET or ACCESS_TOKEN_SECRET is required when authentication is enabled');
  }

  const prisma = new PrismaClient({
    log: config.service.environment === 'development' ? ['info', 'warn', 'error'] : ['error'],
  });
  await prisma.$connect();

  const redis = new Redis(config.redis.url, { maxRetriesPerRequest: 3, lazyConnect: true });
  await redis.connect();

  const repository = new PrismaGuardianRepository(prisma);
  const eventPublisher = new RedisEventPublisher(redis, getEventPublisherConfig(config), logger);
  const guardianService = new PedagogyGuardianService(repository, eventPublisher, logger);
  const toolRegistry = createToolRegistry(guardianService);

  const fastify = Fastify({
    loggerInstance: logger,
    requestIdHeader: 'x-correlation-id',
    requestIdLogLabel: 'correlationId',
    genReqId: () => `correlation_${Date.now().toString(36)}`,
    bodyLimit: config.server.bodyLimit,
    disableRequestLogging: true,
  });

  if (config.cors.enabled) {
    await fastify.register(cors, {
      origin:
        config.cors.origin.length === 1 && config.cors.origin[0] === '*'
          ? true
          : config.cors.origin,
      credentials: config.cors.origin[0] !== '*' && config.cors.credentials,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'X-User-Id'],
    });
  } else {
    fastify.options('/*', async (_request, reply) => {
      await reply.status(204).send();
    });
  }

  const authMiddleware = createAuthMiddleware({
    jwtSecret,
    issuer: config.auth.issuer,
    audience: config.auth.audience,
  });

  registerHealthRoutes(fastify as unknown as FastifyInstance, prisma, redis);
  registerGuardianRoutes(fastify as unknown as FastifyInstance, guardianService, authMiddleware);
  registerToolRoutes(fastify as unknown as FastifyInstance, toolRegistry, authMiddleware);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Received shutdown signal');
    await fastify.close();
    await redis.quit();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  await fastify.listen({ host: config.server.host, port: config.server.port });
  logger.info(
    { host: config.server.host, port: config.server.port },
    'Pedagogy Guardian service started'
  );
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
