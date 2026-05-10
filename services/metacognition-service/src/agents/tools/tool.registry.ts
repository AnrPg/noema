import { createEmptyAgentHints } from '@noema/contracts';
import type { MetacognitionService } from '../../domain/metacognition-service/index.js';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireString(input: unknown, key: string): string | null {
  if (!isRecord(input) || typeof input[key] !== 'string' || input[key].trim().length === 0) {
    return null;
  }
  return input[key].trim();
}

function stringArray(input: unknown, key: string): string[] {
  if (!isRecord(input) || !Array.isArray(input[key])) return [];
  return input[key].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function optionalNumber(input: unknown, key: string): number | undefined {
  return isRecord(input) && typeof input[key] === 'number' ? input[key] : undefined;
}

function classifyError(errorCode: string): {
  retryClass: ToolRetryClass;
  failureClass: ToolFailureClass;
  failureDomain: ToolFailureDomain;
} {
  const normalizedCode = errorCode.toUpperCase();
  if (normalizedCode === 'TOOL_NOT_FOUND') {
    return { retryClass: 'permanent', failureClass: 'state.not_found', failureDomain: 'state' };
  }
  if (normalizedCode.includes('INVALID')) {
    return { retryClass: 'permanent', failureClass: 'input.schema.invalid', failureDomain: 'validation' };
  }
  return { retryClass: 'unknown', failureClass: 'internal.unknown', failureDomain: 'internal' };
}

function failure(code: string, message: string): IToolResult {
  return {
    success: false,
    error: { code, message },
    agentHints: {
      ...createEmptyAgentHints(),
      confidence: 1,
      sourceQuality: 'high',
      validityPeriod: 'long',
      reasoning: message,
    },
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

  getDefinition(name: string): IToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }

  async execute(name: string, input: unknown, userId: string, correlationId: string): Promise<IToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return failure('TOOL_NOT_FOUND', `Unknown tool: ${name}`);
    }
    const startedAt = Date.now();
    try {
      const result = await tool.handler(input, userId, correlationId);
      const metadata: IToolResultMetadataExtended = {
        toolVersion: tool.definition.version,
        timestamp: new Date().toISOString(),
        executionTime: Date.now() - startedAt,
        serviceVersion: '0.1.0',
        correlationId,
        requestId: correlationId,
        toolName: tool.definition.name,
        attemptCount: 1,
        resultCode: result.success ? 'SUCCESS' : (result.error?.code ?? 'TOOL_ERROR'),
        ...(result.success ? {} : classifyError(result.error?.code ?? 'TOOL_ERROR')),
      };
      result.metadata = metadata as IToolResultMetadata;
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: { code: 'HANDLER_EXCEPTION', message },
        agentHints: { ...createEmptyAgentHints(), confidence: 0.2, sourceQuality: 'low', validityPeriod: 'short', reasoning: message },
        metadata: {
          toolVersion: tool.definition.version,
          timestamp: new Date().toISOString(),
          executionTime: Date.now() - startedAt,
          serviceVersion: '0.1.0',
          correlationId,
          requestId: correlationId,
          toolName: tool.definition.name,
          attemptCount: 1,
          resultCode: 'HANDLER_EXCEPTION',
          retryClass: 'unknown',
          failureClass: 'internal.exception',
          failureDomain: 'internal',
        } as IToolResultMetadata,
      };
    }
  }
}

