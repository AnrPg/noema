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
  minio: {
    endPoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
    bucket: string;
    presignedUrlExpiry: number;
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

/**
 * Parse CORS_ORIGIN env variable.
 * Supports:
 * - Comma-separated origins: "http://localhost:3000,http://localhost:3001"
 * - Wildcard for development: "*" (allows all origins)
 */
function parseCorsOrigin(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed === '*') {
    // Wildcard mode — Fastify CORS accepts '*' as a string origin
    return ['*'];
  }
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
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
    minio: {
      endPoint: optionalEnv('MINIO_ENDPOINT', 'localhost'),
      port: optionalEnvInt('MINIO_PORT', 9000),
      useSSL: optionalEnvBool('MINIO_USE_SSL', false),
      accessKey: optionalEnv('MINIO_ACCESS_KEY', 'noema'),
      secretKey: optionalEnv('MINIO_SECRET_KEY', 'noema_minio_password'),
      bucket: optionalEnv('MINIO_BUCKET', 'content'),
      presignedUrlExpiry: optionalEnvInt('MINIO_PRESIGNED_EXPIRY', 3600),
    },
    cors: {
      origin: parseCorsOrigin(
        optionalEnv(
          'CORS_ORIGIN',
          // Default: all Noema service ports + frontends
          // 3000=web, 3001=user-service, 3002=session, 3003=web-admin,
          // 3004=mobile, 3005=content, 3006=knowledge-graph, 3007=analytics,
          // 3008=notification, 3009=gamification, 3010=collaboration,
          // 3011=media, 3012=sync, 3013=vector, 3014=scheduler, 3015=ingestion
          [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:3002',
            'http://localhost:3003',
            'http://localhost:3004',
            'http://localhost:3005',
            'http://localhost:3006',
            'http://localhost:3007',
            'http://localhost:3008',
            'http://localhost:3009',
            'http://localhost:3010',
            'http://localhost:3011',
            'http://localhost:3012',
            'http://localhost:3013',
            'http://localhost:3014',
            'http://localhost:3015',
          ].join(',')
        )
      ),
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

export function getMinioConfig(config: IServiceConfig) {
  return {
    endPoint: config.minio.endPoint,
    port: config.minio.port,
    useSSL: config.minio.useSSL,
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey,
    bucket: config.minio.bucket,
    presignedUrlExpiry: config.minio.presignedUrlExpiry,
  };
}
