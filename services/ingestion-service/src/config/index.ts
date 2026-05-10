import { Environment } from '@noema/types';
import type { IRedisEventPublisherConfig } from '@noema/events/publisher';

export interface IIngestionServiceConfig {
  server: {
    host: string;
    port: number;
    bodyLimit: number;
  };
  redis: {
    url: string;
    eventStreamKey: string;
    maxLen: number;
  };
  external: {
    vectorServiceUrl: string;
    contentServiceUrl: string;
    curriculumServiceUrl: string;
    knowledgeGraphServiceUrl: string;
    agentsServiceUrl: string;
    serviceToken: string | undefined;
  };
}

export function loadConfig(): IIngestionServiceConfig {
  return {
    server: {
      host: process.env['HOST'] ?? '0.0.0.0',
      port: Number(process.env['PORT_INGESTION_SERVICE'] ?? process.env['PORT'] ?? 3009),
      bodyLimit: Number(process.env['INGESTION_BODY_LIMIT'] ?? 20_971_520),
    },
    redis: {
      url: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
      eventStreamKey: process.env['REDIS_EVENT_STREAM'] ?? 'noema:events:ingestion-service',
      maxLen: Number(process.env['REDIS_EVENT_STREAM_MAXLEN'] ?? 10000),
    },
    external: {
      vectorServiceUrl: process.env['VECTOR_SERVICE_URL'] ?? 'http://localhost:3012',
      contentServiceUrl: process.env['CONTENT_SERVICE_URL'] ?? 'http://localhost:3005',
      curriculumServiceUrl: process.env['CURRICULUM_SERVICE_URL'] ?? 'http://localhost:3017',
      knowledgeGraphServiceUrl:
        process.env['KNOWLEDGE_GRAPH_SERVICE_URL'] ?? 'http://localhost:3004',
      agentsServiceUrl: process.env['AGENTS_URL'] ?? 'http://localhost:8011',
      serviceToken: process.env['SERVICE_AUTH_TOKEN'],
    },
  };
}

export function getEventPublisherConfig(
  config: IIngestionServiceConfig
): IRedisEventPublisherConfig {
  const environment = parseEnvironment(process.env['NODE_ENV']);
  return {
    streamKey: config.redis.eventStreamKey,
    maxLen: config.redis.maxLen,
    serviceName: 'ingestion-service',
    serviceVersion: '0.1.0',
    environment,
  };
}

function parseEnvironment(value: string | undefined): Environment {
  return Object.values(Environment).includes(value as Environment)
    ? (value as Environment)
    : Environment.DEVELOPMENT;
}
