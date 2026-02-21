/**
 * @noema/contracts - Response Wrappers
 *
 * Standardized response structures for APIs and tools.
 * All responses include data, agentHints, and metadata.
 */

import type { JsonValue, Metadata } from '@noema/types';
import type { IAgentHints } from './agent-hints.js';

// ============================================================================
// API Response
// ============================================================================

/**
 * Standard metadata included in API responses.
 */
export interface IResponseMetadata {
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
export interface IPaginationInfo {
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
export interface IApiResponse<TData> {
  /** The primary response data */
  data: TData;

  /** Hints for agent guidance */
  agentHints: IAgentHints;

  /** Response metadata */
  metadata: IResponseMetadata;

  /** Pagination info (for list responses) */
  pagination?: IPaginationInfo;
}

/**
 * Standard API error response.
 */
export interface IApiErrorResponse {
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
  metadata: IResponseMetadata;
}

// ============================================================================
// Tool Result
// ============================================================================

/**
 * Metadata included in tool results.
 */
export interface IToolResultMetadata {
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
export interface IToolResult<TResult> {
  /** The primary result data */
  data: TResult;

  /** Hints for agent guidance (NEVER omit) */
  agentHints: IAgentHints;

  /** Tool execution metadata */
  metadata: IToolResultMetadata;
}

/**
 * Result from executing an MCP tool handler.
 *
 * Unlike {@link IToolResult} (the wire response format), this includes a
 * success/error discriminant because tool handlers may fail.  Metadata is
 * populated by the ToolRegistry after execution — handlers may omit it.
 *
 * @typeParam TResult - The result data type (default: unknown)
 */
export interface IToolExecutionResult<TResult = unknown> {
  /** Whether the tool executed successfully */
  success: boolean;

  /** Result data (present when success=true) */
  data?: TResult;

  /** Error info (present when success=false) */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };

  /** Agent guidance hints (always present) */
  agentHints: IAgentHints;

  /** Execution metadata — populated by ToolRegistry.execute() */
  metadata?: IToolResultMetadata;
}

// ============================================================================
// Tool Context
// ============================================================================

/**
 * Context provided to tool handlers.
 */
export interface IToolContext {
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
  | { success: true; data: TData; agentHints: IAgentHints }
  | { success: false; error: TError; agentHints?: IAgentHints };

/**
 * Helper to create successful service result.
 */
export function serviceOk<TData>(
  data: TData,
  agentHints: IAgentHints
): ServiceResult<TData, never> {
  return { success: true, data, agentHints };
}

/**
 * Helper to create failed service result.
 */
export function serviceErr<TError>(
  error: TError,
  agentHints?: IAgentHints
): ServiceResult<never, TError> {
  const base: { success: false; error: TError } = { success: false, error };
  if (agentHints !== undefined) {
    return { ...base, agentHints };
  }
  return base;
}
