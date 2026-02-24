import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import { schedulerObservability } from '../../infrastructure/observability/scheduler-observability.js';

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

interface IHealthRouteOptions {
  sourceStreamKey: string;
  consumerGroup: string;
  deadLetterStreamKey: string;
}

function readGroupLag(raw: unknown, consumerGroup: string): number | null {
  if (!Array.isArray(raw)) {
    return null;
  }

  for (const groupEntry of raw) {
    if (!Array.isArray(groupEntry)) {
      continue;
    }

    const fields = groupEntry as unknown[];

    const fieldMap = new Map<string, unknown>();
    for (let index = 0; index < fields.length - 1; index += 2) {
      const key = fields[index];
      if (typeof key === 'string') {
        fieldMap.set(key, fields[index + 1]);
      }
    }

    const name = fieldMap.get('name');
    if (name !== consumerGroup) {
      continue;
    }

    const lag = fieldMap.get('lag');
    if (typeof lag === 'number') {
      return lag;
    }
    if (typeof lag === 'string') {
      const parsed = Number.parseInt(lag, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  return null;
}

function parseRedisCount(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.max(0, raw) : 0;
  }

  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  return 0;
}

async function readQueueLag(
  redis: Redis,
  sourceStreamKey: string,
  consumerGroup: string
): Promise<number> {
  try {
    const xinfoRaw: unknown = await redis.xinfo('GROUPS', sourceStreamKey);
    const lagFromGroup = readGroupLag(xinfoRaw, consumerGroup);
    if (lagFromGroup !== null) {
      return Math.max(0, lagFromGroup);
    }
  } catch {
    // fallback below
  }

  try {
    const pendingRaw: unknown = await redis.xpending(sourceStreamKey, consumerGroup);
    if (Array.isArray(pendingRaw) && pendingRaw.length > 0) {
      const pending = pendingRaw as unknown[];
      const count = pending[0];
      if (typeof count === 'number') {
        return Math.max(0, count);
      }
      if (typeof count === 'string') {
        const parsed = Number.parseInt(count, 10);
        if (Number.isFinite(parsed)) {
          return Math.max(0, parsed);
        }
      }
    }
  } catch {
    return 0;
  }

  return 0;
}

export function registerHealthRoutes(
  fastify: FastifyInstance,
  redis: Redis,
  prisma: PrismaClient,
  options: IHealthRouteOptions
): void {
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

    const overallStatus =
      redisStatus === 'fail' || databaseStatus === 'fail' ? 'unhealthy' : 'healthy';

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

  fastify.get('/v1/scheduler/operations/state', {}, async (_request, reply) => {
    const queueLag = await readQueueLag(redis, options.sourceStreamKey, options.consumerGroup);
    const dlqDepthRaw = await redis.xlen(options.deadLetterStreamKey);
    const dlqDepth = parseRedisCount(dlqDepthRaw);

    schedulerObservability.updateQueueLag(queueLag);
    schedulerObservability.updateDlqDepth(Number.isFinite(dlqDepth) ? dlqDepth : 0);

    const sli = schedulerObservability.getSliSnapshot();
    const backpressure = schedulerObservability.computeBackpressureSignal();
    const traces = schedulerObservability.getTraceSummary(50);

    await reply.status(200).send({
      data: {
        backpressure,
        sli,
        traces,
      },
      agentHints: {
        suggestedNextActions: [
          {
            action: backpressure.state === 'healthy' ? 'continue' : 'reduce_scheduler_load',
            description:
              backpressure.state === 'healthy'
                ? 'Scheduler operating state is healthy'
                : `Scheduler is ${backpressure.state}; apply runbook controls`,
            priority: backpressure.state === 'healthy' ? 'low' : 'high',
          },
        ],
        relatedResources: [
          {
            type: 'runbook',
            path: 'docs/guides/operations/scheduler-incident-runbook.md',
          },
        ],
        confidence: 0.9,
        sourceQuality: 'high',
        validityPeriod: 'short',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: {
          benefit: 0.7,
          effort: 0.2,
          roi: 0.8,
        },
        preferenceAlignment: [],
        reasoning: `Backpressure state is ${backpressure.state}`,
      },
      metadata: {
        requestId: _request.id,
        correlationId: _request.id,
        timestamp: new Date().toISOString(),
        serviceName: 'scheduler-service',
        serviceVersion: process.env['SERVICE_VERSION'] ?? '0.1.0',
        executionTime: Date.now() - ((_request as { startTime?: number }).startTime ?? Date.now()),
        additional: {
          queueLag,
          dlqDepth,
        },
      },
    });
  });

  fastify.get('/metrics', {}, async (_request, reply) => {
    const queueLag = await readQueueLag(redis, options.sourceStreamKey, options.consumerGroup);
    const dlqDepthRaw = await redis.xlen(options.deadLetterStreamKey);
    const dlqDepth = parseRedisCount(dlqDepthRaw);

    schedulerObservability.updateQueueLag(queueLag);
    schedulerObservability.updateDlqDepth(Number.isFinite(dlqDepth) ? dlqDepth : 0);

    await reply
      .status(200)
      .type('text/plain; version=0.0.4; charset=utf-8')
      .send(schedulerObservability.renderPrometheusMetrics());
  });
}
