/**
 * @noema/content-service - MCP Tool Registry
 *
 * Central registry for all MCP tools exposed by the content-service.
 * Initializes handler functions bound to service instances.
 *
 * Usage in bootstrap:
 *   const registry = createToolRegistry(contentService);
 *   await registerToolRoutes(fastify, registry, authMiddleware);
 */

import type { ContentService } from '../../domain/content-service/content.service.js';
import {
  CONTENT_TOOL_DEFINITIONS,
  createBatchChangeCardStateHandler,
  createBatchCreateCardsHandler,
  createChangeCardStateHandler,
  createCountCardsHandler,
  createCreateCardHandler,
  createGetCardByIdHandler,
  createQueryCardsHandler,
  createUpdateCardHandler,
  createUpdateCardNodeLinksHandler,
  createValidateCardContentHandler,
} from './content.tools.js';
import type { IToolDefinition, IToolResult, IToolResultMetadata, ToolHandler } from './tool.types.js';

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * Registered tool entry.
 */
export interface IRegisteredTool {
  definition: IToolDefinition;
  handler: ToolHandler;
}

/**
 * Tool registry — maps tool names to their handlers.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, IRegisteredTool>();

  register(definition: IToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  get(name: string): IRegisteredTool | undefined {
    return this.tools.get(name);
  }

  listDefinitions(): IToolDefinition[] {
    return [...this.tools.values()].map((t) => t.definition);
  }

  async execute(
    name: string,
    input: unknown,
    userId: string,
    correlationId: string
  ): Promise<IToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: { code: 'TOOL_NOT_FOUND', message: `Unknown tool: ${name}` },
        agentHints: {
          suggestedNextActions: [
            {
              action: 'list_tools',
              description: 'List available tools to find the correct name',
              priority: 'high',
              category: 'exploration',
            },
          ],
          relatedResources: [],
          confidence: 1.0,
          sourceQuality: 'high',
          validityPeriod: 'long',
          contextNeeded: [],
          assumptions: [],
          riskFactors: [],
          dependencies: [],
          estimatedImpact: { benefit: 0, effort: 0.1, roi: 0 },
          preferenceAlignment: [],
          reasoning: `Tool "${name}" not found — available: ${[...this.tools.keys()].join(', ')}`,
        },
        metadata: {
          toolVersion: '0.1.0',
          timestamp: new Date().toISOString(),
          executionTime: 0,
          serviceVersion: '0.1.0',
          correlationId,
        },
      };
    }

    const startTime = Date.now();
    const result = await tool.handler(input, userId, correlationId);

    const metadata: IToolResultMetadata = {
      toolVersion: '0.1.0',
      timestamp: new Date().toISOString(),
      executionTime: Date.now() - startTime,
      serviceVersion: '0.1.0',
      correlationId,
    };
    result.metadata = metadata;

    return result;
  }

  get size(): number {
    return this.tools.size;
  }
}

// ============================================================================
// Factory
// ============================================================================

function getDefinition(index: number): IToolDefinition {
  const def = CONTENT_TOOL_DEFINITIONS[index];
  if (def === undefined) {
    throw new Error(`Missing tool definition at index ${String(index)}`);
  }
  return def;
}

/**
 * Create a tool registry bound to the given service instances.
 */
export function createToolRegistry(contentService: ContentService): ToolRegistry {
  const registry = new ToolRegistry();

  // P0 tools
  registry.register(getDefinition(0), createCreateCardHandler(contentService));
  registry.register(getDefinition(1), createBatchCreateCardsHandler(contentService));
  registry.register(getDefinition(2), createValidateCardContentHandler(contentService));
  registry.register(getDefinition(3), createQueryCardsHandler(contentService));

  // P1 tools
  registry.register(getDefinition(4), createGetCardByIdHandler(contentService));
  registry.register(getDefinition(5), createUpdateCardHandler(contentService));
  registry.register(getDefinition(6), createChangeCardStateHandler(contentService));
  registry.register(getDefinition(7), createCountCardsHandler(contentService));
  registry.register(getDefinition(8), createUpdateCardNodeLinksHandler(contentService));
  registry.register(getDefinition(9), createBatchChangeCardStateHandler(contentService));

  return registry;
}
