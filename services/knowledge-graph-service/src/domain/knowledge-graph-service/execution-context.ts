/**
 * @noema/knowledge-graph-service — Execution Context & Service Result Types
 *
 * Extracted from knowledge-graph.service.ts (D3) to allow reuse
 * without coupling to the full service interface.
 */

import type { IAgentHints } from '@noema/contracts';
import type { CorrelationId, UserId } from '@noema/types';

// ============================================================================
// Execution Context
// ============================================================================

/**
 * Execution context for service operations.
 * Follows the content-service pattern.
 */
export interface IExecutionContext {
  /** Current user ID (null for anonymous) */
  userId: UserId | null;
  /** Request correlation ID */
  correlationId: CorrelationId;
  /** User roles for authorization */
  roles: string[];
  /** Client IP for audit */
  clientIp?: string;
  /** User agent */
  userAgent?: string;
}

// ============================================================================
// Service Result
// ============================================================================

/**
 * Service result wrapper — every service method returns this.
 *
 * Bundles the response data with `IAgentHints`. For example, a
 * `createEdge` response might hint "this node now has 8 prerequisites,
 * which is unusually high — consider reviewing if all are truly
 * necessary."
 */
export interface IServiceResult<T> {
  /** Result data */
  data: T;
  /** Agent hints for next actions */
  agentHints: IAgentHints;
}
