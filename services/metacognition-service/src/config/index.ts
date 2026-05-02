import type { Environment } from '@noema/types';

export interface IServiceConfig {
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
  database: {
    url: string;
  };
  redis: {
    url: string;
    eventStreamKey: string;
    maxStreamLen: number;
  };
  consumers: {
    enabled: boolean;
    consumerName: string;
    streams: {
      knowledgeGraphService: string;
    };
  };
  auth: {
    accessTokenSecret: string;
    issuer: string;
    audience: string;
  };
  scoring: {
    reasoningAverageWindowSize: number;
  };
  cors: {
    enabled: boolean;
    origin: string[];
    credentials: boolean;
  };
  logging: {
    level: string;
    pretty: boolean;
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '')
    throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function optionalEnvInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') return defaultValue;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) throw new Error(`Invalid integer for ${name}: ${value}`);
  return parsed;
}

function optionalEnvBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true';
}

function parseCorsOrigin(raw: string): string[] {
  if (raw.trim() === '*') return ['*'];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(): IServiceConfig {
  const environment = optionalEnv('NODE_ENV', 'development') as Environment;
  return {
    service: {
      name: 'metacognition-service',
      version: optionalEnv('SERVICE_VERSION', '1.0.0'),
      environment,
    },
    server: {
      host: optionalEnv('HOST', '0.0.0.0'),
      port: optionalEnvInt('PORT', 3008),
      bodyLimit: optionalEnvInt('BODY_LIMIT', 1_048_576),
    },
    database: {
      url: requireEnv('DATABASE_URL'),
    },
    redis: {
      url: requireEnv('REDIS_URL'),
      eventStreamKey: optionalEnv('REDIS_EVENT_STREAM', 'noema:events:metacognition-service'),
      maxStreamLen: optionalEnvInt('REDIS_STREAM_MAX_LEN', 10000),
    },
    consumers: {
      enabled: optionalEnvBool('CONSUMERS_ENABLED', true),
      consumerName: optionalEnv('CONSUMER_NAME', `metacognition-service-${String(process.pid)}`),
      streams: {
        knowledgeGraphService: optionalEnv(
          'CONSUMER_STREAM_KNOWLEDGE_GRAPH_SERVICE',
          'noema:events:knowledge-graph-service'
        ),
      },
    },
    auth: {
      accessTokenSecret: requireEnv('ACCESS_TOKEN_SECRET'),
      issuer: optionalEnv('JWT_ISSUER', 'noema.app'),
      audience: optionalEnv('JWT_AUDIENCE', 'noema.app'),
    },
    scoring: {
      reasoningAverageWindowSize: optionalEnvInt('REASONING_AVERAGE_WINDOW_SIZE', 10),
    },
    cors: {
      enabled: optionalEnvBool('CORS_ENABLED', false),
      origin: parseCorsOrigin(
        optionalEnv('CORS_ORIGIN', 'http://localhost:3000,http://localhost:3001')
      ),
      credentials: optionalEnvBool('CORS_CREDENTIALS', true),
    },
    logging: {
      level: optionalEnv('LOG_LEVEL', environment === 'production' ? 'info' : 'debug'),
      pretty: optionalEnvBool('LOG_PRETTY', environment === 'development'),
    },
  };
}

export function getEventPublisherConfig(config: IServiceConfig): {
  streamKey: string;
  maxLen: number;
  serviceName: string;
  serviceVersion: string;
  environment: Environment;
} {
  return {
    streamKey: config.redis.eventStreamKey,
    maxLen: config.redis.maxStreamLen,
    serviceName: config.service.name,
    serviceVersion: config.service.version,
    environment: config.service.environment,
  };
}
