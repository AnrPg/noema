/**
 * @noema/session-service - Health Routes
 *
 * Health check endpoints for Kubernetes probes.
 */

import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '../../../generated/prisma/index.js';

/**
 * Health check response.
 */
interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  checks?: Record<
    string,
    {
      status: 'pass' | 'fail' | 'warn';
      message?: string;
      latency?: number;
    }
  >;
}

/**
 * Register health routes.
 */
export async function registerHealthRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  redis: Redis
): Promise<void> {
  const startTime = Date.now();

  // GET /health — Overall health check
  fastify.get<{ Reply: HealthResponse }>(
    '/health',
    {
    },
    async (_request, reply) => {
      const uptime = (Date.now() - startTime) / 1000;

      let dbStatus: 'pass' | 'fail' = 'pass';
      let dbLatency = 0;
      try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        dbLatency = Date.now() - dbStart;
      } catch {
        dbStatus = 'fail';
      }

      let redisStatus: 'pass' | 'fail' = 'pass';
      let redisLatency = 0;
      try {
        const redisStart = Date.now();
        await redis.ping();
        redisLatency = Date.now() - redisStart;
      } catch {
        redisStatus = 'fail';
      }

      const overallStatus = dbStatus === 'fail' || redisStatus === 'fail' ? 'unhealthy' : 'healthy';

      reply.send({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: '0.1.0',
        uptime,
        checks: {
          database: { status: dbStatus, latency: dbLatency },
          redis: { status: redisStatus, latency: redisLatency },
        },
      });
    }
  );

  // GET /health/live — Liveness probe
  fastify.get(
    '/health/live',
    {
    },
    async (_request, reply) => {
      reply.send({ status: 'ok' });
    }
  );

  // GET /health/ready — Readiness probe
  fastify.get(
    '/health/ready',
    {
    },
    async (_request, reply) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        await redis.ping();
        reply.send({ status: 'ready' });
      } catch {
        reply.status(503).send({ status: 'not_ready' });
      }
    }
  );
}
