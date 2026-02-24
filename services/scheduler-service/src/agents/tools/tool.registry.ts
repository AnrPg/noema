import type { SchedulerService } from '../../domain/scheduler-service/scheduler.service.js';
import { schedulerObservability } from '../../infrastructure/observability/scheduler-observability.js';
import {
  createApplySessionAdjustmentsHandler,
  createBatchUpdateCardSchedulingHandler,
  createGetSRSScheduleHandler,
  createPlanDualLaneHandler,
  createPredictRetentionHandler,
  createProposeReviewWindowsHandler,
  createProposeSessionCandidatesHandler,
  createReconcileSessionCandidatesHandler,
  createUpdateCardSchedulingHandler,
  SCHEDULER_TOOL_DEFINITIONS,
} from './scheduler.tools.js';
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
  if (!isRecord(value)) {
    return undefined;
  }

  return value as IJsonSchema;
}

function validateValue(value: unknown, schema: IJsonSchema, path: string, errors: string[]): void {
  if (schema.enum !== undefined && Array.isArray(schema.enum)) {
    const hasEnumMatch = schema.enum.some((enumValue) => enumValue === value);
    if (!hasEnumMatch) {
      errors.push(
        `${path} must be one of: ${schema.enum.map((enumValue) => String(enumValue)).join(', ')}`
      );
      return;
    }
  }

  if (schema.type === undefined) {
    return;
  }

  if (schema.type === 'object') {
    if (!isRecord(value)) {
      errors.push(`${path} must be an object`);
      return;
    }

    if (schema.required !== undefined) {
      for (const key of schema.required) {
        if (!(key in value)) {
          errors.push(`${path}.${key} is required`);
        }
      }
    }

    if (schema.properties !== undefined) {
      for (const [key, childSchema] of Object.entries(schema.properties)) {
        if (key in value) {
          validateValue(value[key], childSchema, `${path}.${key}`, errors);
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

    if (schema.items !== undefined) {
      const itemSchema = schema.items;
      value.forEach((item, index) => {
        validateValue(item, itemSchema, `${path}[${String(index)}]`, errors);
      });
    }

    return;
  }

  if (schema.type === 'string' && typeof value !== 'string') {
    errors.push(`${path} must be a string`);
    return;
  }

  if (schema.type === 'number' && typeof value !== 'number') {
    errors.push(`${path} must be a number`);
    return;
  }

  if (schema.type === 'boolean' && typeof value !== 'boolean') {
    errors.push(`${path} must be a boolean`);
  }
}

function validateInputAgainstSchema(input: unknown, schema: Record<string, unknown>): string[] {
  const resolvedSchema = toSchema(schema);
  if (resolvedSchema === undefined) {
    return ['Tool definition has invalid input schema'];
  }

  const errors: string[] = [];
  validateValue(input, resolvedSchema, 'input', errors);
  return errors;
}

function classifyError(errorCode: string): {
  retryClass: ToolRetryClass;
  failureClass: ToolFailureClass;
  failureDomain: ToolFailureDomain;
} {
  if (errorCode.includes('VALIDATION') || errorCode.includes('INVALID')) {
    return {
      retryClass: 'permanent',
      failureClass: 'input.schema.invalid',
      failureDomain: 'validation',
    };
  }
  if (errorCode.includes('SCOPE')) {
    return {
      retryClass: 'permanent',
      failureClass: 'auth.missing_scope',
      failureDomain: 'auth',
    };
  }
  if (
    errorCode.includes('AUTH') ||
    errorCode.includes('FORBIDDEN') ||
    errorCode.includes('UNAUTHORIZED')
  ) {
    return {
      retryClass: 'permanent',
      failureClass: 'auth.invalid_token',
      failureDomain: 'auth',
    };
  }
  if (errorCode.includes('RATE_LIMIT')) {
    return {
      retryClass: 'transient',
      failureClass: 'rate.limit.exceeded',
      failureDomain: 'abuse',
    };
  }
  if (errorCode.includes('TIMEOUT')) {
    return {
      retryClass: 'transient',
      failureClass: 'dependency.timeout',
      failureDomain: 'dependency',
    };
  }
  if (errorCode.includes('NOT_FOUND')) {
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

  async execute(
    name: string,
    input: unknown,
    userId: string,
    correlationId: string
  ): Promise<IToolResult> {
    const span = schedulerObservability.startSpan('tool.registry.execute', {
      traceId: correlationId,
      correlationId,
      component: 'tool',
    });
    let spanSuccess = false;

    try {
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

      const started = Date.now();
      let result: IToolResult;
      let resultCode = 'SUCCESS';
      let retryClass: ToolRetryClass = 'unknown';
      let failureClass: ToolFailureClass | undefined;
      let failureDomain: ToolFailureDomain | undefined;

      try {
        result = await tool.handler(input, userId, correlationId);

        if (!result.success) {
          // Categorize failure
          const errorCode = result.error?.code ?? 'UNKNOWN_ERROR';
          resultCode = errorCode;
          const classification = classifyError(errorCode);
          retryClass = classification.retryClass;
          failureClass = classification.failureClass;
          failureDomain = classification.failureDomain;
        }
      } catch (error) {
        // Handler threw an exception
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
            estimatedImpact: { benefit: 0, effort: 0.2, roi: 0 },
            preferenceAlignment: [],
            reasoning: message,
          },
        };
      }

      const metadata: IToolResultMetadataExtended = {
        toolVersion: tool.definition.version,
        timestamp: new Date().toISOString(),
        executionTime: Date.now() - started,
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
      if (!result.success && result.error !== undefined) {
        schedulerObservability.recordError('validation', result.error.code);
      }
      spanSuccess = result.success;
      return result;
    } finally {
      span.end(spanSuccess);
    }
  }

  listDefinitions(): IToolDefinition[] {
    return [...this.tools.values()].map((entry) => entry.definition);
  }

  getDefinition(name: string): IToolDefinition | undefined {
    const entry = this.tools.get(name);
    return entry?.definition;
  }
}

export function createToolRegistry(service: SchedulerService): ToolRegistry {
  const registry = new ToolRegistry();

  if (SCHEDULER_TOOL_DEFINITIONS.length !== 9) {
    throw new Error(
      `Expected 9 scheduler tool definitions, found ${String(SCHEDULER_TOOL_DEFINITIONS.length)}`
    );
  }

  const definitionsByName = new Map(
    SCHEDULER_TOOL_DEFINITIONS.map((definition) => [definition.name, definition])
  );
  const requireDefinition = (name: string): IToolDefinition => {
    const definition = definitionsByName.get(name);
    if (definition === undefined) {
      throw new Error(`Scheduler tool definition missing: ${name}`);
    }
    return definition;
  };

  registry.register(requireDefinition('plan-dual-lane'), createPlanDualLaneHandler(service));
  registry.register(requireDefinition('get-srs-schedule'), createGetSRSScheduleHandler(service));
  registry.register(requireDefinition('predict-retention'), createPredictRetentionHandler(service));
  registry.register(
    requireDefinition('propose-review-windows'),
    createProposeReviewWindowsHandler(service)
  );
  registry.register(
    requireDefinition('propose-session-candidates'),
    createProposeSessionCandidatesHandler(service)
  );
  registry.register(
    requireDefinition('reconcile-session-candidates'),
    createReconcileSessionCandidatesHandler(service)
  );
  registry.register(
    requireDefinition('apply-session-adjustments'),
    createApplySessionAdjustmentsHandler(service)
  );
  registry.register(
    requireDefinition('update-card-scheduling'),
    createUpdateCardSchedulingHandler(service)
  );
  registry.register(
    requireDefinition('batch-update-card-scheduling'),
    createBatchUpdateCardSchedulingHandler(service)
  );

  return registry;
}
