import { createEmptyAgentHints } from '@noema/contracts';
import { ConceptIdSchema, StudyModeSchema } from '@noema/learning-kernel';
import type { SchedulerService } from '../../domain/scheduler-service/scheduler.service.js';
import type { IConceptScheduleState } from '../../types/scheduler.types.js';
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

function requireConceptId(input: unknown): string | null {
  const value = requireString(input, 'conceptId');
  if (value === null) return null;
  const parsed = ConceptIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function requireStudyMode(input: unknown): string | null {
  const value = requireString(input, 'studyMode');
  if (value === null) return null;
  const parsed = StudyModeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function stringArray(input: unknown, key: string): string[] {
  if (!isRecord(input) || !Array.isArray(input[key])) return [];
  return input[key].filter((value): value is string => typeof value === 'string' && value.length > 0);
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
    return {
      retryClass: 'permanent',
      failureClass: 'input.schema.invalid',
      failureDomain: 'validation',
    };
  }
  return { retryClass: 'unknown', failureClass: 'internal.unknown', failureDomain: 'internal' };
}

function describeQueue(queue: IConceptScheduleState['queue']): string {
  if (queue === 'repair') return 'Concept needs repair before forward progress.';
  if (queue === 'new_learning') return 'Concept is still in first-pass acquisition.';
  return 'Concept is in reinforcement rotation.';
}

export class ToolRegistry {
  private readonly tools = new Map<string, IRegisteredTool>();

  register(definition: IToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  listDefinitions(): IToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }

  async execute(
    name: string,
    input: unknown,
    userId: string,
    correlationId: string
  ): Promise<IToolResult> {
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
        ...(result.success ? {} : classifyError(result.error?.code ?? 'TOOL_ERROR')),
      } as IToolResultMetadata;
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
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
        } as IToolResultMetadataExtended as IToolResultMetadata,
      };
    }
  }
}

