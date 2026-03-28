/**
 * @noema/knowledge-graph-service - MCP Tool Registry
 *
 * Central registry for all MCP tools exposed by the knowledge-graph-service.
 * Initializes handler functions bound to service instances.
 *
 * Follows the content-service tool registry pattern exactly:
 * - ToolRegistry class (register, get, list, execute)
 * - Input validation against JSON Schema
 * - Error classification (retry/failure class + domain)
 * - Metadata attachment with timing + classification
 *
 * Usage in bootstrap:
 *   const registry = createToolRegistry(service);
 *   registerToolRoutes(fastify, registry, authMiddleware);
 */

import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import {
  KG_TOOL_DEFINITIONS,
  createAddConceptNodeHandler,
  createAddEdgeHandler,
  createComputeStructuralMetricsHandler,
  createDetectMisconceptionsHandler,
  createFindPrerequisitesHandler,
  createFindRelatedConceptsHandler,
  createGetCanonicalStructureHandler,
  createGetConceptNodeHandler,
  createGetLearningPathContextHandler,
  createGetNodeMasterySummaryHandler,
  createGetMetacognitiveStageHandler,
  createGetMutationStatusHandler,
  createGetStructuralHealthHandler,
  createGetSubgraphHandler,
  createProposeMutationHandler,
  createRemoveEdgeHandler,
  createRemoveNodeHandler,
  createSuggestInterventionHandler,
  createUpdateMasteryHandler,
} from './kg.tools.js';
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

// ============================================================================
// JSON Schema Validation (content-service pattern)
// ============================================================================

