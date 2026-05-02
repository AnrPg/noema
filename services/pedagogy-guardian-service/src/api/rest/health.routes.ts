import { createEmptyAgentHints, type IApiResponse } from '@noema/contracts';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '../../../generated/prisma/index.js';

export function registerHealthRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  redis: Redis
): void {
  fastify.get('/health', async (request) => {
    const checks = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()]);
    const healthy = checks.every((check) => check.status === 'fulfilled');
    const response: IApiResponse<{
      status: 'healthy' | 'degraded';
      checks: { postgres: boolean; redis: boolean };
    }> = {
      data: {
        status: healthy ? 'healthy' : 'degraded',
        checks: {
          postgres: checks[0].status === 'fulfilled',
          redis: checks[1].status === 'fulfilled',
        },
      },
      agentHints: createEmptyAgentHints(),
      metadata: {
        requestId: request.id,
        timestamp: new Date().toISOString(),
        serviceName: 'pedagogy-guardian-service',
        serviceVersion: '0.1.0',
        executionTime: 0,
      },
    };
    return response;
  });
}
