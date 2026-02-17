/**
 * @noema/contracts - Response Wrappers
 *
 * Standardized response structures for APIs and tools.
 * All responses include data, agentHints, and metadata.
 */

import type { Metadata, JsonValue } from '@noema/types';
import type { AgentHints } from './agent-hints.js';

// ============================================================================
// API Response
// ============================================================================

/**
 * Standard metadata included in API responses.
 */
export interface ResponseMetadata {
  /** Request ID for tracing */
  requestId: string;

  /** When response was generated (ISO 8601) */
  timestamp: string;

  /** Service that generated response */
  serviceName: string;

  /** Service version */
  serviceVersion: string;

  /** Execution time in ms */
  executionTime: number;

  /** Cache status */
  cached?: boolean;

  /** Number of items (for list responses) */
  count?: number;

  /** Additional metadata */
  additional?: Metadata;
}

/**
 * Pagination info for list responses.
 */
export interface PaginationInfo {
  /** Current page offset */
  offset: number;

  /** Items per page */
  limit: number;

  /** Total items available */
  total: number;

  /** Whether more items exist */
  hasMore: boolean;

  /** Cursor for next page (if using cursor pagination) */
  nextCursor?: string;
}

/**
 * Standard API response wrapper.
 *
 * @typeParam TData - The data type being returned
 */
export interface ApiResponse<TData> {
  /** The primary response data */
  data: TData;

  /** Hints for agent guidance */
  agentHints: AgentHints;

  /** Response metadata */
  metadata: ResponseMetadata;

  /** Pagination info (for list responses) */
  pagination?: PaginationInfo;
}

/**
 * Standard API error response.
 */
export interface ApiErrorResponse {
  /** Error details */
  error: {
    /** Machine-readable error code */
    code: string;

    /** Human-readable message */
    message: string;

    /** Field-level errors (validation) */
    fieldErrors?: Record<string, string[]>;

    /** Additional error context */
    details?: JsonValue;

    /** Stack trace (dev only) */
    stack?: string;
  };

  /** Response metadata */
  metadata: ResponseMetadata;
}

// ============================================================================
// Tool Result
// ============================================================================

/**
 * Metadata included in tool results.
 */
export interface ToolResultMetadata {
  /** Tool version (semver) */
  toolVersion: string;

  /** When tool executed (ISO 8601) */
  timestamp: string;

  /** Execution time in ms */
  executionTime: number;

  /** Service version */
  serviceVersion: string;

  /** Distributed trace ID */
  traceId?: string;

  /** Request correlation ID */
  correlationId?: string;

  /** Whether result was cached */
  cached?: boolean;
}

/**
 * Standard tool result wrapper (MCP format).
 *
 * @typeParam TResult - The result data type
 */
export interface ToolResult<TResult> {
  /** The primary result data */
  data: TResult;

  /** Hints for agent guidance (NEVER omit) */
  agentHints: AgentHints;

  /** Tool execution metadata */
  metadata: ToolResultMetadata;
}

// ============================================================================
// Tool Context
// ============================================================================

/**
 * Context provided to tool handlers.
 */
export interface ToolContext {
  /** User making the request (null for system) */
  userId?: string | null;

  /** Current session ID */
  sessionId?: string | null;

  /** Request correlation UUID */
  correlationId: string;

  /** Distributed trace UUID */
  traceId: string;

  /** Which agent is calling */
  agentId: string;

  /** Agent version */
  agentVersion: string;

  /** When request was made (ISO 8601) */
  timestamp: string;

  /** Additional context */
  additional?: Metadata;
}

// ============================================================================
// Service Result
// ============================================================================

/**
 * Result type for service operations (internal).
 * Includes agentHints for agent-callable services.
 *
 * @typeParam TData - The data type
 * @typeParam TError - The error type
 */
export type ServiceResult<TData, TError = Error> =
  | { success: true; data: TData; agentHints: AgentHints }
  | { success: false; error: TError; agentHints?: AgentHints };

/**
 * Helper to create successful service result.
 */
export function serviceOk<TData>(
  data: TData,
  agentHints: AgentHints
): ServiceResult<TData, never> {
  return { success: true, data, agentHints };
}

/**
 * Helper to create failed service result.
 */
export function serviceErr<TError>(
  error: TError,
  agentHints?: AgentHints
): ServiceResult<never, TError> {
  const base = { success: false as const, error };
  if (agentHints !== undefined) {
    return { ...base, agentHints };
  }
  return base;
}
