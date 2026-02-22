/**
 * @noema/session-service - Tool Type Definitions
 *
 * Types for MCP tool registration and execution.
 * Follows content-service tool pattern.
 */

import type { IToolExecutionResult } from '@noema/contracts';

/**
 * Tool definition for service discovery.
 */
export interface IToolDefinition {
  name: string;
  description: string;
  service: string;
  priority: 'P0' | 'P1' | 'P2';
  inputSchema: Record<string, unknown>;
}

/**
 * Tool execution result.
 */
export type IToolResult = IToolExecutionResult;

/**
 * Simplified tool result returned by handlers.
 * The ToolRegistry wraps these into full IToolResult with agentHints.
 */
export interface IToolHandlerResult {
  success: boolean;
  data: unknown;
  error: string | null;
}

/**
 * Tool handler function signature.
 * Returns a simplified result; the registry enriches it to IToolResult.
 */
export type ToolHandler = (
  input: Record<string, unknown>,
  userId: string,
  correlationId: string
) => Promise<IToolHandlerResult>;
