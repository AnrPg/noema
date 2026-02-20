/**
 * @noema/content-service - Service Configuration
 *
 * Environment-based configuration management.
 * Content service only verifies JWTs (issued by user-service).
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
  };
  auth: {
    /** Shared secret for verifying access tokens (must match user-service) */
    accessTokenSecret: string;
    issuer: string;
    audience: string;
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
// Configuration Loading
// ============================================================================

export function loadConfig(): IServiceConfig {
  const environment = optionalEnv('NODE_ENV', 'development') as Environment;

  return {
    service: {
      name: 'content-service',
      version: optionalEnv('SERVICE_VERSION', '1.0.0'),
      environment,
    },
    server: {
      host: optionalEnv('HOST', '0.0.0.0'),
      port: optionalEnvInt('PORT', 3005),
    },
    database: {
      url: requireEnv('DATABASE_URL'),
    },
    redis: {
      url: requireEnv('REDIS_URL'),
      eventStreamKey: optionalEnv('REDIS_EVENT_STREAM', 'noema:events:content-service'),
      maxStreamLen: optionalEnvInt('REDIS_STREAM_MAX_LEN', 10000),
    },
    auth: {
      accessTokenSecret: requireEnv('ACCESS_TOKEN_SECRET'),
      issuer: optionalEnv('JWT_ISSUER', 'noema.app'),
      audience: optionalEnv('JWT_AUDIENCE', 'noema.app'),
    },
    cors: {
      origin: optionalEnv(
        'CORS_ORIGIN',
        'http://localhost:3000,http://localhost:3004,http://localhost:3003'
      )
        .split(',')
        .map((s) => s.trim()),
      credentials: optionalEnvBool('CORS_CREDENTIALS', true),
    },
    logging: {
      level: optionalEnv('LOG_LEVEL', environment === 'production' ? 'info' : 'debug'),
      pretty: optionalEnvBool('LOG_PRETTY', environment === 'development'),
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

export function getTokenVerifierConfig(config: IServiceConfig) {
  return {
    accessTokenSecret: config.auth.accessTokenSecret,
    issuer: config.auth.issuer,
    audience: config.auth.audience,
  };
}

export function getEventPublisherConfig(config: IServiceConfig) {
  return {
    streamKey: config.redis.eventStreamKey,
    maxLen: config.redis.maxStreamLen,
    serviceName: config.service.name,
    serviceVersion: config.service.version,
    environment: config.service.environment,
  };
}
