/* eslint-disable @typescript-eslint/naming-convention */
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

interface PrismaHealthClient {
  $queryRaw(strings: TemplateStringsArray): Promise<unknown>;
}

export function registerHealthRoutes(
  fastify: FastifyInstance,
  prisma: PrismaHealthClient,
  redis: Redis
): void {
  fastify.get('/health', async (_request, reply) => {
    const now = new Date().toISOString();
    try {
      await prisma.$queryRaw`SELECT 1`;
      await redis.ping();
      await reply.send({
        status: 'healthy',
        service: 'curriculum-service',
        version: '0.1.0',
        timestamp: now,
      });
    } catch (error) {
      await reply.status(503).send({
        status: 'unhealthy',
        service: 'curriculum-service',
        timestamp: now,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  });

  fastify.get('/health/live', async (_request, reply) => {
    await reply.send({
      status: 'alive',
      service: 'curriculum-service',
      timestamp: new Date().toISOString(),
    });
  });
}
