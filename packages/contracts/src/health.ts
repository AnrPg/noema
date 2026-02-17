/**
 * @noema/contracts - Health Check Contract
 *
 * Universal health check types for all services.
 * Used by Kubernetes readiness/liveness probes and monitoring.
 */

// ============================================================================
// Health Status
// ============================================================================

/**
 * Overall service health status.
 */
export const HealthStatus = {
  /** Service is fully operational */
  HEALTHY: 'healthy',
  /** Service is operational but some dependencies are degraded */
  DEGRADED: 'degraded',
  /** Service is not operational */
  UNHEALTHY: 'unhealthy',
} as const;

export type HealthStatus = (typeof HealthStatus)[keyof typeof HealthStatus];

/**
 * Individual dependency check status.
 */
export const DependencyStatus = {
  /** Dependency is reachable and responsive */
  UP: 'up',
  /** Dependency is not reachable or unresponsive */
  DOWN: 'down',
  /** Dependency status is unknown (check failed) */
  UNKNOWN: 'unknown',
} as const;

export type DependencyStatus = (typeof DependencyStatus)[keyof typeof DependencyStatus];

// ============================================================================
// Check Results
// ============================================================================

/**
 * Result of a single dependency health check.
 */
export interface IDependencyCheck {
  /** Dependency status */
  status: DependencyStatus;

  /** Response latency in milliseconds */
  latencyMs: number;

  /** When this check was performed (ISO 8601) */
  checkedAt: string;

  /** Optional error message if status is DOWN */
  error?: string;

  /** Optional additional details */
  details?: Record<string, unknown>;
}

/**
 * Standard health check response.
 * Every service exposes this at GET /health
 */
export interface IHealthCheckResponse {
  /** Overall service status */
  status: HealthStatus;

  /** Service name */
  service: string;

  /** Service version (semver) */
  version: string;

  /** When this response was generated (ISO 8601) */
  timestamp: string;

  /** Service uptime in seconds */
  uptimeSeconds: number;

  /** Individual dependency checks */
  checks: {
    /** Primary database connection */
    database?: IDependencyCheck;

    /** Redis cache connection */
    redis?: IDependencyCheck;

    /** RabbitMQ / message queue */
    messageQueue?: IDependencyCheck;

    /** External API dependencies */
    externalApis?: Record<string, IDependencyCheck>;

    /** Other services this service depends on */
    services?: Record<string, IDependencyCheck>;
  };
}

// ============================================================================
// Readiness / Liveness
// ============================================================================

/**
 * Kubernetes liveness probe response.
 * Simple check: is the process alive?
 */
export interface ILivenessResponse {
  /** Always 'alive' if the service responds */
  status: 'alive';

  /** Service name */
  service: string;

  /** Response timestamp (ISO 8601) */
  timestamp: string;
}

/**
 * Kubernetes readiness probe response.
 * Check: is the service ready to receive traffic?
 */
export interface IReadinessResponse {
  /** Whether service is ready */
  ready: boolean;

  /** Service name */
  service: string;

  /** Response timestamp (ISO 8601) */
  timestamp: string;

  /** Reason if not ready */
  reason?: string;
}
