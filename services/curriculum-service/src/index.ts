/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '../generated/prisma/index.js';
import { RedisEventPublisher } from '@noema/events';
import { createToolRegistry } from './agents/tools/tool.registry.js';
import { registerToolRoutes } from './agents/tools/tool.routes.js';
import { registerCurriculumRoutes } from './api/rest/curriculum.routes.js';
import { registerHealthRoutes } from './api/rest/health.routes.js';
import { getEventPublisherConfig, loadConfig } from './config/index.js';
import { CurriculumService } from './domain/curriculum-service/curriculum.service.js';
import type { CurriculumEventPublisherPort } from './domain/curriculum-service/event-publisher.port.js';
import { PrismaCurriculumRepository } from './infrastructure/database/prisma-curriculum.repository.js';
import { PrismaOutboxRepository } from './infrastructure/database/prisma-outbox.repository.js';
import { CurriculumOutboxEventPublisher } from './infrastructure/events/curriculum-outbox-event-publisher.js';
import { CurriculumOutboxWorker } from './infrastructure/events/curriculum-outbox-worker.js';
import { MetacognitionCurriculumConsumer } from './infrastructure/events/metacognition-curriculum.consumer.js';
import {
  HttpCurriculumDesignAgentClient,
  HttpKnowledgeGraphClient,
  HttpPedagogyGuardianClient,
  HttpSchedulerClient,
  HttpSessionLearningContextClient,
} from './infrastructure/external/http-clients.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });
  const prisma = new PrismaClient();
  await prisma.$connect();
  const redis = new Redis(config.redis.url, { maxRetriesPerRequest: 3, lazyConnect: true });
  await redis.connect();

  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: config.server.bodyLimit,
    disableRequestLogging: true,
  });
  await app.register(cors, { origin: true, credentials: true });

  const repository = new PrismaCurriculumRepository(prisma as never);
  const outboxRepository = new PrismaOutboxRepository(prisma);
  const schedulerClient = new HttpSchedulerClient({
    baseUrl: config.external.schedulerServiceUrl,
    serviceToken: config.external.serviceToken,
  });
  const sessionClient = new HttpSessionLearningContextClient({
    baseUrl: config.external.sessionServiceUrl,
    serviceToken: config.external.serviceToken,
  });
  const knowledgeGraphClient = new HttpKnowledgeGraphClient({
    baseUrl: config.external.knowledgeGraphServiceUrl,
    serviceToken: config.external.serviceToken,
  });
  const guardianClient = new HttpPedagogyGuardianClient({
    baseUrl: config.external.pedagogyGuardianServiceUrl,
    serviceToken: config.external.serviceToken,
  });
  const curriculumDesignAgentClient = new HttpCurriculumDesignAgentClient({
    baseUrl: config.external.curriculumAgentUrl,
    serviceToken: config.external.serviceToken,
  });
  const sharedEventPublisher = new RedisEventPublisher(redis, getEventPublisherConfig(config), logger);
  const eventPublisher: CurriculumEventPublisherPort = new CurriculumOutboxEventPublisher(
    outboxRepository
  );
  const outboxWorker = new CurriculumOutboxWorker(outboxRepository, sharedEventPublisher, logger, {
    pollIntervalMs: config.redis.outboxPollIntervalMs,
    batchSize: config.redis.outboxBatchSize,
    leaseMs: config.redis.outboxLeaseMs,
    maxAttempts: config.redis.outboxMaxAttempts,
    retryBaseDelayMs: config.redis.outboxRetryBaseDelayMs,
    retryMaxDelayMs: config.redis.outboxRetryMaxDelayMs,
    drainTimeoutMs: config.redis.outboxDrainTimeoutMs,
  });
  const curriculumService = new CurriculumService(
    repository,
    schedulerClient,
    eventPublisher,
    prisma,
    knowledgeGraphClient,
    guardianClient,
    curriculumDesignAgentClient
  );
  const consumerRedis = redis.duplicate({ maxRetriesPerRequest: 3, lazyConnect: true });
  await consumerRedis.connect();
  const metacognitionConsumer = new MetacognitionCurriculumConsumer(
    consumerRedis,
    curriculumService,
    sessionClient,
    logger,
    `curriculum-service-${process.pid.toString()}`
  );
  const toolRegistry = createToolRegistry(curriculumService);

  registerHealthRoutes(app as unknown as FastifyInstance, prisma, redis);
  registerCurriculumRoutes(app as unknown as FastifyInstance, curriculumService);
  registerToolRoutes(app as unknown as FastifyInstance, toolRegistry);

  const shutdown = async (): Promise<void> => {
    await app.close();
    metacognitionConsumer.stop();
    await metacognitionConsumer.drain();
    await outboxWorker.stop();
    await consumerRedis.quit();
    await redis.quit();
    await prisma.$disconnect();
  };
  process.on('SIGTERM', () => {
    void shutdown().then(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    void shutdown().then(() => process.exit(0));
  });

  await outboxWorker.start();
  await metacognitionConsumer.initialize();
  void metacognitionConsumer.start().catch((error: unknown) => {
    logger.error({ error }, 'curriculum metacognition consumer stopped unexpectedly');
  });
  await app.listen({ host: config.server.host, port: config.server.port });
  logger.info({ port: config.server.port }, 'curriculum-service started');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
