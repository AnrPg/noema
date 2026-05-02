import type { FastifyInstance } from 'fastify';

export function registerHealthRoutes(fastify: FastifyInstance): void {
  fastify.get('/health', async (_request, reply) => {
    await reply.send({
      status: 'healthy',
      service: 'vector-service',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
  });

  fastify.get('/health/live', async (_request, reply) => {
    await reply.send({
      status: 'alive',
      service: 'vector-service',
      timestamp: new Date().toISOString(),
    });
  });
}
