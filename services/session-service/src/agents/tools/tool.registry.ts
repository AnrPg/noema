/**
 * @noema/session-service - MCP Tool Registry
 *
 * Phase 2 exposes the Step-loop runtime as an agent-callable MCP surface.
 */

import { createEmptyAgentHints } from '@noema/contracts';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireString(input: unknown, key: string): string | null {
  if (!isRecord(input) || typeof input[key] !== 'string' || input[key].trim().length === 0) {
    return null;
  }
  return input[key].trim();
}

function buildFailure(code: string, message: string): IToolResult {
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

function toToolSuccess<T>(data: T, agentHints: unknown): IToolResult {
  return {
    success: true,
    data,
    agentHints: agentHints as IToolResult['agentHints'],
  };
}

function classifyError(errorCode: string): {
  retryClass: ToolRetryClass;
  failureClass: ToolFailureClass;
  failureDomain: ToolFailureDomain;
} {
  const normalizedCode = errorCode.toUpperCase();
  if (normalizedCode === 'TOOL_NOT_FOUND') {
    return {
      retryClass: 'permanent',
      failureClass: 'state.not_found',
      failureDomain: 'state',
    };
  }
  if (normalizedCode.includes('VALIDATION') || normalizedCode.includes('INVALID')) {
    return {
      retryClass: 'permanent',
      failureClass: 'input.schema.invalid',
      failureDomain: 'validation',
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
    input: unknown,
    userId: string,
    correlationId: string
  ): Promise<IToolResult> {
    const tool = this.tools.get(name);
    if (tool) {
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
          toolName: name,
          attemptCount: 1,
          resultCode: result.success ? 'SUCCESS' : (result.error?.code ?? 'TOOL_ERROR'),
          ...(result.success ? {} : classifyError(result.error?.code ?? 'TOOL_ERROR')),
        };
        result.metadata = metadata as IToolResultMetadata;
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const metadata: IToolResultMetadataExtended = {
          toolVersion: tool.definition.version,
          timestamp: new Date().toISOString(),
          executionTime: Date.now() - startedAt,
          serviceVersion: '0.1.0',
          correlationId,
          requestId: correlationId,
          toolName: name,
          attemptCount: 1,
          resultCode: 'HANDLER_EXCEPTION',
          retryClass: 'unknown',
          failureClass: 'internal.exception',
          failureDomain: 'internal',
        };
        return {
          success: false,
          error: { code: 'HANDLER_EXCEPTION', message },
          agentHints: {
            ...createEmptyAgentHints(),
            confidence: 0.2,
            sourceQuality: 'low',
            validityPeriod: 'short',
            reasoning: message,
          },
          metadata: metadata as IToolResultMetadata,
        };
      }
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

const SESSION_TOOL_DEFINITIONS: IToolDefinition[] = [
  {
    name: 'create-session',
    version: '1.0.0',
    description: 'Create a new study session.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:write'] },
    capabilities: { idempotent: false, sideEffects: true, timeoutMs: 5000, costClass: 'low' },
    inputSchema: { type: 'object' },
  },
  {
    name: 'list-sessions',
    version: '1.0.0',
    description: 'List sessions for the current learner.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object' },
  },
  {
    name: 'get-session',
    version: '1.0.0',
    description: 'Fetch a session by id.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' } } },
  },
  {
    name: 'create-lesson-plan',
    version: '1.0.0',
    description: 'Create a lesson plan for a session.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:write'] },
    capabilities: { idempotent: false, sideEffects: true, timeoutMs: 5000, costClass: 'medium' },
    inputSchema: { type: 'object', required: ['sessionId', 'payload'], properties: { sessionId: { type: 'string' }, payload: { type: 'object' } } },
  },
  {
    name: 'add-lesson-plan-goal',
    version: '1.0.0',
    description: 'Add a goal to an existing lesson plan.',
    service: 'session-service',
    priority: 'P1',
    scopeRequirement: { match: 'any', requiredScopes: ['session:write'] },
    capabilities: { idempotent: false, sideEffects: true, timeoutMs: 5000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['lessonPlanId', 'payload'], properties: { lessonPlanId: { type: 'string' }, payload: { type: 'object' } } },
  },
  {
    name: 'get-next-step',
    version: '1.0.0',
    description: 'Resolve the next step for a session.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' } } },
  },
  {
    name: 'get-step-loop-snapshot',
    version: '1.0.0',
    description: 'Inspect the current step-loop snapshot for a session.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' } } },
  },
  {
    name: 'get-step-evidence-record',
    version: '1.0.0',
    description: 'Fetch deterministic Step evidence, learner answer summary, and rubric summary for a Step.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['stepId'], properties: { stepId: { type: 'string' } } },
  },
  {
    name: 'get-step-rubric-summary',
    version: '1.0.0',
    description: 'Fetch deterministic, prompt-safe rubric summary for a Step.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['stepId'], properties: { stepId: { type: 'string' } } },
  },
  {
    name: 'get-step-activity-context',
    version: '1.0.0',
    description: 'Fetch prompt-safe Step activity prompts and content anchor references.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['stepId'], properties: { stepId: { type: 'string' } } },
  },
  {
    name: 'get-step-curriculum-anchor',
    version: '1.0.0',
    description: 'Fetch prompt-safe curriculum and lesson-plan anchor text for a Step.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['stepId'], properties: { stepId: { type: 'string' } } },
  },
  {
    name: 'record-learner-feedback-action',
    version: '1.0.0',
    description: 'Persist a learner action on an agent feedback surface.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:write'] },
    capabilities: { idempotent: false, sideEffects: true, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['surface', 'actionType'], properties: { surface: { type: 'string' }, actionType: { type: 'string' }, sessionId: { type: 'string' }, stepId: { type: 'string' }, noteText: { type: 'string' }, reasonText: { type: 'string' }, conceptIds: { type: 'array', items: { type: 'string' } } } },
  },
  {
    name: 'get-learner-feedback-history',
    version: '1.0.0',
    description: 'Fetch recent learner dismissals, corrections, and feedback-depth preference for a surface.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', properties: { surface: { type: 'string' }, windowDays: { type: 'number' } } },
  },
  {
    name: 'get-learner-load-state',
    version: '1.0.0',
    description: 'Fetch deterministic session-local frustration, overload, and tone guidance signals.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' } } },
  },
  {
    name: 'get-exposure-budget-state',
    version: '1.0.0',
    description: 'Fetch per-session Mental Debugger and Calibration Coach exposure budget state.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:read'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' } } },
  },
  {
    name: 'record-agent-surface-exposure',
    version: '1.0.0',
    description: 'Persist that an agent feedback surface was shown to the learner.',
    service: 'session-service',
    priority: 'P1',
    scopeRequirement: { match: 'any', requiredScopes: ['session:write'] },
    capabilities: { idempotent: false, sideEffects: true, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['sessionId', 'surface'], properties: { sessionId: { type: 'string' }, stepId: { type: 'string' }, surface: { type: 'string' } } },
  },
  {
    name: 'present-step',
    version: '1.0.0',
    description: 'Mark a step as presented and return it.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:write'] },
    capabilities: { idempotent: false, sideEffects: true, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['stepId'], properties: { stepId: { type: 'string' } } },
  },
  {
    name: 'answer-step',
    version: '1.0.0',
    description: 'Submit an answer for a step.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:write'] },
    capabilities: { idempotent: false, sideEffects: true, timeoutMs: 5000, costClass: 'medium' },
    inputSchema: { type: 'object', required: ['stepId', 'payload'], properties: { stepId: { type: 'string' }, payload: { type: 'object' } } },
  },
  {
    name: 'skip-step',
    version: '1.0.0',
    description: 'Skip a step and capture the skip rationale.',
    service: 'session-service',
    priority: 'P1',
    scopeRequirement: { match: 'any', requiredScopes: ['session:write'] },
    capabilities: { idempotent: false, sideEffects: true, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['stepId', 'payload'], properties: { stepId: { type: 'string' }, payload: { type: 'object' } } },
  },
  {
    name: 'complete-session',
    version: '1.0.0',
    description: 'Complete a session and persist its terminal summary.',
    service: 'session-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['session:write'] },
    capabilities: { idempotent: false, sideEffects: true, timeoutMs: 5000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['sessionId', 'payload'], properties: { sessionId: { type: 'string' }, payload: { type: 'object' } } },
  },
];

