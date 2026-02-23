import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '../generated/prisma/index.js';

import { createToolRegistry, registerToolRoutes } from './agents/tools/index.js';
import { createAuthMiddleware } from './api/middleware/auth.middleware.js';
import { registerHealthRoutes, registerSchedulerRoutes } from './api/rest/index.js';
import { getEventPublisherConfig, loadConfig } from './config/index.js';
import {
  SchedulerService,
  type ISchedulerServiceConfig,
} from './domain/scheduler-service/scheduler.service.js';
import { RedisEventPublisher } from './infrastructure/cache/redis-event-publisher.js';
import {
  PrismaCalibrationDataRepository,
  PrismaReviewRepository,
  PrismaSchedulerCardRepository,
} from './infrastructure/database/index.js';
import { SchedulerEventConsumer } from './infrastructure/events/index.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();

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

  const redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  await redis.connect();
  logger.info('Connected to Redis');

  // Connect to PostgreSQL via Prisma
  const prisma = new PrismaClient({
    datasources: { db: { url: config.database.url } },
    log: config.logging.level === 'debug' ? ['query', 'error', 'warn'] : ['error'],
  });
  await prisma.$connect();
  logger.info('Connected to PostgreSQL');

  const schedulerCardRepo = new PrismaSchedulerCardRepository(prisma);
  const reviewRepo = new PrismaReviewRepository(prisma);
  const calibrationDataRepo = new PrismaCalibrationDataRepository(prisma);

  logger.info('Initialized database repositories');

  const eventPublisher = new RedisEventPublisher(redis, getEventPublisherConfig(config), logger);
  const serviceConfig: ISchedulerServiceConfig = {
    serviceVersion: config.service.version,
    offlineIntentTokenActiveKeyId: config.security.offlineIntentTokenActiveKeyId,
    offlineIntentTokenKeys: config.security.offlineIntentTokenKeys,
    offlineIntentTokenIssuer: config.security.offlineIntentTokenIssuer,
    offlineIntentTokenAudience: config.security.offlineIntentTokenAudience,
  };
  const schedulerService = new SchedulerService(eventPublisher, serviceConfig, {
    schedulerCardRepository: schedulerCardRepo,
    reviewRepository: reviewRepo,
    calibrationDataRepository: calibrationDataRepo,
  });

  const eventConsumer = new SchedulerEventConsumer(
    redis,
    {
      sourceStreamKey: config.redis.sourceStreamKey,
      consumerGroup: config.redis.consumerGroup,
      consumerName: config.redis.consumerName,
      blockMs: config.redis.consumerBlockMs,
      batchSize: config.redis.consumerBatchSize,
      retryBaseDelayMs: config.redis.consumerRetryBaseDelayMs,
      maxProcessAttempts: config.redis.consumerMaxProcessAttempts,
      deadLetterStreamKey: config.redis.deadLetterStreamKey,
    },
    {
      schedulerCardRepository: schedulerCardRepo,
      reviewRepository: reviewRepo,
      calibrationDataRepository: calibrationDataRepo,
    },
    logger
  );
  await eventConsumer.start();

  const toolRegistry = createToolRegistry(schedulerService);

  const fastify = Fastify({
    loggerInstance: logger,
    requestIdHeader: 'x-correlation-id',
    requestIdLogLabel: 'correlationId',
    genReqId: () => `cor_${Date.now().toString(36)}`,
  });

  await fastify.register(cors, {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'X-User-Id'],
  });

  const jwtSecret = process.env['JWT_SECRET'] ?? process.env['ACCESS_TOKEN_SECRET'] ?? '';
  const authMiddleware = createAuthMiddleware({
    jwtSecret,
    issuer: process.env['JWT_ISSUER'] ?? 'noema.app',
    audience: process.env['JWT_AUDIENCE'] ?? 'noema.app',
  });

  registerHealthRoutes(fastify as unknown as FastifyInstance, redis, prisma);
  registerSchedulerRoutes(fastify as unknown as FastifyInstance, schedulerService, authMiddleware);
  registerToolRoutes(fastify as unknown as FastifyInstance, toolRegistry, authMiddleware);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Received shutdown signal');

    await fastify.close();
    await eventConsumer.stop();
    await prisma.$disconnect();
    await redis.quit();

    logger.info('Service shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  try {
    await fastify.listen({ host: config.server.host, port: config.server.port });
    logger.info({ host: config.server.host, port: config.server.port }, 'Service started');
  } catch (error: unknown) {
    logger.fatal({ error }, 'Failed to start service');
    process.exit(1);
  }
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
