import type { SchedulerService } from '../../domain/scheduler-service/scheduler.service.js';
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
  ToolHandler,
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
      value.forEach((item, index) => {
        validateValue(item, schema.items!, `${path}[${String(index)}]`, errors);
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
      const metadata: IToolResultMetadataExtended = {
        toolVersion: '0.1.0',
        timestamp: new Date().toISOString(),
        executionTime: 0,
        serviceVersion: '0.1.0',
        correlationId,
        resultCode: 'TOOL_NOT_FOUND',
        retryClass: 'permanent',
        failureDomain: 'validation',
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
        toolVersion: '0.1.0',
        timestamp: new Date().toISOString(),
        executionTime: 0,
        serviceVersion: '0.1.0',
        correlationId,
        resultCode: 'TOOL_INPUT_VALIDATION_FAILED',
        retryClass: 'permanent',
        failureDomain: 'validation',
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
    let retryClass: 'transient' | 'permanent' | 'unknown' = 'unknown';
    let failureDomain: 'network' | 'validation' | 'auth' | 'internal' | 'dependency' | undefined;

    try {
      result = await tool.handler(input, userId, correlationId);

      if (!result.success) {
        // Categorize failure
        const errorCode = result.error?.code ?? 'UNKNOWN_ERROR';
        resultCode = errorCode;

        // Determine retry class and failure domain based on error code
        if (errorCode.includes('VALIDATION') || errorCode.includes('INVALID')) {
          retryClass = 'permanent';
          failureDomain = 'validation';
        } else if (
          errorCode.includes('AUTH') ||
          errorCode.includes('FORBIDDEN') ||
          errorCode.includes('UNAUTHORIZED')
        ) {
          retryClass = 'permanent';
          failureDomain = 'auth';
        } else if (errorCode.includes('TIMEOUT') || errorCode.includes('UNAVAILABLE')) {
          retryClass = 'transient';
          failureDomain = 'network';
        } else if (errorCode.includes('DEPENDENCY') || errorCode.includes('EXTERNAL')) {
          retryClass = 'transient';
          failureDomain = 'dependency';
        } else {
          retryClass = 'unknown';
          failureDomain = 'internal';
        }
      }
    } catch (error) {
      // Handler threw an exception
      const message = error instanceof Error ? error.message : 'Unknown error';
      resultCode = 'HANDLER_EXCEPTION';
      retryClass = 'unknown';
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
      toolVersion: '0.1.0',
      timestamp: new Date().toISOString(),
      executionTime: Date.now() - started,
      serviceVersion: '0.1.0',
      correlationId,
      resultCode,
      retryClass,
      ...(failureDomain !== undefined ? { failureDomain } : {}),
    };

    result.metadata = metadata as IToolResultMetadata;
    return result;
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
