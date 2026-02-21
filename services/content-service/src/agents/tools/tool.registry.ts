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
    createBatchCreateCardsHandler,
    createChangeCardStateHandler,
    createCreateCardHandler,
    createGetCardByIdHandler,
    createQueryCardsHandler,
    createUpdateCardHandler,
    createValidateCardContentHandler,
} from './content.tools.js';
import type { IToolDefinition, IToolResult, ToolHandler } from './tool.types.js';

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

  async execute(name: string, input: unknown, userId: string, correlationId: string): Promise<IToolResult> {
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
      };
    }
    return tool.handler(input, userId, correlationId);
  }

  get size(): number {
    return this.tools.size;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a tool registry bound to the given service instances.
 */
export function createToolRegistry(contentService: ContentService): ToolRegistry {
  const registry = new ToolRegistry();

  // P0 tools
  registry.register(CONTENT_TOOL_DEFINITIONS[0]!, createCreateCardHandler(contentService));
  registry.register(CONTENT_TOOL_DEFINITIONS[1]!, createBatchCreateCardsHandler(contentService));
  registry.register(CONTENT_TOOL_DEFINITIONS[2]!, createValidateCardContentHandler());
  registry.register(CONTENT_TOOL_DEFINITIONS[3]!, createQueryCardsHandler(contentService));

  // P1 tools
  registry.register(CONTENT_TOOL_DEFINITIONS[4]!, createGetCardByIdHandler(contentService));
  registry.register(CONTENT_TOOL_DEFINITIONS[5]!, createUpdateCardHandler(contentService));
  registry.register(CONTENT_TOOL_DEFINITIONS[6]!, createChangeCardStateHandler(contentService));

  return registry;
}
