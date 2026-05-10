import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '../generated/prisma/index.js';

import { createToolRegistry } from './agents/tools/tool.registry.js';
import { registerToolRoutes } from './agents/tools/tool.routes.js';
import { createAuthMiddleware } from './api/middleware/auth.middleware.js';
import { registerHealthRoutes, registerSchedulerRoutes } from './api/rest/index.js';
import { getEventPublisherConfig, loadConfig } from './config/index.js';
import { SchedulerService } from './domain/scheduler-service/scheduler.service.js';
import { MetacognitionEvaluationRecordedConsumer } from './events/consumers/index.js';
import { RedisEventPublisher } from './infrastructure/cache/redis-event-publisher.js';
import { PrismaConceptScheduleRepository } from './infrastructure/database/index.js';
import { schedulerObservability } from './infrastructure/observability/scheduler-observability.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = config.logging.pretty
    ? pino(
        { level: config.logging.level },
        (await import('pino-pretty')).default({ colorize: true })
      )
    : pino({ level: config.logging.level });

  logger.info(
    { serviceName: config.service.name, version: config.service.version },
    'Starting scheduler-service'
  );

  if (config.security.authDisabled && config.service.environment !== 'development') {
    throw new Error('AUTH_DISABLED=true is not allowed outside development environment');
  }

  const redis = new Redis(config.redis.url, { maxRetriesPerRequest: 3, lazyConnect: true });
  await redis.connect();

  const prisma = new PrismaClient({
    datasources: { db: { url: config.database.url } },
    log: config.logging.level === 'debug' ? ['error', 'warn'] : ['error'],
  });
  await prisma.$connect();

  const repository = new PrismaConceptScheduleRepository(prisma);
  const eventPublisher = new RedisEventPublisher(redis, getEventPublisherConfig(config), logger);
  const schedulerService = new SchedulerService(repository, eventPublisher, logger);
  const toolRegistry = createToolRegistry(schedulerService);

  const consumers: MetacognitionEvaluationRecordedConsumer[] = [];
  const consumerRedisClients: Redis[] = [];

  if (config.consumers.enabled) {
    const consumerRedis = redis.duplicate({ maxRetriesPerRequest: 3, lazyConnect: true });
    await consumerRedis.connect();
    consumerRedisClients.push(consumerRedis);

    const consumer = new MetacognitionEvaluationRecordedConsumer(
      consumerRedis,
      logger,
      config.consumers.consumerName,
      schedulerService,
      config.consumers.streams.metacognitionService
    );
    consumers.push(consumer);
    await consumer.initialize();
    consumer.start().catch((error: unknown) => {
      logger.error({ error, consumer: consumer.constructor.name }, 'Consumer crashed');
    });
  }

  const fastify = Fastify({
    loggerInstance: logger,
    bodyLimit: config.server.bodyLimitBytes,
    requestIdHeader: 'x-correlation-id',
    requestIdLogLabel: 'correlationId',
    genReqId: () => `cor_${Date.now().toString(36)}`,
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
    schedulerObservability.recordRequestLatency(Date.now() - startTime);
    const routeSpan = (
      request as FastifyRequest & { __routeSpan?: { end: (success?: boolean) => number } }
    ).__routeSpan;
    routeSpan?.end(reply.statusCode < 500);
    done();
  });

  if (config.cors.enabled) {
    await fastify.register(cors, {
      origin: config.cors.origin,
      credentials: config.cors.credentials,
      methods: ['GET', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'X-User-Id'],
    });
  } else {
    fastify.options('/*', async (_request, reply) => {
      await reply.status(204).send();
    });
  }

  fastify.addHook(
    'preHandler',
    createAuthMiddleware({
      authDisabled: config.security.authDisabled,
      jwtSecret: config.security.jwtSecret,
      jwksUrl: config.security.jwksUrl,
      issuer: config.security.jwtIssuer,
      expectedAudiences: {
        user: config.security.jwtAudienceUser,
        agent: config.security.jwtAudienceAgent,
        service: config.security.jwtAudienceService,
      },
    })
  );

  registerHealthRoutes(fastify as unknown as FastifyInstance, redis, prisma, {
    sourceStreamKey: config.consumers.streams.metacognitionService,
    consumerGroup: 'scheduler-service:metacognition-evaluation-recorded',
    deadLetterStreamKey: 'noema:dlq:scheduler-service:metacognition-evaluation-recorded',
  });
  await registerSchedulerRoutes(fastify as unknown as FastifyInstance, schedulerService);
  registerToolRoutes(fastify as unknown as FastifyInstance, toolRegistry);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Received shutdown signal');
    for (const consumer of consumers) consumer.stop();
    await Promise.all(consumers.map((consumer) => consumer.drain()));
    await Promise.all(consumerRedisClients.map((client) => client.quit()));
    await fastify.close();
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  await fastify.listen({ host: config.server.host, port: config.server.port });
  logger.info({ host: config.server.host, port: config.server.port }, 'Scheduler service started');
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
