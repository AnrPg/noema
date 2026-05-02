import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

interface IPrismaHealthClient {
  $queryRaw(strings: TemplateStringsArray): Promise<unknown>;
}

export function registerHealthRoutes(
  fastify: FastifyInstance,
  prisma: IPrismaHealthClient,
  redis: Redis
): void {
  fastify.get('/health', async (_request, reply) => {
    const timestamp = new Date().toISOString();
    try {
      await prisma.$queryRaw`SELECT 1`;
      await redis.ping();
      await reply.send({
        status: 'healthy',
        service: 'ingestion-service',
        version: '0.1.0',
        timestamp,
      });
    } catch (error) {
      await reply.status(503).send({
        status: 'unhealthy',
        service: 'ingestion-service',
        timestamp,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  });

  fastify.get('/health/live', async (_request, reply) => {
    await reply.send({
      status: 'alive',
      service: 'ingestion-service',
      timestamp: new Date().toISOString(),
    });
  });
}
