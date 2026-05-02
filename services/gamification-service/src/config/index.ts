import type { Environment } from '@noema/types';

export interface ICapabilityTierThreshold {
  tier: number;
  minStepsCompleted: number;
  minCategoriesEngaged: number;
  minDaysActive: number;
  minSessionsCompleted: number;
  minAverageReasoning: number;
}

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
      metacognitionService: string;
      knowledgeGraphService: string;
      sessionService: string;
    };
  };
  auth: {
    accessTokenSecret: string;
    issuer: string;
    audience: string;
  };
  gamification: {
    xpMultiplier: number;
    streakThreshold: number;
    levelThresholds: number[];
    capabilityTierThresholds: ICapabilityTierThreshold[];
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
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function optionalEnvInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) throw new Error(`Invalid integer for ${name}: ${value}`);
  return parsed;
}

function optionalEnvFloat(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') return defaultValue;
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) throw new Error(`Invalid float for ${name}: ${value}`);
  return parsed;
}

function optionalEnvBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true';
}

function parseCsvNumbers(raw: string, fallback: number[]): number[] {
  const values = raw
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value));
  return values.length > 0 ? values : fallback;
}

function parseCorsOrigin(raw: string): string[] {
  if (raw.trim() === '*') return ['*'];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function defaultCapabilityTierThresholds(): ICapabilityTierThreshold[] {
  return [
    {
      tier: 0,
      minStepsCompleted: 0,
      minCategoriesEngaged: 0,
      minDaysActive: 0,
      minSessionsCompleted: 0,
      minAverageReasoning: 0,
    },
    {
      tier: 1,
      minStepsCompleted: 5,
      minCategoriesEngaged: 1,
      minDaysActive: 2,
      minSessionsCompleted: 1,
      minAverageReasoning: 0.45,
    },
    {
      tier: 2,
      minStepsCompleted: 15,
      minCategoriesEngaged: 2,
      minDaysActive: 4,
      minSessionsCompleted: 3,
      minAverageReasoning: 0.55,
    },
    {
      tier: 3,
      minStepsCompleted: 30,
      minCategoriesEngaged: 3,
      minDaysActive: 7,
      minSessionsCompleted: 5,
      minAverageReasoning: 0.65,
    },
  ];
}

export function loadConfig(): IServiceConfig {
  const environment = optionalEnv('NODE_ENV', 'development') as Environment;
  const defaultTierThresholds = defaultCapabilityTierThresholds();
  return {
    service: {
      name: 'gamification-service',
      version: optionalEnv('SERVICE_VERSION', '1.0.0'),
      environment,
    },
    server: {
      host: optionalEnv('HOST', '0.0.0.0'),
      port: optionalEnvInt('PORT', 3012),
      bodyLimit: optionalEnvInt('BODY_LIMIT', 1_048_576),
    },
    database: {
      url: requireEnv('DATABASE_URL'),
    },
    redis: {
      url: requireEnv('REDIS_URL'),
      eventStreamKey: optionalEnv('REDIS_EVENT_STREAM', 'noema:events:gamification-service'),
      maxStreamLen: optionalEnvInt('REDIS_STREAM_MAX_LEN', 10000),
    },
    consumers: {
      enabled: optionalEnvBool('CONSUMERS_ENABLED', true),
      consumerName: optionalEnv('CONSUMER_NAME', `gamification-service-${String(process.pid)}`),
      streams: {
        metacognitionService: optionalEnv(
          'CONSUMER_STREAM_METACOGNITION_SERVICE',
          'noema:events:metacognition-service'
        ),
        knowledgeGraphService: optionalEnv(
          'CONSUMER_STREAM_KNOWLEDGE_GRAPH_SERVICE',
          'noema:events:knowledge-graph-service'
        ),
        sessionService: optionalEnv(
          'CONSUMER_STREAM_SESSION_SERVICE',
          'noema:events:session-service'
        ),
      },
    },
    auth: {
      accessTokenSecret: requireEnv('ACCESS_TOKEN_SECRET'),
      issuer: optionalEnv('JWT_ISSUER', 'noema.app'),
      audience: optionalEnv('JWT_AUDIENCE', 'noema.app'),
    },
    gamification: {
      xpMultiplier: optionalEnvInt('R_XP_MULTIPLIER', 100),
      streakThreshold: optionalEnvFloat('R_STREAK_THRESHOLD', 0.6),
      levelThresholds: parseCsvNumbers(
        optionalEnv('R_LEVEL_THRESHOLDS', '0,100,250,450,700'),
        [0, 100, 250, 450, 700]
      ),
      capabilityTierThresholds: defaultTierThresholds,
    },
    cors: {
      enabled: optionalEnvBool('CORS_ENABLED', false),
      origin: parseCorsOrigin(optionalEnv('CORS_ORIGIN', 'http://localhost:3000')),
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