interface IJsonSchema {
  type?: string;
  required?: string[];
  properties?: Record<string, IJsonSchema>;
  items?: IJsonSchema;
  enum?: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toSchema(value: unknown): IJsonSchema | undefined {
  if (!isRecord(value)) return undefined;
  return value as IJsonSchema;
}

function validateValue(value: unknown, schema: IJsonSchema, path: string, errors: string[]): void {
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => entry === value)) {
    errors.push(`${path} must be one of: ${schema.enum.map((entry) => String(entry)).join(', ')}`);
    return;
  }

  if (schema.type === undefined) return;

  if (schema.type === 'object') {
    if (!isRecord(value)) {
      errors.push(`${path} must be an object`);
      return;
    }
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) {
          errors.push(`${path}.${key} is required`);
        }
      }
    }
    if (schema.properties) {
      for (const [key, nested] of Object.entries(schema.properties)) {
        if (key in value) {
          validateValue(value[key], nested, `${path}.${key}`, errors);
        }
      }
    }
    return;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array`);
      return;
    }
    if (schema.items) {
      const itemSchema = schema.items;
      value.forEach((item, index) => {
        validateValue(item, itemSchema, `${path}[${String(index)}]`, errors);
      });
    }
    return;
  }

  if (schema.type === 'string' && typeof value !== 'string')
    errors.push(`${path} must be a string`);
  if (schema.type === 'number' && typeof value !== 'number')
    errors.push(`${path} must be a number`);
  if (schema.type === 'boolean' && typeof value !== 'boolean')
    errors.push(`${path} must be a boolean`);
}

function validateInputAgainstSchema(input: unknown, schema: Record<string, unknown>): string[] {
  const resolved = toSchema(schema);
  if (!resolved) return ['Tool definition has invalid input schema'];
  const errors: string[] = [];
  validateValue(input, resolved, 'input', errors);
  return errors;
}

// ============================================================================
// Error Classification (content-service pattern)
// ============================================================================

function classifyError(errorCode: string): {
  retryClass: ToolRetryClass;
  failureClass: ToolFailureClass;
  failureDomain: ToolFailureDomain;
} {
  const normalizedCode = errorCode.toUpperCase();

  if (normalizedCode.includes('VALIDATION') || normalizedCode.includes('INVALID')) {
    return {
      retryClass: 'permanent',
      failureClass: 'input.schema.invalid',
      failureDomain: 'validation',
    };
  }
  if (normalizedCode.includes('SCOPE')) {
    return {
      retryClass: 'permanent',
      failureClass: 'auth.missing_scope',
      failureDomain: 'auth',
    };
  }
  if (
    normalizedCode.includes('AUTH') ||
    normalizedCode.includes('FORBIDDEN') ||
    normalizedCode.includes('UNAUTHORIZED')
  ) {
    return {
      retryClass: 'permanent',
      failureClass: 'auth.invalid_token',
      failureDomain: 'auth',
    };
  }
  if (normalizedCode.includes('RATE_LIMIT') || normalizedCode.includes('QUOTA')) {
    return {
      retryClass: 'transient',
      failureClass: 'rate.limit.exceeded',
      failureDomain: 'abuse',
    };
  }
  if (normalizedCode.includes('NOT_FOUND') || normalizedCode.includes('CONFLICT')) {
    return {
      retryClass: 'permanent',
      failureClass: normalizedCode.includes('CONFLICT') ? 'state.conflict' : 'state.not_found',
      failureDomain: 'state',
    };
  }
  if (normalizedCode.includes('IDEMPOTENCY') || normalizedCode.includes('DUPLICATE')) {
    return {
      retryClass: 'permanent',
      failureClass: 'idempotency.duplicate',
      failureDomain: 'state',
    };
  }
  if (
    normalizedCode.includes('DEPENDENCY') ||
    normalizedCode.includes('EXTERNAL') ||
    normalizedCode.includes('UPSTREAM')
  ) {
    return {
      retryClass: 'transient',
      failureClass: 'dependency.unavailable',
      failureDomain: 'dependency',
    };
  }
  if (normalizedCode.includes('TIMEOUT') || normalizedCode.includes('UNAVAILABLE')) {
    return {
      retryClass: 'transient',
      failureClass: 'network.timeout',
      failureDomain: 'network',
    };
  }
  return {
    retryClass: 'unknown',
    failureClass: 'internal.unknown',
    failureDomain: 'internal',
  };
}

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
    if (!tool) {
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
        metadata: metadata as IToolResultMetadata,
      };
    }

    const validationErrors = validateInputAgainstSchema(input, tool.definition.inputSchema);
    if (validationErrors.length > 0) {
      const metadata: IToolResultMetadataExtended = {
        toolVersion: tool.definition.version,
        timestamp: new Date().toISOString(),
        executionTime: 0,
        serviceVersion: '0.1.0',
        correlationId,
        requestId: correlationId,
        toolName: tool.definition.name,
        attemptCount: 1,
        resultCode: 'TOOL_INPUT_VALIDATION_FAILED',
        retryClass: 'permanent',
        failureClass: 'input.schema.invalid',
        failureDomain: 'validation',
        validationErrors,
        httpStatusHint: 422,
      };

      return {
        success: false,
        error: {
          code: 'TOOL_INPUT_VALIDATION_FAILED',
          message: validationErrors.join('; '),
        },
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
          reasoning: 'Tool input does not match required schema',
        },
        metadata: metadata as IToolResultMetadata,
      };
    }

    const startTime = Date.now();
    let result: IToolResult;
    let resultCode = 'SUCCESS';
    let retryClass: ToolRetryClass = 'unknown';
    let failureClass: ToolFailureClass | undefined;
    let failureDomain: ToolFailureDomain | undefined;

    try {
      result = await tool.handler(input, userId, correlationId);
      if (!result.success) {
        resultCode = result.error?.code ?? 'UNKNOWN_ERROR';
        const classification = classifyError(resultCode);
        retryClass = classification.retryClass;
        failureClass = classification.failureClass;
        failureDomain = classification.failureDomain;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      resultCode = 'HANDLER_EXCEPTION';
      retryClass = 'unknown';
      failureClass = 'internal.exception';
      failureDomain = 'internal';
      result = {
        success: false,
        error: { code: 'HANDLER_EXCEPTION', message },
        agentHints: {
          suggestedNextActions: [],
          relatedResources: [],
          confidence: 0.5,
          sourceQuality: 'low',
          validityPeriod: 'short',
          contextNeeded: [],
          assumptions: [],
          riskFactors: [],
          dependencies: [],
          estimatedImpact: { benefit: 0, effort: 0.1, roi: 0 },
          preferenceAlignment: [],
          reasoning: message,
        },
      };
    }

    const metadata: IToolResultMetadataExtended = {
      toolVersion: tool.definition.version,
      timestamp: new Date().toISOString(),
      executionTime: Date.now() - startTime,
      serviceVersion: '0.1.0',
      correlationId,
      requestId: correlationId,
      toolName: tool.definition.name,
      attemptCount: 1,
      resultCode,
      retryClass,
      ...(failureClass !== undefined ? { failureClass } : {}),
      ...(failureDomain !== undefined ? { failureDomain } : {}),
    };
    result.metadata = metadata as IToolResultMetadata;

    return result;
  }

  get size(): number {
    return this.tools.size;
  }
}

// ============================================================================
// Factory
// ============================================================================

const EXPECTED_KG_TOOL_NAMES = [
  // Task 1: PKG tools
  'get-concept-node',
  'get-subgraph',
  'find-prerequisites',
  'find-related-concepts',
  'add-concept-node',
  'add-edge',
  'update-mastery',
  'remove-node',
  'remove-edge',
  // Task 2: CKG tools
  'get-canonical-structure',
  'propose-mutation',
  'get-mutation-status',
  // Task 3: Structural analysis tools
  'compute-structural-metrics',
  'get-structural-health',
  'detect-misconceptions',
  'suggest-intervention',
  // Task 4: Metacognitive tools
  'get-metacognitive-stage',
  'get-learning-path-context',
] as const;

/**
 * Create a tool registry bound to the given KnowledgeGraphService instance.
 */
export function createToolRegistry(service: IKnowledgeGraphService): ToolRegistry {
  const registry = new ToolRegistry();

  if (KG_TOOL_DEFINITIONS.length !== EXPECTED_KG_TOOL_NAMES.length) {
    throw new Error(
      `Expected ${String(EXPECTED_KG_TOOL_NAMES.length)} KG tool definitions, found ${String(KG_TOOL_DEFINITIONS.length)}`
    );
  }

  const definitionsByName = new Map(
    KG_TOOL_DEFINITIONS.map((definition) => [definition.name, definition])
  );
  const requireDefinition = (name: string): IToolDefinition => {
    const definition = definitionsByName.get(name);
    if (definition === undefined) {
      throw new Error(`KG tool definition missing: ${name}`);
    }
    return definition;
  };

  for (const name of EXPECTED_KG_TOOL_NAMES) {
    requireDefinition(name);
  }

  // Task 1: PKG tools
  registry.register(requireDefinition('get-concept-node'), createGetConceptNodeHandler(service));
  registry.register(requireDefinition('get-subgraph'), createGetSubgraphHandler(service));
  registry.register(
    requireDefinition('find-prerequisites'),
    createFindPrerequisitesHandler(service)
  );
  registry.register(
    requireDefinition('find-related-concepts'),
    createFindRelatedConceptsHandler(service)
  );
  registry.register(requireDefinition('add-concept-node'), createAddConceptNodeHandler(service));
  registry.register(requireDefinition('add-edge'), createAddEdgeHandler(service));
  registry.register(requireDefinition('update-mastery'), createUpdateMasteryHandler(service));
  registry.register(
    requireDefinition('get-node-mastery-summary'),
    createGetNodeMasterySummaryHandler(service)
  );
  registry.register(requireDefinition('remove-node'), createRemoveNodeHandler(service));
  registry.register(requireDefinition('remove-edge'), createRemoveEdgeHandler(service));

  // Task 2: CKG tools
  registry.register(
    requireDefinition('get-canonical-structure'),
    createGetCanonicalStructureHandler(service)
  );
  registry.register(requireDefinition('propose-mutation'), createProposeMutationHandler(service));
  registry.register(
    requireDefinition('get-mutation-status'),
    createGetMutationStatusHandler(service)
  );

  // Task 3: Structural analysis tools
  registry.register(
    requireDefinition('compute-structural-metrics'),
    createComputeStructuralMetricsHandler(service)
  );
  registry.register(
    requireDefinition('get-structural-health'),
    createGetStructuralHealthHandler(service)
  );
  registry.register(
    requireDefinition('detect-misconceptions'),
    createDetectMisconceptionsHandler(service)
  );
  registry.register(
    requireDefinition('suggest-intervention'),
    createSuggestInterventionHandler(service)
  );

  // Task 4: Metacognitive tools
  registry.register(
    requireDefinition('get-metacognitive-stage'),
    createGetMetacognitiveStageHandler(service)
  );
  registry.register(
    requireDefinition('get-learning-path-context'),
    createGetLearningPathContextHandler(service)
  );

  return registry;
}
