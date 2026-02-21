/**
 * @noema/content-service - Health Routes
 *
 * Health check endpoints for Kubernetes probes.
 * Uses standardized types from @noema/contracts.
 */

import type {
  DependencyStatus,
  IHealthCheckResponse,
  ILivenessResponse,
  IReadinessResponse,
} from '@noema/contracts';
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

const SERVICE_NAME = 'content-service';
const SERVICE_VERSION = '0.1.0';

/**
 * Check a dependency and return a standardized status.
 */
async function checkDependency(
  fn: () => Promise<void>
): Promise<{ status: DependencyStatus; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await fn();
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
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
  fastify.get<{ Reply: IHealthCheckResponse }>(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Overall health check',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
              service: { type: 'string' },
              version: { type: 'string' },
              timestamp: { type: 'string' },
              uptimeSeconds: { type: 'number' },
              checks: { type: 'object' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const uptimeSeconds = (Date.now() - startTime) / 1000;
      const now = new Date().toISOString();

      const dbCheck = await checkDependency(async () => {
        await prisma.$queryRaw`SELECT 1`;
      });

      const redisCheck = await checkDependency(async () => {
        await redis.ping();
      });

      const anyDown = dbCheck.status === 'down' || redisCheck.status === 'down';
      const status = anyDown ? 'unhealthy' : 'healthy';

      const response: IHealthCheckResponse = {
        status,
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        timestamp: now,
        uptimeSeconds,
        checks: {
          database: {
            status: dbCheck.status,
            latencyMs: dbCheck.latencyMs,
            checkedAt: now,
            ...(dbCheck.error !== undefined ? { error: dbCheck.error } : {}),
          },
          redis: {
            status: redisCheck.status,
            latencyMs: redisCheck.latencyMs,
            checkedAt: now,
            ...(redisCheck.error !== undefined ? { error: redisCheck.error } : {}),
          },
        },
      };

      reply.send(response);
    }
  );

  /**
   * GET /health/live - Liveness probe
   */
  fastify.get<{ Reply: ILivenessResponse }>(
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
              service: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      reply.send({
        status: 'alive',
        service: SERVICE_NAME,
        timestamp: new Date().toISOString(),
      });
    }
  );

  /**
   * GET /health/ready - Readiness probe
   */
  fastify.get<{ Reply: IReadinessResponse }>(
    '/health/ready',
    {
      schema: {
        tags: ['Health'],
        summary: 'Readiness probe for Kubernetes',
        response: {
          200: {
            type: 'object',
            properties: {
              ready: { type: 'boolean' },
              service: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
          503: {
            type: 'object',
            properties: {
              ready: { type: 'boolean' },
              service: { type: 'string' },
              timestamp: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const now = new Date().toISOString();

      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        reply.status(503).send({
          ready: false,
          service: SERVICE_NAME,
          timestamp: now,
          reason: 'Database unavailable',
        });
        return;
      }

      try {
        await redis.ping();
      } catch {
        reply.status(503).send({
          ready: false,
          service: SERVICE_NAME,
          timestamp: now,
          reason: 'Redis unavailable',
        });
        return;
      }

      reply.send({
        ready: true,
        service: SERVICE_NAME,
        timestamp: now,
      });
    }
  );
}
