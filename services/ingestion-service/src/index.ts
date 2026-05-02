/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { registerHealthRoutes } from './api/rest/health.routes.js';
import { registerIngestionRoutes } from './api/rest/ingestion.routes.js';
import { loadConfig } from './config/index.js';
import { IngestionService } from './domain/ingestion-service/ingestion.service.js';
import { PrismaIngestionRepository } from './infrastructure/database/prisma-ingestion.repository.js';
import { RedisIngestionEventPublisher } from './infrastructure/events/redis-event-publisher.js';
import {
  HeuristicConceptExtractorClient,
  HttpContentServiceClient,
  HttpCurriculumServiceClient,
  HttpKnowledgeGraphClient,
  HttpVectorServiceClient,
} from './infrastructure/external/local-clients.js';
import { PlainDocumentParser } from './infrastructure/parsers/plain-document.parser.js';

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

  const service = new IngestionService(
    new PrismaIngestionRepository(prisma as never),
    new PlainDocumentParser(),
    new HttpVectorServiceClient(config.external.vectorServiceUrl),
    new HeuristicConceptExtractorClient(),
    new HttpKnowledgeGraphClient(
      config.external.knowledgeGraphServiceUrl,
      config.external.serviceToken
    ),
    new HttpContentServiceClient(config.external.contentServiceUrl, config.external.serviceToken),
    new HttpCurriculumServiceClient(
      config.external.curriculumServiceUrl,
      config.external.serviceToken
    ),
    new RedisIngestionEventPublisher(redis, 'ingestion-service', logger),
    logger
  );

  registerHealthRoutes(app as unknown as FastifyInstance, prisma, redis);
  registerIngestionRoutes(app as unknown as FastifyInstance, service);

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
  logger.info({ port: config.server.port }, 'ingestion-service started');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
