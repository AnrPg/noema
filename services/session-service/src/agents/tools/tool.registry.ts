/**
 * @noema/session-service - MCP Tool Registry.
 *
 * Batch 4 removes the legacy card-attempt and cohort MCP tools. Step-loop tools
 * can be added here once the closed-loop agent contracts land in later batches.
 */

import type { SessionService } from '../../domain/session-service/session.service.js';
import type {
  IToolDefinition,
  IToolResult,
  IToolResultMetadata,
  IToolResultMetadataExtended,
  ToolFailureClass,
  ToolFailureDomain,
  ToolHandler,
  ToolRetryClass,
} from './tool.types.js';

export interface IRegisteredTool {
  definition: IToolDefinition;
  handler: ToolHandler;
}

function classifyError(errorCode: string): {
  retryClass: ToolRetryClass;
  failureClass: ToolFailureClass;
  failureDomain: ToolFailureDomain;
} {
  if (errorCode === 'TOOL_NOT_FOUND') {
    return {
      retryClass: 'permanent',
      failureClass: 'state.not_found',
      failureDomain: 'state',
    };
  }
  return {
    retryClass: 'unknown',
    failureClass: 'internal.unknown',
    failureDomain: 'internal',
  };
}

export class ToolRegistry {
  private readonly tools = new Map<string, IRegisteredTool>();

  register(definition: IToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  get(name: string): IRegisteredTool | undefined {
    return this.tools.get(name);
  }

  listDefinitions(): IToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }

  getDefinition(name: string): IToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }

  async execute(
    name: string,
    _input: unknown,
    _userId: string,
    correlationId: string
  ): Promise<IToolResult> {
    const tool = this.tools.get(name);
    if (tool) {
      return tool.handler({}, _userId, correlationId);
    }

    const classification = classifyError('TOOL_NOT_FOUND');
    const metadata: IToolResultMetadataExtended = {
      toolVersion: '1.0.0',
      timestamp: new Date().toISOString(),
      executionTime: 0,
      serviceVersion: '0.1.0',
      correlationId,
      requestId: correlationId,
      toolName: name,
      attemptCount: 1,
      resultCode: 'TOOL_NOT_FOUND',
      retryClass: classification.retryClass,
      failureClass: classification.failureClass,
      failureDomain: classification.failureDomain,
      httpStatusHint: 404,
    };

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
        reasoning: 'Legacy session-service tools were removed by the Step-loop realignment.',
      },
      metadata: metadata as IToolResultMetadata,
    };
  }

  get size(): number {
    return this.tools.size;
  }
}

export function createToolRegistry(_sessionService: SessionService): ToolRegistry {
  return new ToolRegistry();
}
