/**
 * @noema/session-service - MCP Tool Registry
 *
 * Central registry for all MCP tools exposed by the session-service.
 * Initializes handler functions bound to service instances.
 *
 * Usage in bootstrap:
 *   const registry = createToolRegistry(sessionService);
 *   await registerToolRoutes(fastify, registry, authMiddleware);
 */

import type { SessionService } from '../../domain/session-service/session.service.js';
import {
  createAcceptCohortHandler,
  createCommitCohortHandler,
  createEvaluateSessionCheckpointHandler,
  createGetAttemptHistoryHandler,
  createGetSessionHistoryHandler,
  createGetThinkingTraceHandler,
  createIssueOfflineIntentTokenHandler,
  createProposeCohortHandler,
  createRecordAttemptHandler,
  createRecordDialogueTurnHandler,
  createReviseCohortHandler,
  createValidateSessionBlueprintHandler,
  createVerifyOfflineIntentTokenHandler,
  SESSION_TOOL_DEFINITIONS,
} from './session.tools.js';
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
      value.forEach((item, index) =>
        validateValue(item, schema.items!, `${path}[${String(index)}]`, errors)
      );
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

function getDefinition(name: string): IToolDefinition {
  const def = SESSION_TOOL_DEFINITIONS.find((candidate) => candidate.name === name);
  if (def === undefined) {
    throw new Error(`Missing tool definition for name ${name}`);
  }
  return def;
}

const EXPECTED_SESSION_TOOL_NAMES = [
  'record-attempt',
  'get-attempt-history',
  'get-thinking-trace',
  'validate-session-blueprint',
  'evaluate-session-checkpoint',
  'propose-cohort',
  'accept-cohort',
  'revise-cohort',
  'commit-cohort',
  'issue-offline-intent-token',
  'verify-offline-intent-token',
  'record-dialogue-turn',
  'get-session-history',
] as const;

/**
 * Create a tool registry bound to the given service instances.
 */
export function createToolRegistry(sessionService: SessionService): ToolRegistry {
  const registry = new ToolRegistry();

  if (SESSION_TOOL_DEFINITIONS.length !== EXPECTED_SESSION_TOOL_NAMES.length) {
    throw new Error(
      `Expected ${String(EXPECTED_SESSION_TOOL_NAMES.length)} session tool definitions, found ${String(SESSION_TOOL_DEFINITIONS.length)}`
    );
  }

  for (const name of EXPECTED_SESSION_TOOL_NAMES) {
    getDefinition(name);
  }

  // P0 tools
  registry.register(getDefinition('record-attempt'), createRecordAttemptHandler(sessionService));
  registry.register(
    getDefinition('get-attempt-history'),
    createGetAttemptHistoryHandler(sessionService)
  );
  registry.register(
    getDefinition('get-thinking-trace'),
    createGetThinkingTraceHandler(sessionService)
  );
  registry.register(
    getDefinition('validate-session-blueprint'),
    createValidateSessionBlueprintHandler(sessionService)
  );
  registry.register(
    getDefinition('evaluate-session-checkpoint'),
    createEvaluateSessionCheckpointHandler(sessionService)
  );
  registry.register(getDefinition('propose-cohort'), createProposeCohortHandler(sessionService));
  registry.register(getDefinition('accept-cohort'), createAcceptCohortHandler(sessionService));
  registry.register(getDefinition('revise-cohort'), createReviseCohortHandler(sessionService));
  registry.register(getDefinition('commit-cohort'), createCommitCohortHandler(sessionService));
  registry.register(
    getDefinition('issue-offline-intent-token'),
    createIssueOfflineIntentTokenHandler(sessionService)
  );
  registry.register(
    getDefinition('verify-offline-intent-token'),
    createVerifyOfflineIntentTokenHandler(sessionService)
  );

  // P1 tools
  registry.register(
    getDefinition('record-dialogue-turn'),
    createRecordDialogueTurnHandler(sessionService)
  );

  // P2 tools
  registry.register(
    getDefinition('get-session-history'),
    createGetSessionHistoryHandler(sessionService)
  );

  return registry;
}
