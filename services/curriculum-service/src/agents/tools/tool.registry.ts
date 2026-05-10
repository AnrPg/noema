import { createEmptyAgentHints } from '@noema/contracts';
import type { CurriculumService } from '../../domain/curriculum-service/curriculum.service.js';
import type { IToolDefinition, IToolResult, IToolResultMetadata, IToolResultMetadataExtended, ToolHandler } from './tool.types.js';

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
  { name: 'list-curricula', version: '1.0.0', description: 'List curricula for the active learner.', service: 'curriculum-service', priority: 'P0', scopeRequirement: { match: 'any', requiredScopes: ['curriculum:read'] }, capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' }, inputSchema: { type: 'object' } },
  { name: 'get-curriculum-by-id', version: '1.0.0', description: 'Fetch a curriculum by id.', service: 'curriculum-service', priority: 'P0', scopeRequirement: { match: 'any', requiredScopes: ['curriculum:read'] }, capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' }, inputSchema: { type: 'object', required: ['curriculumId'], properties: { curriculumId: { type: 'string' } } } },
  { name: 'get-active-version', version: '1.0.0', description: 'Fetch the active curriculum version.', service: 'curriculum-service', priority: 'P0', scopeRequirement: { match: 'any', requiredScopes: ['curriculum:read'] }, capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' }, inputSchema: { type: 'object', required: ['curriculumId'], properties: { curriculumId: { type: 'string' } } } },
  { name: 'get-frontier', version: '1.0.0', description: 'Compute the active curriculum frontier.', service: 'curriculum-service', priority: 'P0', scopeRequirement: { match: 'any', requiredScopes: ['curriculum:read'] }, capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' }, inputSchema: { type: 'object', required: ['curriculumId'], properties: { curriculumId: { type: 'string' } } } },
  { name: 'get-progress', version: '1.0.0', description: 'List curriculum progress records.', service: 'curriculum-service', priority: 'P0', scopeRequirement: { match: 'any', requiredScopes: ['curriculum:read'] }, capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' }, inputSchema: { type: 'object', required: ['curriculumId'], properties: { curriculumId: { type: 'string' } } } },
  { name: 'get-session-slice', version: '1.0.0', description: 'Compose a session slice from the active curriculum.', service: 'curriculum-service', priority: 'P0', scopeRequirement: { match: 'any', requiredScopes: ['curriculum:write'] }, capabilities: { idempotent: false, sideEffects: true, timeoutMs: 5000, costClass: 'medium' }, inputSchema: { type: 'object', required: ['curriculumId'], properties: { curriculumId: { type: 'string' }, payload: { type: 'object' } } } },
  { name: 'list-revision-proposals', version: '1.0.0', description: 'List revision proposals for a curriculum.', service: 'curriculum-service', priority: 'P1', scopeRequirement: { match: 'any', requiredScopes: ['curriculum:read'] }, capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' }, inputSchema: { type: 'object', required: ['curriculumId'], properties: { curriculumId: { type: 'string' } } } },
  { name: 'get-realignment-evidence', version: '1.0.0', description: 'List realignment evidence for a curriculum.', service: 'curriculum-service', priority: 'P1', scopeRequirement: { match: 'any', requiredScopes: ['curriculum:read'] }, capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' }, inputSchema: { type: 'object', required: ['curriculumId'], properties: { curriculumId: { type: 'string' } } } },
];

export function createToolRegistry(service: CurriculumService): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(TOOL_DEFINITIONS[0]!, async (_input, userId) => ({ success: true, data: await service.listCurricula(userId as never), agentHints: createEmptyAgentHints() }));
  registry.register(TOOL_DEFINITIONS[1]!, async (input, userId) => {
    const curriculumId = requireString(input, 'curriculumId');
    if (curriculumId === null) return failure('INVALID_INPUT', 'curriculumId is required');
    const curriculum = await service.getCurriculum(userId as never, curriculumId as never);
    if (curriculum === undefined) return failure('NOT_FOUND', 'Curriculum not found');
    return { success: true, data: curriculum, agentHints: createEmptyAgentHints() };
  });
  registry.register(TOOL_DEFINITIONS[2]!, async (input, userId) => {
    const curriculumId = requireString(input, 'curriculumId');
    if (curriculumId === null) return failure('INVALID_INPUT', 'curriculumId is required');
    const version = await service.getActiveVersion(userId as never, curriculumId as never);
    if (version === undefined) return failure('NOT_FOUND', 'Active curriculum version not found');
    return { success: true, data: version, agentHints: createEmptyAgentHints() };
  });
  registry.register(TOOL_DEFINITIONS[3]!, async (input, userId) => {
    const curriculumId = requireString(input, 'curriculumId');
    if (curriculumId === null) return failure('INVALID_INPUT', 'curriculumId is required');
    return { success: true, data: await service.getFrontier(userId as never, curriculumId as never), agentHints: createEmptyAgentHints() };
  });
  registry.register(TOOL_DEFINITIONS[4]!, async (input, userId) => {
    const curriculumId = requireString(input, 'curriculumId');
    if (curriculumId === null) return failure('INVALID_INPUT', 'curriculumId is required');
    return { success: true, data: await service.listProgress(userId as never, curriculumId as never), agentHints: createEmptyAgentHints() };
  });
  registry.register(TOOL_DEFINITIONS[5]!, async (input, userId, correlationId) => {
    const curriculumId = requireString(input, 'curriculumId');
    const payload = isRecord(input) ? input['payload'] : undefined;
    if (curriculumId === null) return failure('INVALID_INPUT', 'curriculumId is required');
    return { success: true, data: await service.getSessionSlice(userId as never, curriculumId as never, (payload ?? {}) as never, correlationId as never), agentHints: createEmptyAgentHints() };
  });
  registry.register(TOOL_DEFINITIONS[6]!, async (input, userId) => {
    const curriculumId = requireString(input, 'curriculumId');
    if (curriculumId === null) return failure('INVALID_INPUT', 'curriculumId is required');
    return { success: true, data: await service.listRevisionProposals(userId as never, curriculumId as never), agentHints: createEmptyAgentHints() };
  });
  registry.register(TOOL_DEFINITIONS[7]!, async (input, userId) => {
    const curriculumId = requireString(input, 'curriculumId');
    if (curriculumId === null) return failure('INVALID_INPUT', 'curriculumId is required');
    return { success: true, data: await service.listRealignmentEvidence(userId as never, curriculumId as never), agentHints: createEmptyAgentHints() };
  });
  return registry;
}
