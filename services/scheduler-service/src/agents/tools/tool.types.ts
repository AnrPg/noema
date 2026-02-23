import type { IToolExecutionResult, IToolResultMetadata } from '@noema/contracts';

export type { IToolResultMetadata };

export interface IToolDefinition {
  name: string;
  description: string;
  service: string;
  priority: 'P0' | 'P1' | 'P2';
  requiredScopes: string[];
  inputSchema: Record<string, unknown>;
}

export type IToolResult = IToolExecutionResult;

export type ToolHandler = (
  input: unknown,
  userId: string,
  correlationId: string
) => Promise<IToolResult>;
