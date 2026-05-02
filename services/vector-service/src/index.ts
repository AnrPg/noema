import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import pino from 'pino';
import { registerHealthRoutes } from './api/rest/health.routes.js';
import { registerVectorRoutes } from './api/rest/vector.routes.js';
import { loadConfig } from './config/index.js';
import { HashEmbeddingModel } from './domain/vector-service/embedding.js';
import { VectorService } from './domain/vector-service/vector.service.js';
import { QdrantVectorRepository } from './infrastructure/qdrant/qdrant-vector.repository.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: config.server.bodyLimit,
    disableRequestLogging: true,
  });
  await app.register(cors, { origin: true, credentials: true });

  const embeddingModel = new HashEmbeddingModel(
    config.vector.embeddingDimensions,
    config.vector.embeddingModel
  );
  const repository = new QdrantVectorRepository(
    config.vector.qdrantUrl,
    config.vector.collectionName
  );
  const vectorService = new VectorService(embeddingModel, repository);

  registerHealthRoutes(app as unknown as FastifyInstance);
  registerVectorRoutes(app as unknown as FastifyInstance, vectorService);

  const shutdown = async (): Promise<void> => {
    await app.close();
  };
  process.on('SIGTERM', () => {
    void shutdown().then(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    void shutdown().then(() => process.exit(0));
  });

  await app.listen({ host: config.server.host, port: config.server.port });
  logger.info({ port: config.server.port }, 'vector-service started');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
