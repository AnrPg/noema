import type { IToolExecutionResult, IToolResultMetadata } from '@noema/contracts';

export type { IToolResultMetadata };

export interface IToolDefinition {
  name: string;
  version: string;
  description: string;
  service: string;
  priority: 'P0' | 'P1' | 'P2';
  scopeRequirement: { match: 'all' | 'any'; requiredScopes: string[] };
  capabilities: {
    idempotent: boolean;
    sideEffects: boolean;
    timeoutMs: number;
    costClass: 'low' | 'medium' | 'high';
  };
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface IToolResultMetadataExtended extends IToolResultMetadata {
  resultCode?: string;
  toolName?: string;
  requestId?: string;
  attemptCount?: number;
}

export type IToolResult = IToolExecutionResult;
export type ToolHandler = (
  input: unknown,
  userId: string,
  correlationId: string
) => Promise<IToolResult>;
