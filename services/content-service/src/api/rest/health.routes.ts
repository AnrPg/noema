/**
 * @noema/content-service - Health Routes
 *
 * Health check endpoints for Kubernetes probes.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

// Module augmentation to extend FastifySchema with OpenAPI properties
declare module 'fastify' {
  interface FastifySchema {
    tags?: string[];
    summary?: string;
    description?: string;
    deprecated?: boolean;
    operationId?: string;
  }
}

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

  /**
   * GET /health - Overall health check
   */
  fastify.get<{ Reply: HealthResponse }>(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Overall health check',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['healthy', 'unhealthy', 'degraded'] },
              timestamp: { type: 'string' },
              version: { type: 'string' },
              uptime: { type: 'number' },
              checks: { type: 'object' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const uptime = (Date.now() - startTime) / 1000;

      // Database check
      let dbStatus: 'pass' | 'fail' = 'pass';
      let dbLatency = 0;
      try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        dbLatency = Date.now() - dbStart;
      } catch {
        dbStatus = 'fail';
      }

      // Redis check
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
          cache: { status: redisStatus, latency: redisLatency },
        },
      });
    }
  );

  /**
   * GET /health/live - Liveness probe
   */
  fastify.get(
    '/health/live',
    {
      schema: {
        tags: ['Health'],
        summary: 'Liveness probe for Kubernetes',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      reply.send({ status: 'ok' });
    }
  );

  /**
   * GET /health/ready - Readiness probe
   */
  fastify.get(
    '/health/ready',
    {
      schema: {
        tags: ['Health'],
        summary: 'Readiness probe for Kubernetes',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      // Check database connection
      let ready = true;
      let reason = '';

      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        ready = false;
        reason = 'Database unavailable';
      }

      if (ready) {
        try {
          await redis.ping();
        } catch {
          ready = false;
          reason = 'Redis unavailable';
        }
      }

      if (ready) {
        reply.send({ status: 'ready' });
      } else {
        reply.status(503).send({ status: 'not ready', reason });
      }
    }
  );
}
