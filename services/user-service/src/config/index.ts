/**
 * @noema/user-service - Service Configuration
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
  };
  auth: {
    accessTokenSecret: string;
    refreshTokenSecret: string;
    accessTokenExpiresIn: string;
    refreshTokenExpiresIn: string;
    issuer: string;
    audience: string;
    bcryptRounds: number;
    maxLoginAttempts: number;
    lockoutDurationMinutes: number;
  };
  cors: {
    enabled: boolean;
    origin: string[];
    credentials: boolean;
  };
  integrations: {
    sessionServiceUrl: string;
    requestTimeoutMs: number;
  };
  logging: {
    level: string;
    pretty: boolean;
  };
}

export interface ITokenConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenExpiresIn: string;
  refreshTokenExpiresIn: string;
  issuer: string;
  audience: string;
}

export interface IEventPublisherConfig {
  streamKey: string;
  maxLen: number;
  serviceName: string;
  serviceVersion: string;
  environment: Environment;
}

export interface ISessionOrchestrationConfig {
  sessionServiceUrl: string;
  requestTimeoutMs: number;
}

// ============================================================================
// Environment Variable Parsing
// ============================================================================

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

// ============================================================================
// Configuration Loading
// ============================================================================

export function loadConfig(): IServiceConfig {
  const environment = optionalEnv('NODE_ENV', 'development') as Environment;

  return {
    service: {
      name: 'user-service',
      version: optionalEnv('SERVICE_VERSION', '1.0.0'),
      environment,
    },
    server: {
      host: optionalEnv('HOST', '0.0.0.0'),
      port: optionalEnvInt('PORT', 3001),
    },
    database: {
      url: requireEnv('DATABASE_URL'),
    },
    redis: {
      url: requireEnv('REDIS_URL'),
      eventStreamKey: optionalEnv('REDIS_EVENT_STREAM', 'noema:events:user-service'),
      maxStreamLen: optionalEnvInt('REDIS_STREAM_MAX_LEN', 10000),
    },
    auth: {
      accessTokenSecret: requireEnv('ACCESS_TOKEN_SECRET'),
      refreshTokenSecret: requireEnv('REFRESH_TOKEN_SECRET'),
      accessTokenExpiresIn: optionalEnv('ACCESS_TOKEN_EXPIRES_IN', '15m'),
      refreshTokenExpiresIn: optionalEnv('REFRESH_TOKEN_EXPIRES_IN', '7d'),
      issuer: optionalEnv('JWT_ISSUER', 'noema.app'),
      audience: optionalEnv('JWT_AUDIENCE', 'noema.app'),
      bcryptRounds: optionalEnvInt('BCRYPT_ROUNDS', 12),
      maxLoginAttempts: optionalEnvInt('MAX_LOGIN_ATTEMPTS', 5),
      lockoutDurationMinutes: optionalEnvInt('LOCKOUT_DURATION_MINUTES', 15),
    },
    cors: {
      enabled: optionalEnvBool('CORS_ENABLED', false),
      origin: optionalEnv(
        'CORS_ORIGIN',
        'http://localhost:3000,http://localhost:3004,http://localhost:3003'
      )
        .split(',')
        .map((s) => s.trim()),
      credentials: optionalEnvBool('CORS_CREDENTIALS', true),
    },
    integrations: {
      sessionServiceUrl: optionalEnv('SESSION_SERVICE_URL', 'http://localhost:3003'),
      requestTimeoutMs: optionalEnvInt('INTEGRATION_REQUEST_TIMEOUT_MS', 5000),
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

export function getTokenConfig(config: IServiceConfig): ITokenConfig {
  return {
    accessTokenSecret: config.auth.accessTokenSecret,
    refreshTokenSecret: config.auth.refreshTokenSecret,
    accessTokenExpiresIn: config.auth.accessTokenExpiresIn,
    refreshTokenExpiresIn: config.auth.refreshTokenExpiresIn,
    issuer: config.auth.issuer,
    audience: config.auth.audience,
  };
}

export function getEventPublisherConfig(config: IServiceConfig): IEventPublisherConfig {
  return {
    streamKey: config.redis.eventStreamKey,
    maxLen: config.redis.maxStreamLen,
    serviceName: config.service.name,
    serviceVersion: config.service.version,
    environment: config.service.environment,
  };
}

export function getSessionOrchestrationConfig(config: IServiceConfig): ISessionOrchestrationConfig {
  return {
    sessionServiceUrl: config.integrations.sessionServiceUrl,
    requestTimeoutMs: config.integrations.requestTimeoutMs,
  };
}
