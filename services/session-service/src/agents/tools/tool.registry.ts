/**
 * @noema/session-service - Tool Registry
 *
 * Central registry for MCP tool discovery and execution.
 * Wraps handler results into full IToolResult with agentHints.
 */

import { createEmptyAgentHints } from '@noema/contracts';
import type { Logger } from 'pino';
import type { SessionService } from '../../domain/session-service/session.service.js';
import { SESSION_TOOL_DEFINITIONS, createSessionToolHandlers } from './session.tools.js';
import type { IToolDefinition, IToolResult, ToolHandler } from './tool.types.js';

export class ToolRegistry {
  private readonly handlers = new Map<string, ToolHandler>();
  private readonly definitions: IToolDefinition[] = [];
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'ToolRegistry' });
  }

  register(definition: IToolDefinition, handler: ToolHandler): void {
    this.definitions.push(definition);
    this.handlers.set(definition.name, handler);
    this.logger.debug({ tool: definition.name }, 'Tool registered');
  }

  get(name: string): ToolHandler | undefined {
    return this.handlers.get(name);
  }

  listDefinitions(): IToolDefinition[] {
    return [...this.definitions];
  }

  async execute(
    name: string,
    input: Record<string, unknown>,
    userId: string,
    correlationId: string,
  ): Promise<IToolResult> {
    const handler = this.handlers.get(name);
    if (!handler) {
      return {
        success: false,
        error: { code: 'TOOL_NOT_FOUND', message: `Tool '${name}' not found` },
        agentHints: createEmptyAgentHints(),
      };
    }

    this.logger.info({ tool: name, userId }, 'Executing tool');
    const start = Date.now();

    try {
      const handlerResult = await handler(input, userId, correlationId);
      this.logger.info(
        { tool: name, durationMs: Date.now() - start, success: handlerResult.success },
        'Tool executed',
      );

      // Wrap handler result into full IToolResult
      return {
        success: handlerResult.success,
        data: handlerResult.data,
        agentHints: createEmptyAgentHints(),
        ...(handlerResult.error != null && {
          error: { code: 'TOOL_ERROR', message: handlerResult.error },
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ tool: name, error: message }, 'Tool execution failed');
      return {
        success: false,
        error: { code: 'TOOL_EXECUTION_ERROR', message },
        agentHints: createEmptyAgentHints(),
      };
    }
  }
}

/**
 * Create and populate a tool registry with all session tools.
 */
export function createToolRegistry(sessionService: SessionService, logger: Logger): ToolRegistry {
  const registry = new ToolRegistry(logger);
  const handlers = createSessionToolHandlers(sessionService);

  for (const def of SESSION_TOOL_DEFINITIONS) {
    const handler = handlers.get(def.name);
    if (handler) {
      registry.register(def, handler);
    }
  }

  return registry;
}
