/**
 * @noema/user-service - Health Routes
 *
 * Health check endpoints for Kubernetes probes.
 */

import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '../../../generated/prisma/index.js';

// Module augmentation to extend FastifySchema with OpenAPI properties
declare module 'fastify' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
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
interface IHealthResponse {
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

interface IDependencyCheckResult {
  status: 'pass' | 'fail';
  latency: number;
}

async function checkDatabase(prisma: PrismaClient): Promise<IDependencyCheckResult> {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'pass', latency: Date.now() - startedAt };
  } catch {
    return { status: 'fail', latency: Date.now() - startedAt };
  }
}

async function checkRedis(redis: Redis): Promise<IDependencyCheckResult> {
  const startedAt = Date.now();
  try {
    await redis.ping();
    return { status: 'pass', latency: Date.now() - startedAt };
  } catch {
    return { status: 'fail', latency: Date.now() - startedAt };
  }
}

function renderPrometheusMetrics(
  uptimeSeconds: number,
  database: IDependencyCheckResult,
  cache: IDependencyCheckResult
): string {
  return [
    '# HELP user_service_uptime_seconds Process uptime in seconds.',
    '# TYPE user_service_uptime_seconds gauge',
    `user_service_uptime_seconds ${uptimeSeconds.toFixed(3)}`,
    '# HELP user_service_database_up Database readiness state (1 = pass, 0 = fail).',
    '# TYPE user_service_database_up gauge',
    `user_service_database_up ${String(database.status === 'pass' ? 1 : 0)}`,
    '# HELP user_service_database_latency_ms Database readiness latency in milliseconds.',
    '# TYPE user_service_database_latency_ms gauge',
    `user_service_database_latency_ms ${String(database.latency)}`,
    '# HELP user_service_redis_up Redis readiness state (1 = pass, 0 = fail).',
    '# TYPE user_service_redis_up gauge',
    `user_service_redis_up ${String(cache.status === 'pass' ? 1 : 0)}`,
    '# HELP user_service_redis_latency_ms Redis readiness latency in milliseconds.',
    '# TYPE user_service_redis_latency_ms gauge',
    `user_service_redis_latency_ms ${String(cache.latency)}`,
    '',
  ].join('\n');
}

/**
 * Register health routes.
 */
export function registerHealthRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  redis: Redis
): void {
  const startTime = Date.now();

  /**
   * GET /health - Overall health check
   */
  fastify.get<{ Reply: IHealthResponse }>(
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
      const database = await checkDatabase(prisma);
      const cache = await checkRedis(redis);

      const overallStatus =
        database.status === 'fail' || cache.status === 'fail' ? 'unhealthy' : 'healthy';

      reply.send({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: '0.1.0',
        uptime,
        checks: {
          database,
          cache,
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
      const database = await checkDatabase(prisma);
      const cache = database.status === 'pass' ? await checkRedis(redis) : null;
      const ready = database.status === 'pass' && cache?.status === 'pass';
      const reason =
        database.status === 'fail'
          ? 'Database unavailable'
          : cache?.status === 'fail'
            ? 'Redis unavailable'
            : '';

      if (ready) {
        reply.send({ status: 'ready' });
      } else {
        reply.status(503).send({ status: 'not ready', reason });
      }
    }
  );

  fastify.get(
    '/metrics',
    {
      schema: {
        tags: ['Health'],
        summary: 'Prometheus metrics endpoint',
        response: {
          200: {
            type: 'string',
          },
        },
      },
    },
    async (_request, reply) => {
      const uptime = (Date.now() - startTime) / 1000;
      const database = await checkDatabase(prisma);
      const cache = await checkRedis(redis);

      await reply
        .status(200)
        .type('text/plain; version=0.0.4; charset=utf-8')
        .send(renderPrometheusMetrics(uptime, database, cache));
    }
  );
}
