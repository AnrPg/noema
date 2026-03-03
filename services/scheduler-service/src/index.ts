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

  if (config.consumers.enabled) {
    const { consumerName, streams } = config.consumers;

    const sessionStartedConsumer = new SessionStartedConsumer(
      redis,
      logger,
      consumerName,
      streams.sessionService
    );
    const reviewRecordedConsumer = new ReviewRecordedConsumer(
      redis,
      logger,
      consumerName,
      streams.sessionService
    );
    const contentSeededConsumer = new ContentSeededConsumer(
      redis,
      logger,
      consumerName,
      streams.contentService
    );
    const sessionCohortConsumer = new SessionCohortConsumer(
      redis,
      logger,
      consumerName,
      streams.sessionService
    );
    const cardLifecycleConsumer = new CardLifecycleConsumer(
      redis,
      logger,
      consumerName,
      streams.contentService
    );
    const sessionLifecycleConsumer = new SessionLifecycleConsumer(
      redis,
      logger,
      consumerName,
      streams.sessionService
    );
    const userDeletedConsumer = new UserDeletedConsumer(
      redis,
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

  const toolRegistry = createToolRegistry(schedulerService);

  const fastify = Fastify({
    loggerInstance: logger,
    bodyLimit: config.server.bodyLimitBytes,
    requestIdHeader: 'x-correlation-id',
    requestIdLogLabel: 'correlationId',
    genReqId: () => `cor_${Date.now().toString(36)}`,
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
