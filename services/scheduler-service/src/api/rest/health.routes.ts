import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '../../../generated/prisma/index.js';

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

export function registerHealthRoutes(fastify: FastifyInstance, redis: Redis, prisma: PrismaClient): void {
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

    let databaseStatus: 'pass' | 'fail' = 'pass';
    let databaseLatency = 0;
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      databaseLatency = Date.now() - dbStart;
    } catch {
      databaseStatus = 'fail';
    }

    const overallStatus = redisStatus === 'fail' || databaseStatus === 'fail' ? 'unhealthy' : 'healthy';

    reply.send({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      uptime,
      checks: {
        redis: { status: redisStatus, latency: redisLatency },
        database: { status: databaseStatus, latency: databaseLatency },
      },
    });
  });

  fastify.get('/health/live', {}, async (_request, reply) => {
    reply.send({ status: 'ok' });
  });

  fastify.get('/health/ready', {}, async (_request, reply) => {
    try {
      await redis.ping();
      await prisma.$queryRaw`SELECT 1`;
      reply.send({ status: 'ready' });
    } catch {
      reply.status(503).send({ status: 'not_ready' });
    }
  });
}
