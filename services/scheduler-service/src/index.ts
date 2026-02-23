import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '../generated/prisma/index.js';

import { createToolRegistry, registerToolRoutes } from './agents/tools/index.js';
import { createAuthMiddleware } from './api/middleware/auth.middleware.js';
import { registerHealthRoutes, registerSchedulerRoutes } from './api/rest/index.js';
import { getEventPublisherConfig, loadConfig } from './config/index.js';
import { SchedulerService } from './domain/scheduler-service/scheduler.service.js';
import { RedisEventPublisher } from './infrastructure/cache/redis-event-publisher.js';
import {
  PrismaCalibrationDataRepository,
  PrismaEventReliabilityRepository,
  PrismaProvenanceRepository,
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

  if (config.security.authDisabled && config.service.environment !== 'development') {
    throw new Error('AUTH_DISABLED=true is not allowed outside development environment');
  }

  if (config.security.authDisabled && config.service.environment === 'development') {
    logger.warn('AUTH_DISABLED=true is enabled for development environment');
  }

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
  const provenanceRepo = new PrismaProvenanceRepository(prisma);
  const eventReliabilityRepo = new PrismaEventReliabilityRepository(prisma);

  logger.info('Initialized database repositories');

  const eventPublisher = new RedisEventPublisher(redis, getEventPublisherConfig(config), logger);
  const schedulerService = new SchedulerService(eventPublisher, {
    schedulerCardRepository: schedulerCardRepo,
    reviewRepository: reviewRepo,
    calibrationDataRepository: calibrationDataRepo,
    provenanceRepository: provenanceRepo,
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
      pendingIdleMs: config.redis.consumerPendingIdleMs,
      pendingBatchSize: config.redis.consumerPendingBatchSize,
      drainTimeoutMs: config.redis.consumerDrainTimeoutMs,
      deadLetterStreamKey: config.redis.deadLetterStreamKey,
    },
    {
      schedulerCardRepository: schedulerCardRepo,
      reviewRepository: reviewRepo,
      calibrationDataRepository: calibrationDataRepo,
      reliabilityRepository: eventReliabilityRepo,
      eventPublisher,
    },
    logger
  );
  await eventConsumer.start();

  const toolRegistry = createToolRegistry(schedulerService);

  const fastify = Fastify({
    loggerInstance: logger,
    bodyLimit: config.server.bodyLimitBytes,
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

  const authMiddleware = createAuthMiddleware({
    authDisabled: config.security.authDisabled,
    jwtSecret: config.security.jwtSecret,
    jwksUrl: config.security.jwksUrl,
    issuer: config.security.jwtIssuer,
    expectedAudiences: {
      user: config.security.jwtAudienceUser,
      agent: config.security.jwtAudienceAgent,
      service: config.security.jwtAudienceService,
    },
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
