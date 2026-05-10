import { createEmptyAgentHints } from '@noema/contracts';
import type { PedagogyGuardianService } from '../../domain/pedagogy-guardian-service/index.js';
import type { IToolDefinition, IToolResult, IToolResultMetadata, IToolResultMetadataExtended, ToolHandler } from './tool.types.js';

export interface IRegisteredTool {
  definition: IToolDefinition;
  handler: ToolHandler;
}

function failure(code: string, message: string): IToolResult {
  return {
    success: false,
    error: { code, message },
    agentHints: { ...createEmptyAgentHints(), confidence: 1, sourceQuality: 'high', validityPeriod: 'long', reasoning: message },
  };
}

export class ToolRegistry {
  private readonly tools = new Map<string, IRegisteredTool>();

  register(definition: IToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  listDefinitions(): IToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }

  async execute(name: string, input: unknown, userId: string, correlationId: string): Promise<IToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return failure('TOOL_NOT_FOUND', `Unknown tool: ${name}`);
    const startedAt = Date.now();
    try {
      const result = await tool.handler(input, userId, correlationId);
      result.metadata = {
        toolVersion: tool.definition.version,
        timestamp: new Date().toISOString(),
        executionTime: Date.now() - startedAt,
        serviceVersion: '0.1.0',
        correlationId,
        requestId: correlationId,
        toolName: tool.definition.name,
        attemptCount: 1,
        resultCode: result.success ? 'SUCCESS' : (result.error?.code ?? 'TOOL_ERROR'),
      } as IToolResultMetadataExtended as IToolResultMetadata;
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: { code: 'HANDLER_EXCEPTION', message },
        agentHints: { ...createEmptyAgentHints(), confidence: 0.2, sourceQuality: 'low', validityPeriod: 'short', reasoning: message },
      };
    }
  }
}

const TOOL_DEFINITIONS: IToolDefinition[] = [
  { name: 'validate-lesson-plan', version: '1.0.0', description: 'Validate a lesson plan.', service: 'pedagogy-guardian-service', priority: 'P0', scopeRequirement: { match: 'any', requiredScopes: ['pedagogy-guardian:write'] }, capabilities: { idempotent: false, sideEffects: true, timeoutMs: 5000, costClass: 'medium' }, inputSchema: { type: 'object' } },
  { name: 'validate-step', version: '1.0.0', description: 'Validate a single step.', service: 'pedagogy-guardian-service', priority: 'P0', scopeRequirement: { match: 'any', requiredScopes: ['pedagogy-guardian:write'] }, capabilities: { idempotent: false, sideEffects: true, timeoutMs: 5000, costClass: 'medium' }, inputSchema: { type: 'object' } },
  { name: 'validate-activity', version: '1.0.0', description: 'Validate a step activity.', service: 'pedagogy-guardian-service', priority: 'P0', scopeRequirement: { match: 'any', requiredScopes: ['pedagogy-guardian:write'] }, capabilities: { idempotent: false, sideEffects: true, timeoutMs: 5000, costClass: 'medium' }, inputSchema: { type: 'object' } },
  { name: 'validate-replan', version: '1.0.0', description: 'Validate a replan proposal.', service: 'pedagogy-guardian-service', priority: 'P0', scopeRequirement: { match: 'any', requiredScopes: ['pedagogy-guardian:write'] }, capabilities: { idempotent: false, sideEffects: true, timeoutMs: 5000, costClass: 'medium' }, inputSchema: { type: 'object' } },
  { name: 'validate-generated-variant', version: '1.0.0', description: 'Validate a generated variant.', service: 'pedagogy-guardian-service', priority: 'P0', scopeRequirement: { match: 'any', requiredScopes: ['pedagogy-guardian:write'] }, capabilities: { idempotent: false, sideEffects: true, timeoutMs: 5000, costClass: 'medium' }, inputSchema: { type: 'object' } },
  { name: 'validate-coaching-artifact', version: '1.0.0', description: 'Validate learner-facing coaching language as a generated activity artifact.', service: 'pedagogy-guardian-service', priority: 'P0', scopeRequirement: { match: 'any', requiredScopes: ['pedagogy-guardian:write'] }, capabilities: { idempotent: false, sideEffects: true, timeoutMs: 5000, costClass: 'medium' }, inputSchema: { type: 'object', required: ['artifactId', 'learnerFacingText'], properties: { artifactId: { type: 'string' }, learnerFacingText: { type: 'string' }, summary: { type: 'string' } } } },
];

export function createToolRegistry(service: PedagogyGuardianService): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(TOOL_DEFINITIONS[0]!, async (input, userId, correlationId) => ({ success: true, data: await service.validateLessonPlan(input, { userId: userId as never, correlationId: correlationId as never }), agentHints: createEmptyAgentHints() }));
  registry.register(TOOL_DEFINITIONS[1]!, async (input, userId, correlationId) => ({ success: true, data: await service.validateStep(input, { userId: userId as never, correlationId: correlationId as never }), agentHints: createEmptyAgentHints() }));
  registry.register(TOOL_DEFINITIONS[2]!, async (input, userId, correlationId) => ({ success: true, data: await service.validateActivity(input, { userId: userId as never, correlationId: correlationId as never }), agentHints: createEmptyAgentHints() }));
  registry.register(TOOL_DEFINITIONS[3]!, async (input, userId, correlationId) => ({ success: true, data: await service.validateReplan(input, { userId: userId as never, correlationId: correlationId as never }), agentHints: createEmptyAgentHints() }));
  registry.register(TOOL_DEFINITIONS[4]!, async (input, userId, correlationId) => ({ success: true, data: await service.validateGeneratedVariant(input, { userId: userId as never, correlationId: correlationId as never }), agentHints: createEmptyAgentHints() }));
  registry.register(TOOL_DEFINITIONS[5]!, async (input, userId, correlationId) => {
    const record = typeof input === 'object' && input !== null ? input as Record<string, unknown> : {};
    const artifactId = typeof record['artifactId'] === 'string' && record['artifactId'].trim().length > 0
      ? record['artifactId']
      : 'coaching_artifact';
    const learnerFacingText = typeof record['learnerFacingText'] === 'string'
      ? record['learnerFacingText']
      : typeof record['summary'] === 'string'
        ? record['summary']
        : '';
    return {
      success: true,
      data: await service.validateActivity({
        activity: {
          id: artifactId,
          contentSourceType: 'generated',
          generatedVariantId: artifactId,
          prompt: learnerFacingText,
          expectedResponseType: 'reflection',
          responseSchema: { type: 'string' },
          content: record,
        },
        triggeredBy: 'calibration-coach',
      }, { userId: userId as never, correlationId: correlationId as never }),
      agentHints: createEmptyAgentHints(),
    };
  });
  return registry;
}
