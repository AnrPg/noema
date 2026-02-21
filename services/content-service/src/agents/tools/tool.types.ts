/**
 * @noema/content-service - MCP Tool Type Definitions
 *
 * Shared types for the MCP Agent Tool layer.
 * IToolResult re-exports IToolExecutionResult from @noema/contracts.
 */

import type { IToolExecutionResult, IToolResultMetadata } from '@noema/contracts';

export type { IToolResultMetadata };

// ============================================================================
// Tool Types
// ============================================================================

/**
 * MCP tool definition — describes a single tool for agent discovery.
 */
export interface IToolDefinition {
  /** Unique tool name (kebab-case, e.g. 'create-card') */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** Owning service name */
  service: string;
  /** Priority tier (P0 = critical, P1 = important, P2 = nice-to-have) */
  priority: 'P0' | 'P1' | 'P2';
  /** JSON Schema describing the tool's expected input */
  inputSchema: Record<string, unknown>;
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
