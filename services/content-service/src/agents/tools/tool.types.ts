/**
 * @noema/content-service - MCP Tool Type Definitions
 *
 * Shared types for the MCP Agent Tool layer.
 * IToolResult re-exports IToolExecutionResult from @noema/contracts.
 */

import type { IToolExecutionResult, IToolResultMetadata } from '@noema/contracts';

export type { IToolResultMetadata };

export type ToolRetryClass = 'transient' | 'permanent' | 'unknown';

export type ToolFailureClass =
  | 'input.schema.invalid'
  | 'input.constraint.violation'
  | 'input.unsupported'
  | 'auth.missing_scope'
  | 'auth.invalid_token'
  | 'auth.forbidden'
  | 'rate.limit.exceeded'
  | 'quota.exceeded'
  | 'network.timeout'
  | 'network.unavailable'
  | 'dependency.timeout'
  | 'dependency.unavailable'
  | 'dependency.contract_mismatch'
  | 'state.conflict'
  | 'state.not_found'
  | 'idempotency.duplicate'
  | 'internal.invariant_violation'
  | 'internal.exception'
  | 'internal.unknown';

export type ToolFailureDomain =
  | 'network'
  | 'validation'
  | 'auth'
  | 'internal'
  | 'dependency'
  | 'state'
  | 'abuse';

export interface IScopeRequirement {
  match: 'all' | 'any';
  requiredScopes: string[];
  optionalScopes?: string[];
  deniedScopes?: string[];
}

export interface IToolCapabilities {
  idempotent: boolean;
  sideEffects: boolean;
  timeoutMs: number;
  costClass: 'low' | 'medium' | 'high';
  supportsDryRun?: boolean;
  supportsAsync?: boolean;
  supportsStreaming?: boolean;
  maxBatchSize?: number;
  consistency?: 'eventual' | 'strong';
}

export interface IToolResultMetadataExtended extends IToolResultMetadata {
  resultCode?: string;
  retryClass?: ToolRetryClass;
  failureClass?: ToolFailureClass;
  failureDomain?: ToolFailureDomain;
  validationErrors?: string[];
  retryAfterMs?: number;
  httpStatusHint?: number;
  isTimeout?: boolean;
  isCircuitOpen?: boolean;
  dependencyName?: string;
  scopeEvaluation?: {
    match: 'all' | 'any';
    requiredScopes: string[];
    grantedScopes?: string[];
    missingScopes?: string[];
  };
  toolName?: string;
  attemptCount?: number;
  requestId?: string;
}

// ============================================================================
// Tool Types
// ============================================================================

/**
 * MCP tool definition — describes a single tool for agent discovery.
 */
export interface IToolDefinition {
  /** Unique tool name (kebab-case, e.g. 'create-card') */
  name: string;
  /** Tool contract version (semver) */
  version: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** Owning service name */
  service: string;
  /** Priority tier (P0 = critical, P1 = important, P2 = nice-to-have) */
  priority: 'P0' | 'P1' | 'P2';
  /** Per-tool authorization requirement */
  scopeRequirement: IScopeRequirement;
  /** Runtime capability and planning metadata */
  capabilities: IToolCapabilities;
  /** JSON Schema describing the tool's expected input */
  inputSchema: Record<string, unknown>;
  /** Optional JSON schema for output payload */
  outputSchema?: Record<string, unknown>;
}

/**
 * Result returned by a tool handler execution.
 *
 * Re-exports {@link IToolExecutionResult} from \@noema/contracts.
 * Metadata is populated by {@link ToolRegistry.execute}, not by individual handlers.
 */
export type IToolResult = IToolExecutionResult;

/**
 * Tool handler function signature.
 * Receives raw input, authenticated userId, and a correlation ID.
 */
export type ToolHandler = (
  input: unknown,
  userId: string,
  correlationId: string
) => Promise<IToolResult>;
