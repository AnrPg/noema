/* eslint-disable @typescript-eslint/naming-convention */
import type { Environment } from '@noema/types';

export interface CurriculumServiceConfig {
  service: {
    name: string;
    version: string;
    environment: Environment;
  };
  server: {
    host: string;
    port: number;
    bodyLimit: number;
  };
  redis: {
    url: string;
    eventStreamKey: string;
    maxStreamLen: number;
    outboxPollIntervalMs: number;
    outboxBatchSize: number;
    outboxLeaseMs: number;
    outboxMaxAttempts: number;
    outboxRetryBaseDelayMs: number;
    outboxRetryMaxDelayMs: number;
    outboxDrainTimeoutMs: number;
  };
  external: {
    curriculumAgentUrl: string;
    sessionServiceUrl: string;
    schedulerServiceUrl: string;
    knowledgeGraphServiceUrl: string;
    pedagogyGuardianServiceUrl: string;
    serviceToken: string | undefined;
  };
}

export function loadConfig(): CurriculumServiceConfig {
  return {
    service: {
      name: process.env['SERVICE_NAME'] ?? 'curriculum-service',
      version: process.env['SERVICE_VERSION'] ?? '0.1.0',
      environment: (process.env['NODE_ENV'] ?? 'development') as Environment,
    },
    server: {
      host: process.env['HOST'] ?? '0.0.0.0',
      port: Number(process.env['PORT'] ?? 3017),
      bodyLimit: Number(process.env['BODY_LIMIT'] ?? 1_048_576),
    },
    redis: {
      url: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
      eventStreamKey: process.env['REDIS_EVENT_STREAM'] ?? 'noema:events:curriculum-service',
      maxStreamLen: Number(process.env['REDIS_STREAM_MAX_LEN'] ?? 10_000),
      outboxPollIntervalMs: Number(process.env['OUTBOX_POLL_INTERVAL_MS'] ?? 2_000),
      outboxBatchSize: Number(process.env['OUTBOX_BATCH_SIZE'] ?? 100),
      outboxLeaseMs: Number(process.env['OUTBOX_LEASE_MS'] ?? 10_000),
      outboxMaxAttempts: Number(process.env['OUTBOX_MAX_ATTEMPTS'] ?? 10),
      outboxRetryBaseDelayMs: Number(process.env['OUTBOX_RETRY_BASE_DELAY_MS'] ?? 1_000),
      outboxRetryMaxDelayMs: Number(process.env['OUTBOX_RETRY_MAX_DELAY_MS'] ?? 60_000),
      outboxDrainTimeoutMs: Number(process.env['OUTBOX_DRAIN_TIMEOUT_MS'] ?? 15_000),
    },
    external: {
      curriculumAgentUrl: process.env['CURRICULUM_AGENT_URL'] ?? 'http://localhost:8030',
      sessionServiceUrl: process.env['SESSION_SERVICE_URL'] ?? 'http://localhost:3002',
      schedulerServiceUrl: process.env['SCHEDULER_SERVICE_URL'] ?? 'http://localhost:3003',
      knowledgeGraphServiceUrl:
        process.env['KNOWLEDGE_GRAPH_SERVICE_URL'] ?? 'http://localhost:3004',
      pedagogyGuardianServiceUrl:
        process.env['PEDAGOGY_GUARDIAN_SERVICE_URL'] ?? 'http://localhost:3016',
      serviceToken: process.env['SERVICE_AUTH_TOKEN'],
    },
  };
}

export function getEventPublisherConfig(config: CurriculumServiceConfig) {
  return {
    streamKey: config.redis.eventStreamKey,
    maxLen: config.redis.maxStreamLen,
    serviceName: config.service.name,
    serviceVersion: config.service.version,
    environment: config.service.environment,
  };
}