export function createToolRegistry(sessionService: SessionService): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(SESSION_TOOL_DEFINITIONS[0]!, async (input, userId, correlationId) => {
    const result = await sessionService.startSession(input, { userId: userId as never, correlationId: correlationId as never });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[1]!, async (input, userId, correlationId) => {
    const query = isRecord(input) ? input : {};
    const result = await sessionService.listSessions(query, undefined, undefined, {
      userId: userId as never,
      correlationId: correlationId as never,
    });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[2]!, async (input, userId, correlationId) => {
    const sessionId = requireString(input, 'sessionId');
    if (sessionId === null) return buildFailure('INVALID_INPUT', 'sessionId is required');
    const result = await sessionService.getSession(sessionId, { userId: userId as never, correlationId: correlationId as never });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[3]!, async (input, userId, correlationId) => {
    const sessionId = requireString(input, 'sessionId');
    const payload = isRecord(input) ? input['payload'] : undefined;
    if (sessionId === null || payload === undefined) return buildFailure('INVALID_INPUT', 'sessionId and payload are required');
    const result = await sessionService.createLessonPlan(sessionId, payload, {
      userId: userId as never,
      correlationId: correlationId as never,
    });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[4]!, async (input, userId, correlationId) => {
    const lessonPlanId = requireString(input, 'lessonPlanId');
    const payload = isRecord(input) ? input['payload'] : undefined;
    if (lessonPlanId === null || payload === undefined) return buildFailure('INVALID_INPUT', 'lessonPlanId and payload are required');
    const result = await sessionService.createGoal(lessonPlanId, payload, {
      userId: userId as never,
      correlationId: correlationId as never,
    });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[5]!, async (input, userId, correlationId) => {
    const sessionId = requireString(input, 'sessionId');
    if (sessionId === null) return buildFailure('INVALID_INPUT', 'sessionId is required');
    const result = await sessionService.getNextStep(sessionId, { userId: userId as never, correlationId: correlationId as never });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[6]!, async (input, userId, correlationId) => {
    const sessionId = requireString(input, 'sessionId');
    if (sessionId === null) return buildFailure('INVALID_INPUT', 'sessionId is required');
    const result = await sessionService.getStepLoopSnapshot(sessionId, { userId: userId as never, correlationId: correlationId as never });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[7]!, async (input, userId, correlationId) => {
    const stepId = requireString(input, 'stepId');
    if (stepId === null) return buildFailure('INVALID_INPUT', 'stepId is required');
    const result = await sessionService.getStepEvidenceRecord(stepId, {
      userId: userId as never,
      correlationId: correlationId as never,
    });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[8]!, async (input, userId, correlationId) => {
    const stepId = requireString(input, 'stepId');
    if (stepId === null) return buildFailure('INVALID_INPUT', 'stepId is required');
    const result = await sessionService.getStepRubricSummary(stepId, {
      userId: userId as never,
      correlationId: correlationId as never,
    });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[9]!, async (input, userId, correlationId) => {
    const stepId = requireString(input, 'stepId');
    if (stepId === null) return buildFailure('INVALID_INPUT', 'stepId is required');
    const result = await sessionService.getStepActivityContext(stepId, {
      userId: userId as never,
      correlationId: correlationId as never,
    });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[10]!, async (input, userId, correlationId) => {
    const stepId = requireString(input, 'stepId');
    if (stepId === null) return buildFailure('INVALID_INPUT', 'stepId is required');
    const result = await sessionService.getStepCurriculumAnchor(stepId, {
      userId: userId as never,
      correlationId: correlationId as never,
    });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[11]!, async (input, userId, correlationId) => {
    const result = await sessionService.recordLearnerFeedbackAction(isRecord(input) ? input : {}, {
      userId: userId as never,
      correlationId: correlationId as never,
    });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[12]!, async (input, userId, correlationId) => {
    const result = await sessionService.getLearnerFeedbackHistory(isRecord(input) ? input : {}, {
      userId: userId as never,
      correlationId: correlationId as never,
    });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[13]!, async (input, userId, correlationId) => {
    const result = await sessionService.getLearnerLoadState(isRecord(input) ? input : {}, {
      userId: userId as never,
      correlationId: correlationId as never,
    });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[14]!, async (input, userId, correlationId) => {
    const result = await sessionService.getExposureBudgetState(isRecord(input) ? input : {}, {
      userId: userId as never,
      correlationId: correlationId as never,
    });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[15]!, async (input, userId, correlationId) => {
    const result = await sessionService.recordAgentSurfaceExposure(isRecord(input) ? input : {}, {
      userId: userId as never,
      correlationId: correlationId as never,
    });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[16]!, async (input, userId, correlationId) => {
    const stepId = requireString(input, 'stepId');
    if (stepId === null) return buildFailure('INVALID_INPUT', 'stepId is required');
    const result = await sessionService.presentStep(stepId, { userId: userId as never, correlationId: correlationId as never });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[17]!, async (input, userId, correlationId) => {
    const stepId = requireString(input, 'stepId');
    const payload = isRecord(input) ? input['payload'] : undefined;
    if (stepId === null || payload === undefined) return buildFailure('INVALID_INPUT', 'stepId and payload are required');
    const result = await sessionService.answerStep(stepId, payload, { userId: userId as never, correlationId: correlationId as never });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[18]!, async (input, userId, correlationId) => {
    const stepId = requireString(input, 'stepId');
    const payload = isRecord(input) ? input['payload'] : undefined;
    if (stepId === null || payload === undefined) return buildFailure('INVALID_INPUT', 'stepId and payload are required');
    const result = await sessionService.skipStep(stepId, payload, { userId: userId as never, correlationId: correlationId as never });
    return toToolSuccess(result.data, result.agentHints);
  });
  registry.register(SESSION_TOOL_DEFINITIONS[19]!, async (input, userId, correlationId) => {
    const sessionId = requireString(input, 'sessionId');
    const payload = isRecord(input) ? input['payload'] : undefined;
    if (sessionId === null || payload === undefined) return buildFailure('INVALID_INPUT', 'sessionId and payload are required');
    const result = await sessionService.completeSession(sessionId, payload, { userId: userId as never, correlationId: correlationId as never });
    return toToolSuccess(result.data, result.agentHints);
  });

  return registry;
}
