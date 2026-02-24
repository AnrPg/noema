import type { IToolExecutionResult, IToolResultMetadata } from '@noema/contracts';

export type { IToolResultMetadata };

export type ToolRetryClass = 'transient' | 'permanent' | 'unknown';

export type ToolFailureClass =
  | 'input.schema.invalid'
  | 'input.constraint.violation'
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

// ============================================================================
// Tool Capabilities (Phase 4)
// ============================================================================

/**
 * Tool capability metadata for orchestration planning.
 * Matches OpenAPI ToolDefinition.capabilities schema.
 */
export interface IToolCapabilities {
  /** Whether the tool is idempotent (can be safely retried) */
  idempotent: boolean;
  /** Whether the tool has side effects (mutations) */
  sideEffects: boolean;
  /** Expected maximum execution time in milliseconds */
  timeoutMs: number;
  /** Cost class for rate limiting and budget planning */
  costClass: 'low' | 'medium' | 'high';
  supportsDryRun?: boolean;
  supportsAsync?: boolean;
  supportsStreaming?: boolean;
  maxBatchSize?: number;
  consistency?: 'eventual' | 'strong';
}

/**
 * Scope requirement specification for tool authorization.
 * Matches OpenAPI ScopeRequirement schema.
 */
export interface IScopeRequirement {
  /** How to match required scopes (all = AND, any = OR) */
  match: 'all' | 'any';
  /** List of required scope strings */
  requiredScopes: string[];
  optionalScopes?: string[];
  deniedScopes?: string[];
}

/**
 * Extended tool result metadata with observability fields (Phase 4).
 */
export interface IToolResultMetadataExtended extends IToolResultMetadata {
  /** Machine-readable result code for categorization */
  resultCode?: string;
  /** Retry classification (transient, permanent, unknown) */
  retryClass?: ToolRetryClass;
  failureClass?: ToolFailureClass;
  failureDomain?: ToolFailureDomain;
  validationErrors?: string[];
  retryAfterMs?: number;
  httpStatusHint?: number;
  toolName?: string;
  attemptCount?: number;
  requestId?: string;
}

// ============================================================================
// Tool Definition (Phase 4)
// ============================================================================

/**
 * MCP tool definition for scheduler-service.
 * Extended with capability metadata and scope requirements (Phase 4).
 */
export interface IToolDefinition {
  /** Unique tool name (kebab-case) */
  name: string;
  /** Tool contract version (semver) */
  version: string;
  /** Human-readable description */
  description: string;
  /** Owning service name */
  service: string;
  /** Priority tier (P0 = critical, P1 = important, P2 = nice-to-have) */
  priority: 'P0' | 'P1' | 'P2';
  /** Scope requirement for authorization */
  scopeRequirement: IScopeRequirement;
  /** Tool capability metadata */
  capabilities: IToolCapabilities;
  /** JSON Schema describing the tool's expected input */
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

// ============================================================================
// Tool Handler
// ============================================================================

export type IToolResult = IToolExecutionResult;

export type ToolHandler = (
  input: unknown,
  userId: string,
  correlationId: string
) => Promise<IToolResult>;
