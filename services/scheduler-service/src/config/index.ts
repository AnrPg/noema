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
  redis: {
    url: string;
    eventStreamKey: string;
    maxStreamLen: number;
  };
  cors: {
    origin: string[];
    credentials: boolean;
  };
  logging: {
    level: string;
    pretty: boolean;
  };
  security: {
    offlineIntentTokenSecret: string;
    offlineIntentTokenIssuer: string;
    offlineIntentTokenAudience: string;
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
    redis: {
      url: requireEnv('REDIS_URL'),
      eventStreamKey: optionalEnv('REDIS_EVENT_STREAM', 'noema:events:scheduler-service'),
      maxStreamLen: optionalEnvInt('REDIS_STREAM_MAX_LEN', 10000),
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
    security: {
      offlineIntentTokenSecret: requireEnv('OFFLINE_INTENT_TOKEN_SECRET'),
      offlineIntentTokenIssuer: optionalEnv('OFFLINE_INTENT_TOKEN_ISSUER', 'noema.scheduler'),
      offlineIntentTokenAudience: optionalEnv('OFFLINE_INTENT_TOKEN_AUDIENCE', 'noema.mobile'),
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