const TOOL_DEFINITIONS: IToolDefinition[] = [
  {
    name: 'get-concept-schedule',
    version: '1.0.0',
    description: 'Fetch the scheduling state for a concept.',
    service: 'scheduler-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['scheduler:plan'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: {
      type: 'object',
      required: ['conceptId', 'studyMode'],
      properties: {
        conceptId: { type: 'string', pattern: '^concept_[A-Za-z0-9_-]{21}$' },
        studyMode: { type: 'string', enum: ['language_learning', 'knowledge_gaining'] },
      },
    },
  },
  {
    name: 'get-due-concepts',
    version: '1.0.0',
    description: 'List currently due concepts.',
    service: 'scheduler-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['scheduler:plan'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object' },
  },
  {
    name: 'get-due-summary',
    version: '1.0.0',
    description: 'Summarize due concepts by queue.',
    service: 'scheduler-service',
    priority: 'P1',
    scopeRequirement: { match: 'any', requiredScopes: ['scheduler:plan'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object' },
  },
  {
    name: 'get-transformation-history',
    version: '1.0.0',
    description: 'Get transformation history for a concept.',
    service: 'scheduler-service',
    priority: 'P1',
    scopeRequirement: { match: 'any', requiredScopes: ['scheduler:plan'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: {
      type: 'object',
      required: ['conceptId', 'studyMode'],
      properties: {
        conceptId: { type: 'string', pattern: '^concept_[A-Za-z0-9_-]{21}$' },
        studyMode: { type: 'string', enum: ['language_learning', 'knowledge_gaining'] },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'explain-schedule-state',
    version: '1.0.0',
    description: 'Explain the scheduling posture for a concept.',
    service: 'scheduler-service',
    priority: 'P1',
    scopeRequirement: { match: 'any', requiredScopes: ['scheduler:plan'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: {
      type: 'object',
      required: ['conceptId', 'studyMode'],
      properties: {
        conceptId: { type: 'string', pattern: '^concept_[A-Za-z0-9_-]{21}$' },
        studyMode: { type: 'string', enum: ['language_learning', 'knowledge_gaining'] },
      },
    },
  },
  {
    name: 'get-prior-calibration-drill-history',
    version: '1.0.0',
    description: 'Fetch prompt-safe prior calibration drill and scheduler-evidence history.',
    service: 'scheduler-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['scheduler:plan'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', properties: { conceptIds: { type: 'array', items: { type: 'string' } }, studyMode: { type: 'string' }, limit: { type: 'number' } } },
  },
  {
    name: 'get-concept-calibration-projection',
    version: '1.0.0',
    description: 'Fetch a calibration-specific projection for one concept.',
    service: 'scheduler-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['scheduler:plan'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: {
      type: 'object',
      required: ['conceptId', 'studyMode'],
      properties: {
        conceptId: { type: 'string', pattern: '^concept_[A-Za-z0-9_-]{21}$' },
        studyMode: { type: 'string', enum: ['language_learning', 'knowledge_gaining'] },
      },
    },
  },
  {
    name: 'get-intervention-cadence-state',
    version: '1.0.0',
    description: 'Fetch deterministic intervention cadence guidance for reflective agent surfaces.',
    service: 'scheduler-service',
    priority: 'P1',
    scopeRequirement: { match: 'any', requiredScopes: ['scheduler:plan'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', properties: { conceptIds: { type: 'array', items: { type: 'string' } }, surfaces: { type: 'array', items: { type: 'string' } } } },
  },
];

export function createToolRegistry(service: SchedulerService): ToolRegistry {
  const registry = new ToolRegistry();
  const [
    getConceptScheduleDefinition,
    getDueConceptsDefinition,
    getDueSummaryDefinition,
    getTransformationHistoryDefinition,
    explainScheduleStateDefinition,
    getPriorCalibrationDrillHistoryDefinition,
    getConceptCalibrationProjectionDefinition,
    getInterventionCadenceStateDefinition,
  ] = TOOL_DEFINITIONS;
  if (
    getConceptScheduleDefinition === undefined ||
    getDueConceptsDefinition === undefined ||
    getDueSummaryDefinition === undefined ||
    getTransformationHistoryDefinition === undefined ||
    explainScheduleStateDefinition === undefined ||
    getPriorCalibrationDrillHistoryDefinition === undefined ||
    getConceptCalibrationProjectionDefinition === undefined ||
    getInterventionCadenceStateDefinition === undefined
  ) {
    throw new Error('Scheduler tool definitions are incomplete');
  }

  registry.register(getConceptScheduleDefinition, async (input, userId) => {
    const conceptId = requireConceptId(input);
    if (conceptId === null) return failure('INVALID_INPUT', 'A canonical conceptId is required');
    const studyMode = requireStudyMode(input);
    if (studyMode === null) return failure('INVALID_INPUT', 'A canonical studyMode is required');
    const state = await service.getConceptSchedule(
      userId as never,
      conceptId as never,
      studyMode as never
    );
    if (state === null) return failure('NOT_FOUND', 'No schedule state found for concept');
    return { success: true, data: state, agentHints: createEmptyAgentHints() };
  });

  registry.register(getDueConceptsDefinition, async (input, userId, correlationId) => ({
    success: true,
    data: await service.getDueConcepts(isRecord(input) ? input : {}, {
      userId: userId as never,
      correlationId: correlationId as never,
    }),
    agentHints: createEmptyAgentHints(),
  }));

  registry.register(getDueSummaryDefinition, async (input, userId, correlationId) => {
    const concepts = await service.getDueConcepts(isRecord(input) ? input : {}, {
      userId: userId as never,
      correlationId: correlationId as never,
    });
    const byQueue = concepts.reduce<Record<string, number>>((acc, concept) => {
      acc[concept.queue] = (acc[concept.queue] ?? 0) + 1;
      return acc;
    }, {});
    return {
      success: true,
      data: { total: concepts.length, byQueue },
      agentHints: createEmptyAgentHints(),
    };
  });

  registry.register(getTransformationHistoryDefinition, async (input, userId, correlationId) => {
    const conceptId = requireConceptId(input);
    if (conceptId === null) return failure('INVALID_INPUT', 'A canonical conceptId is required');
    const studyMode = requireStudyMode(input);
    if (studyMode === null) return failure('INVALID_INPUT', 'A canonical studyMode is required');
    const query = isRecord(input) ? input : {};
    const history = await service.getTransformationHistory(
      query,
      { userId: userId as never, correlationId: correlationId as never },
      conceptId as never
    );
    return { success: true, data: history, agentHints: createEmptyAgentHints() };
  });

  registry.register(explainScheduleStateDefinition, async (input, userId) => {
    const conceptId = requireConceptId(input);
    if (conceptId === null) return failure('INVALID_INPUT', 'A canonical conceptId is required');
    const studyMode = requireStudyMode(input);
    if (studyMode === null) return failure('INVALID_INPUT', 'A canonical studyMode is required');
    const state = await service.getConceptSchedule(
      userId as never,
      conceptId as never,
      studyMode as never
    );
    if (state === null) return failure('NOT_FOUND', 'No schedule state found for concept');
    return {
      success: true,
      data: {
        conceptId: state.conceptId,
        queue: state.queue,
        dueAt: state.dueAt,
        intervalDays: state.intervalDays,
        explanation: describeQueue(state.queue),
      },
      agentHints: createEmptyAgentHints(),
    };
  });

  registry.register(getPriorCalibrationDrillHistoryDefinition, async (input, userId, correlationId) => {
    const query = isRecord(input) ? input : {};
    const conceptIds = stringArray(query, 'conceptIds');
    const studyMode = typeof query['studyMode'] === 'string' ? query['studyMode'] : undefined;
    const limit = typeof query['limit'] === 'number' ? query['limit'] : undefined;
    return {
      success: true,
      data: await service.getPriorCalibrationDrillHistory(
        { userId: userId as never, correlationId: correlationId as never },
        {
          conceptIds: conceptIds as never,
          ...(studyMode !== undefined ? { studyMode: studyMode as never } : {}),
          ...(limit !== undefined ? { limit } : {}),
        }
      ),
      agentHints: createEmptyAgentHints(),
    };
  });

  registry.register(getConceptCalibrationProjectionDefinition, async (input, userId) => {
    const conceptId = requireConceptId(input);
    if (conceptId === null) return failure('INVALID_INPUT', 'A canonical conceptId is required');
    const studyMode = requireStudyMode(input);
    if (studyMode === null) return failure('INVALID_INPUT', 'A canonical studyMode is required');
    return {
      success: true,
      data: await service.getConceptCalibrationProjection(
        userId as never,
        conceptId as never,
        studyMode as never
      ),
      agentHints: createEmptyAgentHints(),
    };
  });

  registry.register(getInterventionCadenceStateDefinition, async (input, userId, correlationId) => {
    const query = isRecord(input) ? input : {};
    return {
      success: true,
      data: await service.getInterventionCadenceState(
        { userId: userId as never, correlationId: correlationId as never },
        {
          conceptIds: stringArray(query, 'conceptIds') as never,
          surfaces: stringArray(query, 'surfaces'),
        }
      ),
      agentHints: createEmptyAgentHints(),
    };
  });

  return registry;
}
