export interface IServiceConfig {
  service: {
    name: string;
    version: string;
    environment: 'development' | 'staging' | 'production';
  };
  server: {
    host: string;
    port: number;
  };
  database: {
    url: string;
  };
  redis: {
    url: string;
    eventStreamKey: string;
    maxStreamLen: number;
    sourceStreamKey: string;
    consumerGroup: string;
    consumerName: string;
    consumerBlockMs: number;
    consumerBatchSize: number;
    consumerRetryBaseDelayMs: number;
    consumerMaxProcessAttempts: number;
    deadLetterStreamKey: string;
  };
  cors: {
    origin: string[];
    credentials: boolean;
  };
  logging: {
    level: string;
    pretty: boolean;
  };
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnvInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${value}`);
  }
  return parsed;
}

function optionalEnvBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true';
}

export function loadConfig(): IServiceConfig {
  const env = optionalEnv('NODE_ENV', 'development') as 'development' | 'staging' | 'production';

  return {
    service: {
      name: optionalEnv('SERVICE_NAME', 'scheduler-service'),
      version: optionalEnv('SERVICE_VERSION', '0.1.0'),
      environment: env,
    },
    server: {
      host: optionalEnv('HOST', '0.0.0.0'),
      port: optionalEnvInt('PORT', 3009),
    },
    database: {
      url: requireEnv('DATABASE_URL'),
    },
    redis: {
      url: requireEnv('REDIS_URL'),
      eventStreamKey: optionalEnv('REDIS_EVENT_STREAM', 'noema:events:scheduler-service'),
      maxStreamLen: optionalEnvInt('REDIS_STREAM_MAX_LEN', 10000),
      sourceStreamKey: optionalEnv('REDIS_SOURCE_STREAM', 'noema:events:session-service'),
      consumerGroup: optionalEnv('REDIS_CONSUMER_GROUP', 'scheduler-service-group'),
      consumerName: optionalEnv('REDIS_CONSUMER_NAME', 'scheduler-service-1'),
      consumerBlockMs: optionalEnvInt('REDIS_CONSUMER_BLOCK_MS', 5000),
      consumerBatchSize: optionalEnvInt('REDIS_CONSUMER_BATCH_SIZE', 20),
      consumerRetryBaseDelayMs: optionalEnvInt('REDIS_CONSUMER_RETRY_BASE_DELAY_MS', 250),
      consumerMaxProcessAttempts: optionalEnvInt('REDIS_CONSUMER_MAX_PROCESS_ATTEMPTS', 5),
      deadLetterStreamKey: optionalEnv(
        'REDIS_DEAD_LETTER_STREAM',
        'noema:events:scheduler-service:dlq'
      ),
    },
    cors: {
      origin: optionalEnv(
        'CORS_ORIGIN',
        'http://localhost:3000,http://localhost:3001,http://localhost:3003,http://localhost:3004'
      )
        .split(',')
        .map((s) => s.trim()),
      credentials: optionalEnvBool('CORS_CREDENTIALS', true),
    },
    logging: {
      level: optionalEnv('LOG_LEVEL', env === 'production' ? 'info' : 'debug'),
      pretty: optionalEnvBool('LOG_PRETTY', env === 'development'),
    },
  };
}

export function getEventPublisherConfig(config: IServiceConfig): {
  streamKey: string;
  maxLen: number;
  serviceName: string;
  serviceVersion: string;
  environment: 'development' | 'staging' | 'production';
} {
  return {
    streamKey: config.redis.eventStreamKey,
    maxLen: config.redis.maxStreamLen,
    serviceName: config.service.name,
    serviceVersion: config.service.version,
    environment: config.service.environment,
  };
}
