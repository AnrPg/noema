import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '../generated/prisma/index.js';
import { RedisEventPublisher } from '@noema/events';

import { registerGamificationRoutes } from './api/rest/gamification.routes.js';
import { registerHealthRoutes } from './api/rest/health.routes.js';
import { getEventPublisherConfig, loadConfig } from './config/index.js';
import { GamificationService } from './domain/gamification-service/index.js';
import {
  ConceptStateChangedConsumer,
  EvaluationRecordedConsumer,
  SessionCompletedConsumer,
} from './events/consumers/index.js';
import { PrismaGamificationRepository } from './infrastructure/database/index.js';
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
    log: config.service.environment === 'development' ? ['warn', 'error'] : ['error'],
  });
  await prisma.$connect();

  const redis = new Redis(config.redis.url, { maxRetriesPerRequest: 3, lazyConnect: true });
  await redis.connect();

  const repository = new PrismaGamificationRepository(prisma);
  const eventPublisher = new RedisEventPublisher(redis, getEventPublisherConfig(config), logger);
  const gamificationService = new GamificationService(repository, eventPublisher, logger, {
    xpMultiplier: config.gamification.xpMultiplier,
    streakThreshold: config.gamification.streakThreshold,
    levelThresholds: config.gamification.levelThresholds,
    capabilityTierThresholds: config.gamification.capabilityTierThresholds,
  });

  const consumers: (
    | EvaluationRecordedConsumer
    | ConceptStateChangedConsumer
    | SessionCompletedConsumer
  )[] = [];
  const consumerRedisClients: Redis[] = [];

  if (config.consumers.enabled) {
    const consumerRedis = redis.duplicate({ maxRetriesPerRequest: 3, lazyConnect: true });
    await consumerRedis.connect();
    consumerRedisClients.push(consumerRedis);

    const evaluationConsumer = new EvaluationRecordedConsumer(
      consumerRedis,
      logger,
      config.consumers.consumerName,
      gamificationService,
      config.consumers.streams.metacognitionService
    );
    const conceptStateConsumer = new ConceptStateChangedConsumer(
      consumerRedis,
      logger,
      config.consumers.consumerName,
      gamificationService,
      config.consumers.streams.knowledgeGraphService
    );
    const sessionCompletedConsumer = new SessionCompletedConsumer(
      consumerRedis,
      logger,
      config.consumers.consumerName,
      gamificationService,
      config.consumers.streams.sessionService
    );
    consumers.push(evaluationConsumer, conceptStateConsumer, sessionCompletedConsumer);
    await Promise.all(consumers.map((consumer) => consumer.initialize()));
    consumers.forEach((consumer) => {
      consumer.start().catch((error: unknown) => {
        logger.error({ error, consumer: consumer.constructor.name }, 'Consumer crashed');
      });
    });
  }

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
      methods: ['GET', 'OPTIONS'],
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
  registerGamificationRoutes(
    fastify as unknown as FastifyInstance,
    gamificationService,
    authMiddleware
  );

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Received shutdown signal');
    for (const consumer of consumers) consumer.stop();
    await Promise.all(consumers.map((consumer) => consumer.drain()));
    await Promise.all(consumerRedisClients.map((client) => client.quit()));
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
    'Gamification service started'
  );
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
