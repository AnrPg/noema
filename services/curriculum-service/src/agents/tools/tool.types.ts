import type { IToolExecutionResult } from '@noema/contracts';

export interface IToolDefinition {
  name: string;
  version: string;
  description: string;
  service: 'curriculum-service';
  priority: 'P0' | 'P1' | 'P2';
  scopeRequirement: {
    match: 'all' | 'any';
    requiredScopes: string[];
  };
  capabilities: {
    idempotent: boolean;
    sideEffects: boolean;
    timeoutMs: number;
    costClass: 'low' | 'medium' | 'high';
    supportsAsync?: boolean;
  };
  inputSchema: Record<string, unknown>;
}

export type IToolResult = IToolExecutionResult;

export type ToolHandler = (
  input: unknown,
  userId: string,
  correlationId: string
) => Promise<IToolResult>;