const TOOL_DEFINITIONS: IToolDefinition[] = [
  {
    name: 'record-evaluation',
    version: '1.0.0',
    description: 'Record a metacognitive evaluation and trigger analysis.',
    service: 'metacognition-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['metacognition:write'] },
    capabilities: { idempotent: false, sideEffects: true, timeoutMs: 5000, costClass: 'medium' },
    inputSchema: { type: 'object' },
  },
  {
    name: 'get-reasoning-average',
    version: '1.0.0',
    description: 'Retrieve the reasoning average for a concept.',
    service: 'metacognition-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['metacognition:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['conceptId'], properties: { conceptId: { type: 'string' }, studyMode: { type: 'string' } } },
  },
  {
    name: 'get-evaluation-by-step',
    version: '1.0.0',
    description: 'Retrieve the evaluation linked to a step.',
    service: 'metacognition-service',
    priority: 'P1',
    scopeRequirement: { match: 'any', requiredScopes: ['metacognition:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['stepId'], properties: { stepId: { type: 'string' } } },
  },
  {
    name: 'get-agent-safe-diagnostic-brief',
    version: '1.0.0',
    description: 'Produce an agent-safe diagnostic brief for a step.',
    service: 'metacognition-service',
    priority: 'P1',
    scopeRequirement: { match: 'any', requiredScopes: ['metacognition:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['stepId'], properties: { stepId: { type: 'string' } } },
  },
  {
    name: 'get-remediation-brief',
    version: '1.0.0',
    description: 'Produce a remediation-oriented brief for a step evaluation.',
    service: 'metacognition-service',
    priority: 'P1',
    scopeRequirement: { match: 'any', requiredScopes: ['metacognition:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['stepId'], properties: { stepId: { type: 'string' } } },
  },
  {
    name: 'get-trace-evidence-pack',
    version: '1.0.0',
    description: 'Return a learner-safe, full 7-frame trace evidence pack for a Step.',
    service: 'metacognition-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['metacognition:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['stepId'], properties: { stepId: { type: 'string' } } },
  },
  {
    name: 'get-repeated-pattern-history',
    version: '1.0.0',
    description: 'Return minimized repeated reasoning-pattern history for concepts.',
    service: 'metacognition-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['metacognition:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', properties: { conceptIds: { type: 'array', items: { type: 'string' } }, studyMode: { type: 'string' }, windowDays: { type: 'number' } } },
  },
  {
    name: 'get-calibration-trend-summary',
    version: '1.0.0',
    description: 'Return recent confidence/evidence alignment trend for concepts.',
    service: 'metacognition-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['metacognition:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', properties: { conceptIds: { type: 'array', items: { type: 'string' } }, studyMode: { type: 'string' }, windowDays: { type: 'number' } } },
  },
  {
    name: 'get-concept-mismatch-history',
    version: '1.0.0',
    description: 'Return concept-specific confidence versus reasoning mismatch history.',
    service: 'metacognition-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['metacognition:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['conceptId'], properties: { conceptId: { type: 'string' }, studyMode: { type: 'string' }, windowDays: { type: 'number' } } },
  },
];

export function createToolRegistry(service: MetacognitionService): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(TOOL_DEFINITIONS[0]!, async (input, userId, correlationId) => ({
    success: true,
    data: await service.recordEvaluation(input, { userId: userId as never, correlationId: correlationId as never }),
    agentHints: createEmptyAgentHints(),
  }));

  registry.register(TOOL_DEFINITIONS[1]!, async (input, userId) => {
    const conceptId = requireString(input, 'conceptId');
    if (conceptId === null) return failure('INVALID_INPUT', 'conceptId is required');
    const studyMode = isRecord(input) && typeof input['studyMode'] === 'string' ? input['studyMode'] : undefined;
    const average = await service.getReasoningAverage(userId as never, conceptId as never, studyMode as never);
    if (average === null) return failure('NOT_FOUND', 'No reasoning average found for concept');
    return { success: true, data: average, agentHints: createEmptyAgentHints() };
  });

  registry.register(TOOL_DEFINITIONS[2]!, async (input, userId) => {
    const stepId = requireString(input, 'stepId');
    if (stepId === null) return failure('INVALID_INPUT', 'stepId is required');
    const evaluation = await service.getEvaluationByStepId(stepId, userId as never);
    if (evaluation === null) return failure('NOT_FOUND', 'No evaluation found for step');
    return { success: true, data: evaluation, agentHints: createEmptyAgentHints() };
  });

  registry.register(TOOL_DEFINITIONS[3]!, async (input, userId) => {
    const stepId = requireString(input, 'stepId');
    if (stepId === null) return failure('INVALID_INPUT', 'stepId is required');
    const brief = await service.getAgentSafeDiagnosticBrief(stepId, userId as never);
    if (brief === null) return failure('NOT_FOUND', 'No diagnostic brief available for step');
    return { success: true, data: brief, agentHints: createEmptyAgentHints() };
  });

  registry.register(TOOL_DEFINITIONS[4]!, async (input, userId) => {
    const stepId = requireString(input, 'stepId');
    if (stepId === null) return failure('INVALID_INPUT', 'stepId is required');
    const brief = await service.getRemediationBrief(stepId, userId as never);
    if (brief === null) return failure('NOT_FOUND', 'No remediation brief available for step');
    return { success: true, data: brief, agentHints: createEmptyAgentHints() };
  });

  registry.register(TOOL_DEFINITIONS[5]!, async (input, userId) => {
    const stepId = requireString(input, 'stepId');
    if (stepId === null) return failure('INVALID_INPUT', 'stepId is required');
    const pack = await service.getTraceEvidencePack(stepId, userId as never);
    if (pack === null) return failure('NOT_FOUND', 'No trace evidence pack available for step');
    return { success: true, data: pack, agentHints: createEmptyAgentHints() };
  });

  registry.register(TOOL_DEFINITIONS[6]!, async (input, userId) => {
    const conceptIds = stringArray(input, 'conceptIds');
    const studyMode = isRecord(input) && typeof input['studyMode'] === 'string' ? input['studyMode'] : undefined;
    const windowDays = optionalNumber(input, 'windowDays');
    return {
      success: true,
      data: await service.getRepeatedPatternHistory(
        userId as never,
        conceptIds as never,
        studyMode as never,
        windowDays
      ),
      agentHints: createEmptyAgentHints(),
    };
  });

  registry.register(TOOL_DEFINITIONS[7]!, async (input, userId) => {
    const conceptIds = stringArray(input, 'conceptIds');
    const studyMode = isRecord(input) && typeof input['studyMode'] === 'string' ? input['studyMode'] : undefined;
    const windowDays = optionalNumber(input, 'windowDays');
    return {
      success: true,
      data: await service.getCalibrationTrendSummary(
        userId as never,
        conceptIds as never,
        studyMode as never,
        windowDays
      ),
      agentHints: createEmptyAgentHints(),
    };
  });

  registry.register(TOOL_DEFINITIONS[8]!, async (input, userId) => {
    const conceptId = requireString(input, 'conceptId');
    if (conceptId === null) return failure('INVALID_INPUT', 'conceptId is required');
    const studyMode = isRecord(input) && typeof input['studyMode'] === 'string' ? input['studyMode'] : undefined;
    const windowDays = optionalNumber(input, 'windowDays');
    return {
      success: true,
      data: await service.getConceptMismatchHistory(
        userId as never,
        conceptId as never,
        studyMode as never,
        windowDays
      ),
      agentHints: createEmptyAgentHints(),
    };
  });

  return registry;
}
