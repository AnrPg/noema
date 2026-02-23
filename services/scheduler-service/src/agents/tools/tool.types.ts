import type { IToolExecutionResult, IToolResultMetadata } from '@noema/contracts';

export type { IToolResultMetadata };

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
}

/**
 * Extended tool result metadata with observability fields (Phase 4).
 */
export interface IToolResultMetadataExtended extends IToolResultMetadata {
  /** Machine-readable result code for categorization */
  resultCode?: string;
  /** Retry classification (transient, permanent, unknown) */
  retryClass?: 'transient' | 'permanent' | 'unknown';
  /** Failure domain for incident triage (network, validation, auth, internal) */
  failureDomain?: 'network' | 'validation' | 'auth' | 'internal' | 'dependency';
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
