import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '../generated/prisma/index.js';

import { createToolRegistry, registerToolRoutes } from './agents/tools/index.js';
import { createAuthMiddleware } from './api/middleware/auth.middleware.js';
import { registerHealthRoutes, registerSchedulerRoutes } from './api/rest/index.js';
import { getEventPublisherConfig, loadConfig } from './config/index.js';
import { SchedulerReadService } from './domain/scheduler-service/scheduler-read.service.js';
import { SchedulerService } from './domain/scheduler-service/scheduler.service.js';
import {
  CardLifecycleConsumer,
  ContentSeededConsumer,
  ReviewRecordedConsumer,
  SessionCohortConsumer,
  SessionLifecycleConsumer,
  SessionStartedConsumer,
  UserDeletedConsumer,
} from './events/consumers/index.js';
import type {
  ISchedulerConsumerDependencies,
  SchedulerBaseConsumer,
} from './events/consumers/scheduler-base-consumer.js';
import { RedisEventPublisher } from './infrastructure/cache/redis-event-publisher.js';
import {
  ensureSchedulerReliabilitySchema,
  PrismaCalibrationDataRepository,
  PrismaEventReliabilityRepository,
  PrismaProvenanceRepository,
  PrismaReviewRepository,
  PrismaSchedulerCardRepository,
} from './infrastructure/database/index.js';
import { schedulerObservability } from './infrastructure/observability/scheduler-observability.js';

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

  const prismaLogQueries = process.env['PRISMA_LOG_QUERIES'] === 'true';

  // Connect to PostgreSQL via Prisma
  const prisma = new PrismaClient({
    datasources: { db: { url: config.database.url } },
    log:
      config.logging.level === 'debug'
        ? prismaLogQueries
          ? ['query', 'error', 'warn']
          : ['error', 'warn']
        : ['error'],
  });
  await prisma.$connect();
  logger.info('Connected to PostgreSQL');

  await ensureSchedulerReliabilitySchema(prisma, logger);

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

  // Phase 3: Read-only service for card state, review history, and forecast
  const schedulerReadService = new SchedulerReadService({
    schedulerCardRepository: schedulerCardRepo,
    reviewRepository: reviewRepo,
  });

  // ==========================================================================
  // Event Consumers
  // ==========================================================================

  const consumerDependencies: ISchedulerConsumerDependencies = {
    schedulerCardRepository: schedulerCardRepo,
    reviewRepository: reviewRepo,
    calibrationDataRepository: calibrationDataRepo,
    reliabilityRepository: eventReliabilityRepo,
    eventPublisher,
  };

  const consumers: SchedulerBaseConsumer[] = [];
  const consumerRedisClients: Redis[] = [];

  if (config.consumers.enabled) {
    const { consumerName, streams } = config.consumers;
    const createConsumerRedisClient = async (): Promise<Redis> => {
      // Stream consumers use BLOCKing XREADGROUP calls and must not share the
      // request-path Redis connection used by health probes and API traffic.
      const consumerRedis = redis.duplicate({
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      await consumerRedis.connect();
      consumerRedisClients.push(consumerRedis);
      return consumerRedis;
    };

    const sessionStartedRedis = await createConsumerRedisClient();
    const reviewRecordedRedis = await createConsumerRedisClient();
    const contentSeededRedis = await createConsumerRedisClient();
    const sessionCohortRedis = await createConsumerRedisClient();
    const cardLifecycleRedis = await createConsumerRedisClient();
    const sessionLifecycleRedis = await createConsumerRedisClient();
    const userDeletedRedis = await createConsumerRedisClient();

    const sessionStartedConsumer = new SessionStartedConsumer(
      sessionStartedRedis,
      logger,
      consumerName,
      streams.sessionService
    );
    const reviewRecordedConsumer = new ReviewRecordedConsumer(
      reviewRecordedRedis,
      logger,
      consumerName,
      streams.sessionService
    );
    const contentSeededConsumer = new ContentSeededConsumer(
      contentSeededRedis,
      logger,
      consumerName,
      streams.contentService
    );
    const sessionCohortConsumer = new SessionCohortConsumer(
      sessionCohortRedis,
      logger,
      consumerName,
      streams.sessionService
    );
    const cardLifecycleConsumer = new CardLifecycleConsumer(
      cardLifecycleRedis,
      logger,
      consumerName,
      streams.contentService
    );
    const sessionLifecycleConsumer = new SessionLifecycleConsumer(
      sessionLifecycleRedis,
      logger,
      consumerName,
      streams.sessionService
    );
    const userDeletedConsumer = new UserDeletedConsumer(
      userDeletedRedis,
      logger,
      consumerName,
      streams.userService
    );

    consumers.push(
      sessionStartedConsumer,
      reviewRecordedConsumer,
      contentSeededConsumer,
      sessionCohortConsumer,
      cardLifecycleConsumer,
      sessionLifecycleConsumer,
      userDeletedConsumer
    );

    // Inject shared dependencies into all scheduler consumers
    for (const consumer of consumers) {
      consumer.setDependencies(consumerDependencies);
    }

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

  const toolRegistry = createToolRegistry(schedulerService, schedulerReadService);

  const fastify = Fastify({
    loggerInstance: logger,
    bodyLimit: config.server.bodyLimitBytes,
    requestIdHeader: 'x-correlation-id',
    requestIdLogLabel: 'correlationId',
    genReqId: () => `cor_${Date.now().toString(36)}`,
    // Background health and metrics polling can flood detached dev logs and
    // starve request handling when pretty printing is enabled.
    disableRequestLogging: true,
  });

  fastify.addHook('onRequest', (request, _reply, done) => {
    (request as FastifyRequest & { startTime?: number }).startTime = Date.now();
    const span = schedulerObservability.startSpan('route.request', {
      traceId: request.id,
      correlationId: request.id,
      component: 'route',
    });
    (
      request as FastifyRequest & { __routeSpan?: { end: (success?: boolean) => number } }
    ).__routeSpan = span;
    done();
  });

  fastify.addHook('onResponse', (request, reply, done) => {
    const startTime = (request as FastifyRequest & { startTime?: number }).startTime ?? Date.now();
    const durationMs = Date.now() - startTime;
    schedulerObservability.recordRequestLatency(durationMs);

    const routeSpan = (
      request as FastifyRequest & { __routeSpan?: { end: (success?: boolean) => number } }
    ).__routeSpan;
    routeSpan?.end(reply.statusCode < 500);
    done();
  });

  // Register CORS (disabled by default — the API gateway handles CORS.
  // Set CORS_ENABLED=true only when running without the gateway.)
  if (config.cors.enabled) {
    await fastify.register(cors, {
      origin: config.cors.origin,
      credentials: config.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'X-User-Id'],
    });
  } else {
    logger.info('CORS disabled at service level — handled by API gateway');
    fastify.options('/*', async (_request, reply) => {
      await reply.status(204).send();
    });
  }

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

  registerHealthRoutes(fastify as unknown as FastifyInstance, redis, prisma, {
    sourceStreamKey: config.consumers.streams.sessionService,
    consumerGroup: 'scheduler-service:session-started',
    deadLetterStreamKey: 'noema:dlq:scheduler-service:session-started',
  });
  registerSchedulerRoutes(
    fastify as unknown as FastifyInstance,
    schedulerService,
    authMiddleware,
    schedulerReadService
  );
  registerToolRoutes(fastify as unknown as FastifyInstance, toolRegistry, authMiddleware);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Received shutdown signal');

    // Stop consumers first and drain in-flight messages
    for (const consumer of consumers) {
      consumer.stop();
    }
    await Promise.all(consumers.map((c) => c.drain()));
    await Promise.all(consumerRedisClients.map((client) => client.quit()));

    await fastify.close();
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
