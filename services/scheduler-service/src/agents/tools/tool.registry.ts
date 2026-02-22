import type { SchedulerService } from '../../domain/scheduler-service/scheduler.service.js';
import {
  createIssueOfflineIntentTokenHandler,
  createPlanDualLaneHandler,
  createVerifyOfflineIntentTokenHandler,
  SCHEDULER_TOOL_DEFINITIONS,
} from './scheduler.tools.js';
import type {
  IToolDefinition,
  IToolResult,
  IToolResultMetadata,
  ToolHandler,
} from './tool.types.js';

export interface IRegisteredTool {
  definition: IToolDefinition;
  handler: ToolHandler;
}

export class ToolRegistry {
  private readonly tools = new Map<string, IRegisteredTool>();

  register(definition: IToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
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
          suggestedNextActions: [],
          relatedResources: [],
          confidence: 1,
          sourceQuality: 'high',
          validityPeriod: 'long',
          contextNeeded: [],
          assumptions: [],
          riskFactors: [],
          dependencies: [],
          estimatedImpact: { benefit: 0, effort: 0.1, roi: 0 },
          preferenceAlignment: [],
          reasoning: 'Unknown tool',
        },
      };
    }

    const started = Date.now();
    const result = await tool.handler(input, userId, correlationId);
    const metadata: IToolResultMetadata = {
      toolVersion: '0.1.0',
      timestamp: new Date().toISOString(),
      executionTime: Date.now() - started,
      serviceVersion: '0.1.0',
      correlationId,
    };
    result.metadata = metadata;
    return result;
  }

  listDefinitions(): IToolDefinition[] {
    return [...this.tools.values()].map((entry) => entry.definition);
  }
}

export function createToolRegistry(service: SchedulerService): ToolRegistry {
  const registry = new ToolRegistry();

  const [planDefinition, issueDefinition, verifyDefinition] = SCHEDULER_TOOL_DEFINITIONS;

  if (
    planDefinition === undefined ||
    issueDefinition === undefined ||
    verifyDefinition === undefined
  ) {
    throw new Error('Scheduler tool definitions are incomplete');
  }

  registry.register(planDefinition, createPlanDualLaneHandler(service));
  registry.register(issueDefinition, createIssueOfflineIntentTokenHandler(service));
  registry.register(verifyDefinition, createVerifyOfflineIntentTokenHandler(service));
  return registry;
}
