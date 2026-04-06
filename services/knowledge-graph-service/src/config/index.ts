/**
 * @noema/knowledge-graph-service - Service Configuration
 *
 * Environment-based configuration management.
 * Knowledge graph service verifies JWTs (issued by user-service) — does not create tokens.
 * Connects to both PostgreSQL (Prisma) and Neo4j (graph database).
 */

import type { Environment } from '@noema/types';
import os from 'node:os';
import path from 'node:path';
import {
  ProofRolloutMode,
  type ProofRolloutMode as ProofRolloutModeType,
} from '../domain/knowledge-graph-service/proof-stage.js';

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
    /** Proof-stage rollout mode for canonical commits. */
    proofStageMode: ProofRolloutModeType;
  };
  proof: {
    /** Root directory for persisted proof-stage artifacts. */
    artifactRootDirectory: string;
    /** Optional path to a TLA+ tools jar containing tlc2.TLC. */
    tlaToolsJarPath: string | null;
    /** Java executable used to invoke TLC when configured. */
    javaBinary: string;
    /** Max TLC execution time for a single mutation proof. */
    timeoutMs: number;
  };
  crdt: {
    /** Whether Layer 3 CRDT stats are enabled. */
    enabled: boolean;
    /** Replica identifier used to keep CRDT counters merge-safe. */
    replicaId: string;
  };
  ontologyImports: {
    /** Which YAGO archive variant to fetch by default. */
    yagoVariant: 'tiny' | 'full';
    /** Active ontology artifact used by canonical ontology reasoning. */
    activeArtifactPath: string;
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
  graphRestore: {
    /** Whether destructive restore execution is enabled. */
    executionEnabled: boolean;
    /** Whether restore execution requires a preview-derived confirmation token. */
    requireConfirmationToken: boolean;
    /** HMAC secret for restore confirmation tokens. */
    confirmationSecret: string;
    /** Restore confirmation token TTL in ms. */
    confirmationTtlMs: number;
  };
  postWriteRecovery: {
    intervalMs: number;
    batchSize: number;
    maxAttempts: number;
    retryBaseDelayMs: number;
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

function optionalNullableEnv(name: string): string | null {
  const value = process.env[name];
  return value === undefined || value === '' ? null : value;
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

function optionalProofRolloutMode(): ProofRolloutModeType {
  const explicitMode = process.env['MUTATION_PROOF_STAGE_MODE'];
  if (explicitMode !== undefined && explicitMode !== '') {
    const normalized = explicitMode.trim().toLowerCase();
    if (
      normalized === ProofRolloutMode.DISABLED ||
      normalized === ProofRolloutMode.OBSERVE_ONLY ||
      normalized === ProofRolloutMode.SOFT_BLOCK ||
      normalized === ProofRolloutMode.HARD_BLOCK
    ) {
      return normalized;
    }

    throw new Error(`Invalid proof rollout mode for MUTATION_PROOF_STAGE_MODE: ${explicitMode}`);
  }

  const legacyEnabled = process.env['MUTATION_PROOF_STAGE_ENABLED'];
  if (legacyEnabled !== undefined && legacyEnabled !== '') {
    return legacyEnabled.toLowerCase() === 'true'
      ? ProofRolloutMode.OBSERVE_ONLY
      : ProofRolloutMode.DISABLED;
  }

  return ProofRolloutMode.SOFT_BLOCK;
}

function optionalYagoVariant(name: string, defaultValue: 'tiny' | 'full'): 'tiny' | 'full' {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'tiny' || normalized === 'full') {
    return normalized;
  }

  throw new Error(`Invalid YAGO variant for ${name}: ${value}`);
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
      proofStageMode: optionalProofRolloutMode(),
    },
    proof: {
      artifactRootDirectory: optionalEnv(
        'PROOF_ARTIFACT_ROOT',
        '.data/knowledge-graph-service/proof-artifacts'
      ),
      tlaToolsJarPath: optionalNullableEnv('TLA_TOOLS_JAR_PATH'),
      javaBinary: optionalEnv('JAVA_BINARY', 'java'),
      timeoutMs: optionalEnvInt('TLA_PROOF_TIMEOUT_MS', 30_000),
    },
    crdt: {
      enabled: optionalEnvBool('GRAPH_CRDT_STATS_ENABLED', false),
      replicaId: optionalEnv(
        'GRAPH_CRDT_REPLICA_ID',
        `knowledge-graph-service-${String(process.pid)}`
      ),
    },
    ontologyImports: {
      yagoVariant: optionalYagoVariant('YAGO_VARIANT', 'full'),
      activeArtifactPath: optionalEnv(
        'ONTOLOGY_ACTIVE_ARTIFACT_PATH',
        path.join(
          os.homedir(),
          '.noema',
          'runtime',
          'knowledge-graph-service',
          'ontology-runtime',
          'active-ontology-artifact.json'
        )
      ),
    },
    cors: {
      enabled: optionalEnvBool('CORS_ENABLED', false),
      origin: parseCorsOrigin(
        optionalEnv(
          'CORS_ORIGIN',
          // Default: local frontends plus the root .env service port contract.
          [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:3002',
            'http://localhost:3003',
            'http://localhost:3004',
            'http://localhost:3100',
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
    graphRestore: {
      executionEnabled: optionalEnvBool('GRAPH_RESTORE_EXECUTION_ENABLED', false),
      requireConfirmationToken: optionalEnvBool('GRAPH_RESTORE_REQUIRE_CONFIRMATION', true),
      confirmationSecret: optionalEnv(
        'GRAPH_RESTORE_CONFIRMATION_SECRET',
        requireEnv('ACCESS_TOKEN_SECRET')
      ),
      confirmationTtlMs: optionalEnvInt('GRAPH_RESTORE_CONFIRMATION_TTL_MS', 15 * 60_000),
    },
    postWriteRecovery: {
      intervalMs: optionalEnvInt('PKG_POST_WRITE_RECOVERY_INTERVAL_MS', 5_000),
      batchSize: optionalEnvInt('PKG_POST_WRITE_RECOVERY_BATCH_SIZE', 50),
      maxAttempts: optionalEnvInt('PKG_POST_WRITE_RECOVERY_MAX_ATTEMPTS', 6),
      retryBaseDelayMs: optionalEnvInt('PKG_POST_WRITE_RECOVERY_BASE_DELAY_MS', 500),
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
