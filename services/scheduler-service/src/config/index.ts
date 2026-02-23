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
  security: {
    offlineIntentTokenActiveKeyId: string;
    offlineIntentTokenKeys: Record<string, string>;
    offlineIntentTokenIssuer: string;
    offlineIntentTokenAudience: string;
  };
}

const MIN_OFFLINE_INTENT_TOKEN_SECRET_LENGTH = 32;

function ensureValidOfflineIntentTokenSecret(secret: string, keyId: string): string {
  const normalizedSecret = secret.trim();
  if (normalizedSecret.length < MIN_OFFLINE_INTENT_TOKEN_SECRET_LENGTH) {
    throw new Error(
      `OFFLINE_INTENT_TOKEN key '${keyId}' must be at least ${String(MIN_OFFLINE_INTENT_TOKEN_SECRET_LENGTH)} characters`
    );
  }
  return normalizedSecret;
}

function parseOfflineIntentTokenKeyRing(): {
  activeKeyId: string;
  keys: Record<string, string>;
} {
  const keyRingRaw = process.env['OFFLINE_INTENT_TOKEN_KEYS'];
  const activeKeyIdRaw = process.env['OFFLINE_INTENT_TOKEN_ACTIVE_KID'];

  if (keyRingRaw !== undefined && keyRingRaw.trim() !== '') {
    const entries = keyRingRaw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    const keys: Record<string, string> = {};

    for (const entry of entries) {
      const separatorIndex = entry.indexOf(':');
      if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
        throw new Error(
          "Invalid OFFLINE_INTENT_TOKEN_KEYS format. Expected comma-separated 'kid:secret' pairs"
        );
      }

      const keyId = entry.slice(0, separatorIndex).trim();
      const secret = entry.slice(separatorIndex + 1).trim();
      if (keyId.length === 0 || secret.length === 0) {
        throw new Error('OFFLINE_INTENT_TOKEN_KEYS contains empty key id or secret');
      }

      keys[keyId] = ensureValidOfflineIntentTokenSecret(secret, keyId);
    }

    const activeKeyId = (activeKeyIdRaw ?? '').trim();
    if (activeKeyId.length === 0) {
      throw new Error(
        'OFFLINE_INTENT_TOKEN_ACTIVE_KID is required when OFFLINE_INTENT_TOKEN_KEYS is set'
      );
    }

    if (!(activeKeyId in keys)) {
      throw new Error(
        `OFFLINE_INTENT_TOKEN_ACTIVE_KID '${activeKeyId}' does not exist in OFFLINE_INTENT_TOKEN_KEYS`
      );
    }

    return {
      activeKeyId,
      keys,
    };
  }

  const legacySecret = requireEnv('OFFLINE_INTENT_TOKEN_SECRET');
  const activeKeyId = (activeKeyIdRaw ?? 'default').trim();

  return {
    activeKeyId,
    keys: {
      [activeKeyId]: ensureValidOfflineIntentTokenSecret(legacySecret, activeKeyId),
    },
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
  const keyRing = parseOfflineIntentTokenKeyRing();

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
      deadLetterStreamKey: optionalEnv('REDIS_DEAD_LETTER_STREAM', 'noema:events:scheduler-service:dlq'),
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
      offlineIntentTokenActiveKeyId: keyRing.activeKeyId,
      offlineIntentTokenKeys: keyRing.keys,
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
