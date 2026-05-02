import type { CurriculumService } from '../../domain/curriculum-service/curriculum.service.js';
import {
  createCurriculumToolHandlers,
  CURRICULUM_TOOL_DEFINITIONS,
} from './curriculum.tools.js';
import type { IToolDefinition, IToolResult, ToolHandler } from './tool.types.js';

export class ToolRegistry {
  private readonly definitions = new Map<string, IToolDefinition>();
  private readonly handlers = new Map<string, ToolHandler>();

  register(definition: IToolDefinition, handler: ToolHandler): void {
    this.definitions.set(definition.name, definition);
    this.handlers.set(definition.name, handler);
  }

  listDefinitions(): IToolDefinition[] {
    return [...this.definitions.values()];
  }

  async execute(
    name: string,
    input: unknown,
    userId: string,
    correlationId: string
  ): Promise<IToolResult> {
    const handler = this.handlers.get(name);
    if (handler === undefined) {
      return {
        success: false,
        error: { code: 'TOOL_NOT_FOUND', message: `Unknown curriculum tool: ${name}` },
        agentHints: {
          suggestedNextActions: [],
          relatedResources: [],
          confidence: 1,
          sourceQuality: 'high',
          validityPeriod: 'long',
          contextNeeded: [],
          assumptions: [],
          riskFactors: [],
          dependencies: [],
          estimatedImpact: { benefit: 0, effort: 0, roi: 0 },
          preferenceAlignment: [],
          reasoning: 'The requested tool is not registered.',
        },
      };
    }
    return handler(input, userId, correlationId);
  }
}

export function createToolRegistry(service: CurriculumService): ToolRegistry {
  const registry = new ToolRegistry();
  const handlers = createCurriculumToolHandlers(service);
  for (const definition of CURRICULUM_TOOL_DEFINITIONS) {
    const handler = handlers[definition.name];
    if (handler !== undefined) registry.register(definition, handler);
  }
  return registry;
}
