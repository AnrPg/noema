import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '../generated/prisma/index.js';
import { createToolRegistry } from './agents/tools/tool.registry.js';
import { registerToolRoutes } from './agents/tools/tool.routes.js';
import { registerHealthRoutes } from './api/rest/health.routes.js';
import { registerIngestionRoutes } from './api/rest/ingestion.routes.js';
import { getEventPublisherConfig, loadConfig } from './config/index.js';
import { IngestionService } from './domain/ingestion-service/ingestion.service.js';
import { PrismaIngestionRepository } from './infrastructure/database/prisma-ingestion.repository.js';
import { RedisIngestionEventPublisher } from './infrastructure/events/redis-event-publisher.js';
import {
  HttpContentServiceClient,
  HttpCurriculumServiceClient,
  HttpIngestionConceptExtractionAgentClient,
  HttpKnowledgeGraphClient,
  HttpVectorServiceClient,
} from './infrastructure/external/local-clients.js';
import { DocumentParser } from './infrastructure/parsers/document.parser.js';
import { createAuthMiddleware } from './middleware/auth.middleware.js';

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
    new DocumentParser(),
    new HttpVectorServiceClient(config.external.vectorServiceUrl),
    new HttpIngestionConceptExtractionAgentClient(
      config.external.agentsServiceUrl,
      config.external.serviceToken
    ),
    new HttpKnowledgeGraphClient(
      config.external.knowledgeGraphServiceUrl,
      config.external.serviceToken
    ),
    new HttpContentServiceClient(config.external.contentServiceUrl, config.external.serviceToken),
    new HttpCurriculumServiceClient(
      config.external.curriculumServiceUrl,
      config.external.serviceToken
    ),
    new RedisIngestionEventPublisher(redis, getEventPublisherConfig(config), logger),
    logger
  );

  registerHealthRoutes(app as unknown as FastifyInstance, prisma, redis);
  registerIngestionRoutes(app as unknown as FastifyInstance, service);
  registerToolRoutes(
    app as unknown as FastifyInstance,
    createToolRegistry(service),
    createAuthMiddleware('ingestion:agent')
  );

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
