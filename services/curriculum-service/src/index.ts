/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { registerCurriculumRoutes } from './api/rest/curriculum.routes.js';
import { registerHealthRoutes } from './api/rest/health.routes.js';
import { loadConfig } from './config/index.js';
import { CurriculumService } from './domain/curriculum-service/curriculum.service.js';
import { PrismaCurriculumRepository } from './infrastructure/database/prisma-curriculum.repository.js';
import { RedisCurriculumEventPublisher } from './infrastructure/events/redis-event-publisher.js';
import { HttpSchedulerClient } from './infrastructure/external/http-clients.js';

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
  const schedulerClient = new HttpSchedulerClient(config.external.schedulerServiceUrl);
  const eventPublisher = new RedisCurriculumEventPublisher(redis, 'curriculum-service', logger);
  const curriculumService = new CurriculumService(repository, schedulerClient, eventPublisher);

  registerHealthRoutes(app as unknown as FastifyInstance, prisma, redis);
  registerCurriculumRoutes(app as unknown as FastifyInstance, curriculumService);

  const shutdown = async (): Promise<void> => {
    await app.close();
    await redis.quit();
    await prisma.$disconnect();
  };
  process.on('SIGTERM', () => {
    void shutdown().then(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    void shutdown().then(() => process.exit(0));
  });

  await app.listen({ host: config.server.host, port: config.server.port });
  logger.info({ port: config.server.port }, 'curriculum-service started');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
