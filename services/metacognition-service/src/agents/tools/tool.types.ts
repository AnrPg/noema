import type { IToolExecutionResult, IToolResultMetadata } from '@noema/contracts';

export type { IToolResultMetadata };

export type ToolRetryClass = 'transient' | 'permanent' | 'unknown';
export type ToolFailureClass =
  | 'input.schema.invalid'
  | 'auth.missing_scope'
  | 'state.not_found'
  | 'internal.exception'
  | 'internal.unknown';
export type ToolFailureDomain = 'validation' | 'auth' | 'state' | 'internal';

export interface IScopeRequirement {
  match: 'all' | 'any';
  requiredScopes: string[];
}

export interface IToolCapabilities {
  idempotent: boolean;
  sideEffects: boolean;
  timeoutMs: number;
  costClass: 'low' | 'medium' | 'high';
}

export interface IToolResultMetadataExtended extends IToolResultMetadata {
  resultCode?: string;
  retryClass?: ToolRetryClass;
  failureClass?: ToolFailureClass;
  failureDomain?: ToolFailureDomain;
  toolName?: string;
  requestId?: string;
  attemptCount?: number;
}

export interface IToolDefinition {
  name: string;
  version: string;
  description: string;
  service: string;
  priority: 'P0' | 'P1' | 'P2';
  scopeRequirement: IScopeRequirement;
  capabilities: IToolCapabilities;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export type IToolResult = IToolExecutionResult;

export type ToolHandler = (
  input: unknown,
  userId: string,
  correlationId: string
) => Promise<IToolResult>;
