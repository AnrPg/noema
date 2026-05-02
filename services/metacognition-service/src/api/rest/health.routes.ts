import type { IHealthCheckResponse, ILivenessResponse, IReadinessResponse } from '@noema/contracts';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '../../../generated/prisma/index.js';

const SERVICE_NAME = 'metacognition-service';
const SERVICE_VERSION = '0.1.0';

export function registerHealthRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  redis: Redis
): void {
  const startTime = Date.now();

  fastify.get<{ Reply: IHealthCheckResponse }>('/health', async (_request, reply) => {
    const timestamp = new Date().toISOString();
    const checks: IHealthCheckResponse['checks'] = {};
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'up', latencyMs: 0, checkedAt: timestamp };
    } catch (error) {
      checks.database = {
        status: 'down',
        latencyMs: 0,
        checkedAt: timestamp,
        error: error instanceof Error ? error.message : 'Database unavailable',
      };
    }
    try {
      await redis.ping();
      checks.redis = { status: 'up', latencyMs: 0, checkedAt: timestamp };
    } catch (error) {
      checks.redis = {
        status: 'down',
        latencyMs: 0,
        checkedAt: timestamp,
        error: error instanceof Error ? error.message : 'Redis unavailable',
      };
    }

    const unhealthy = Object.values(checks).some((check) => check.status === 'down');
    reply.send({
      status: unhealthy ? 'unhealthy' : 'healthy',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      timestamp,
      uptimeSeconds: (Date.now() - startTime) / 1000,
      checks,
    });
  });

  fastify.get<{ Reply: ILivenessResponse }>('/health/live', async (_request, reply) => {
    reply.send({ status: 'alive', service: SERVICE_NAME, timestamp: new Date().toISOString() });
  });

  fastify.get<{ Reply: IReadinessResponse }>('/health/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await redis.ping();
      reply.send({ ready: true, service: SERVICE_NAME, timestamp: new Date().toISOString() });
    } catch {
      reply.status(503).send({
        ready: false,
        service: SERVICE_NAME,
        timestamp: new Date().toISOString(),
        reason: 'Dependency unavailable',
      });
    }
  });
}
