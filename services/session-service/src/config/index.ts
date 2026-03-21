/**
 * @noema/session-service - Service Configuration
 *
 * Environment-based configuration management.
 */

import type { Environment } from '@noema/types';

// ============================================================================
// Configuration Schema
// ============================================================================

export interface IServiceConfig {
  service: {
    name: string;
    version: string;
    environment: Environment;
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
    outboxPollIntervalMs: number;
    outboxBatchSize: number;
    outboxLeaseMs: number;
    outboxMaxAttempts: number;
    outboxRetryBaseDelayMs: number;
    outboxRetryMaxDelayMs: number;
    outboxDrainTimeoutMs: number;
  };
  session: {
    defaultTimeoutHours: number;
    maxConcurrentSessions: number;
  };
  consumers: {
    enabled: boolean;
    consumerName: string;
    streams: {
      userService: string;
    };
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
  security: {
    verifyOfflineIntentTokens: boolean;
    offlineIntentTokenActiveKeyId: string;
    offlineIntentTokenKeys: Record<string, string>;
    offlineIntentTokenIssuer: string;
    offlineIntentTokenAudience: string;
  };
}

// ============================================================================
// Environment Variable Parsing
// ============================================================================

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function optionalEnvInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${value}`);
  }
  return parsed;
}

function optionalEnvBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

// ============================================================================
// Offline Intent Token Key Ring Parsing
// ============================================================================

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

    return { activeKeyId, keys };
  }

  // Legacy single-secret fallback (optional — verification can be disabled)
  const legacySecret = (process.env['OFFLINE_INTENT_TOKEN_SECRET'] ?? '').trim();
  const activeKeyId = (activeKeyIdRaw ?? 'default').trim();

  if (legacySecret.length === 0) {
    return { activeKeyId, keys: {} };
  }

  return {
    activeKeyId,
    keys: {
      [activeKeyId]: ensureValidOfflineIntentTokenSecret(legacySecret, activeKeyId),
    },
  };
}

// ============================================================================
// Configuration Loading
// ============================================================================

export function loadConfig(): IServiceConfig {
  const environment = optionalEnv('NODE_ENV', 'development') as Environment;

  return {
    service: {
      name: 'session-service',
      version: optionalEnv('SERVICE_VERSION', '1.0.0'),
      environment,
    },
    server: {
      host: optionalEnv('HOST', '0.0.0.0'),
      port: optionalEnvInt('PORT', 3004),
    },
    database: {
      url: requireEnv('DATABASE_URL'),
    },
    redis: {
      url: requireEnv('REDIS_URL'),
      eventStreamKey: optionalEnv('REDIS_EVENT_STREAM', 'noema:events:session-service'),
      maxStreamLen: optionalEnvInt('REDIS_STREAM_MAX_LEN', 10000),
      outboxPollIntervalMs: optionalEnvInt('OUTBOX_POLL_INTERVAL_MS', 2000),
      outboxBatchSize: optionalEnvInt('OUTBOX_BATCH_SIZE', 100),
      outboxLeaseMs: optionalEnvInt('OUTBOX_LEASE_MS', 10000),
      outboxMaxAttempts: optionalEnvInt('OUTBOX_MAX_ATTEMPTS', 10),
      outboxRetryBaseDelayMs: optionalEnvInt('OUTBOX_RETRY_BASE_DELAY_MS', 1000),
      outboxRetryMaxDelayMs: optionalEnvInt('OUTBOX_RETRY_MAX_DELAY_MS', 60000),
      outboxDrainTimeoutMs: optionalEnvInt('OUTBOX_DRAIN_TIMEOUT_MS', 15000),
    },
    session: {
      defaultTimeoutHours: optionalEnvInt('SESSION_TIMEOUT_HOURS', 24),
      maxConcurrentSessions: optionalEnvInt('MAX_CONCURRENT_SESSIONS', 1),
    },
    consumers: {
      enabled: optionalEnvBool('CONSUMERS_ENABLED', true),
      consumerName: optionalEnv('CONSUMER_NAME', `session-service-${process.pid}`),
      streams: {
        userService: optionalEnv('CONSUMER_STREAM_USER_SERVICE', 'noema:events:user-service'),
      },
    },
    cors: {
      enabled: optionalEnvBool('CORS_ENABLED', false),
      origin: optionalEnv(
        'CORS_ORIGIN',
        'http://localhost:3000,http://localhost:3100,http://localhost:3004'
      )
        .split(',')
        .map((s) => s.trim()),
      credentials: optionalEnvBool('CORS_CREDENTIALS', true),
    },
    logging: {
      level: optionalEnv('LOG_LEVEL', environment === 'production' ? 'info' : 'debug'),
      pretty: optionalEnvBool('LOG_PRETTY', environment === 'development'),
    },
    security: {
      verifyOfflineIntentTokens: optionalEnvBool('VERIFY_OFFLINE_INTENT_TOKENS', true),
      ...(() => {
        const keyRing = parseOfflineIntentTokenKeyRing();
        return {
          offlineIntentTokenActiveKeyId: keyRing.activeKeyId,
          offlineIntentTokenKeys: keyRing.keys,
        };
      })(),
      offlineIntentTokenIssuer: optionalEnv('OFFLINE_INTENT_TOKEN_ISSUER', 'noema.session'),
      offlineIntentTokenAudience: optionalEnv('OFFLINE_INTENT_TOKEN_AUDIENCE', 'noema.mobile'),
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

export function getEventPublisherConfig(config: IServiceConfig) {
  return {
    streamKey: config.redis.eventStreamKey,
    maxLen: config.redis.maxStreamLen,
    serviceName: config.service.name,
    serviceVersion: config.service.version,
    environment: config.service.environment,
  };
}
