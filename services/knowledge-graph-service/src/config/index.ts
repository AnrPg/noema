/**
 * @noema/knowledge-graph-service - Service Configuration
 *
 * Environment-based configuration management.
 * Knowledge graph service verifies JWTs (issued by user-service) — does not create tokens.
 * Connects to both PostgreSQL (Prisma) and Neo4j (graph database).
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
    /** Global request body size limit in bytes (default: 1 MB) */
    bodyLimit: number;
    /** Max body size for batch endpoints in bytes (default: 5 MB) */
    batchBodyLimit: number;
  };
  database: {
    url: string;
  };
  neo4j: {
    uri: string;
    user: string;
    password: string;
    database: string;
    maxConnectionPoolSize: number;
    acquisitionTimeoutMs: number;
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
  rateLimit: {
    /** Global max requests per window */
    max: number;
    /** Time window in milliseconds */
    timeWindow: number;
    /** Max requests for write endpoints (POST/PUT/PATCH/DELETE) */
    writeMax: number;
    /** Max requests for batch endpoints */
    batchMax: number;
  };
  cache: {
    /** TTL for cached data in seconds */
    ttl: number;
    /** Cache key prefix */
    prefix: string;
    /** Whether caching is enabled */
    enabled: boolean;
  };
  consumers: {
    /** Whether event consumers are enabled */
    enabled: boolean;
    /** Unique consumer name within the group (typically hostname + pid) */
    consumerName: string;
    /** Stream keys for the source services */
    streams: {
      contentService: string;
      sessionService: string;
      userService: string;
    };
  };
  mutation: {
    /** Whether formal proof stage (TLA+ verification) is enabled.
     *  When false, proof stage auto-approves (Phase 6 behavior). */
    proofStageEnabled: boolean;
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
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ============================================================================
// Configuration Loading
// ============================================================================

export function loadConfig(): IServiceConfig {
  const environment = optionalEnv('NODE_ENV', 'development') as Environment;

  return {
    service: {
      name: 'knowledge-graph-service',
      version: optionalEnv('SERVICE_VERSION', '0.1.0'),
      environment,
    },
    server: {
      host: optionalEnv('HOST', '0.0.0.0'),
      port: optionalEnvInt('PORT', 3006),
      bodyLimit: optionalEnvInt('BODY_LIMIT', 1_048_576), // 1 MB
      batchBodyLimit: optionalEnvInt('BATCH_BODY_LIMIT', 5_242_880), // 5 MB
    },
    database: {
      url: requireEnv('DATABASE_URL'),
    },
    neo4j: {
      uri: requireEnv('NEO4J_URI'),
      user: optionalEnv('NEO4J_USER', 'neo4j'),
      password: requireEnv('NEO4J_PASSWORD'),
      database: optionalEnv('NEO4J_DATABASE', 'neo4j'),
      maxConnectionPoolSize: optionalEnvInt('NEO4J_MAX_CONNECTION_POOL_SIZE', 100),
      acquisitionTimeoutMs: optionalEnvInt('NEO4J_ACQUISITION_TIMEOUT_MS', 60_000),
    },
    redis: {
      url: requireEnv('REDIS_URL'),
      eventStreamKey: optionalEnv('REDIS_EVENT_STREAM', 'noema:events:knowledge-graph-service'),
      maxStreamLen: optionalEnvInt('REDIS_STREAM_MAX_LEN', 10_000),
    },
    auth: {
      accessTokenSecret: requireEnv('ACCESS_TOKEN_SECRET'),
      issuer: optionalEnv('JWT_ISSUER', 'noema.app'),
      audience: optionalEnv('JWT_AUDIENCE', 'noema.app'),
    },
    rateLimit: {
      max: optionalEnvInt('RATE_LIMIT_MAX', 100),
      timeWindow: optionalEnvInt('RATE_LIMIT_WINDOW_MS', 60_000), // 1 minute
      writeMax: optionalEnvInt('RATE_LIMIT_WRITE_MAX', 30),
      batchMax: optionalEnvInt('RATE_LIMIT_BATCH_MAX', 10),
    },
    cache: {
      ttl: optionalEnvInt('CACHE_TTL_SECONDS', 300), // 5 minutes
      prefix: optionalEnv('CACHE_PREFIX', 'kgs'), // knowledge-graph-service
      enabled: optionalEnvBool('CACHE_ENABLED', true),
    },
    consumers: {
      enabled: optionalEnvBool('EVENT_CONSUMERS_ENABLED', true),
      consumerName: optionalEnv('CONSUMER_NAME', `knowledge-graph-service-${String(process.pid)}`),
      streams: {
        contentService: optionalEnv('EVENT_STREAM_CONTENT', 'noema:events:content-service'),
        sessionService: optionalEnv('EVENT_STREAM_SESSION', 'noema:events:session-service'),
        userService: optionalEnv('EVENT_STREAM_USER', 'noema:events:user-service'),
      },
    },
    mutation: {
      proofStageEnabled: optionalEnvBool('MUTATION_PROOF_STAGE_ENABLED', false),
    },
    cors: {
      enabled: optionalEnvBool('CORS_ENABLED', false),
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

export function getTokenVerifierConfig(config: IServiceConfig): {
  accessTokenSecret: string;
  issuer: string;
  audience: string;
} {
  return {
    accessTokenSecret: config.auth.accessTokenSecret,
    issuer: config.auth.issuer,
    audience: config.auth.audience,
  };
}

/** @internal Reserved for future event consumer wiring — not yet used in this service. */
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
