import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

interface IHealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks?: Record<
    string,
    {
      status: 'pass' | 'fail';
      latency?: number;
    }
  >;
}

export function registerHealthRoutes(fastify: FastifyInstance, redis: Redis): void {
  const startTime = Date.now();

  fastify.get<{ Reply: IHealthResponse }>('/health', {}, async (_request, reply) => {
    const uptime = (Date.now() - startTime) / 1000;

    let redisStatus: 'pass' | 'fail' = 'pass';
    let redisLatency = 0;
    try {
      const redisStart = Date.now();
      await redis.ping();
      redisLatency = Date.now() - redisStart;
    } catch {
      redisStatus = 'fail';
    }

    reply.send({
      status: redisStatus === 'fail' ? 'unhealthy' : 'healthy',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      uptime,
      checks: {
        redis: { status: redisStatus, latency: redisLatency },
      },
    });
  });

  fastify.get('/health/live', {}, async (_request, reply) => {
    reply.send({ status: 'ok' });
  });

  fastify.get('/health/ready', {}, async (_request, reply) => {
    try {
      await redis.ping();
      reply.send({ status: 'ready' });
    } catch {
      reply.status(503).send({ status: 'not_ready' });
    }
  });
}
