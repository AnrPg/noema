import type { CorrelationId, UserId } from '@noema/types';
import type { SchedulerService } from '../../domain/scheduler-service/scheduler.service.js';
import { buildExecutionContext } from '../../domain/scheduler-service/scheduler.service.js';
import type { IExecutionContext } from '../../types/scheduler.types.js';
import type { IToolDefinition, IToolResult, ToolHandler } from './tool.types.js';

function toContext(userId: string, correlationId: string): IExecutionContext {
  return buildExecutionContext(userId as UserId, correlationId as CorrelationId);
}

function errorResult(error: unknown): IToolResult {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    success: false,
    error: { code: 'TOOL_ERROR', message },
    agentHints: {
      suggestedNextActions: [],
      relatedResources: [],
      confidence: 0.6,
      sourceQuality: 'medium',
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

export function createPlanDualLaneHandler(service: SchedulerService): ToolHandler {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const ctx = toContext(userId, correlationId);
      const result = await service.planDualLaneQueue(input, ctx);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

export const SCHEDULER_TOOL_DEFINITIONS: IToolDefinition[] = [
  {
    name: 'plan-dual-lane',
    description:
      'Build a dual-lane scheduler plan from retention and calibration card pools. ' +
      'Supports priority-based selection, urgency-aware spillover, and interleaved ordering.',
    service: 'scheduler-service',
    priority: 'P0',
    requiredScopes: ['scheduler:plan', 'scheduler:tools:execute'],
    inputSchema: {
      type: 'object',
      required: ['userId', 'retentionCardIds', 'calibrationCardIds', 'maxCards'],
      properties: {
        userId: { type: 'string' },
        retentionCardIds: { type: 'array', items: { type: 'string' } },
        calibrationCardIds: { type: 'array', items: { type: 'string' } },
        targetMix: {
          type: 'object',
          properties: {
            retention: { type: 'number', minimum: 0, maximum: 1 },
            calibration: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
        maxCards: { type: 'number', minimum: 1, maximum: 500 },
        cardPriorityScores: {
          type: 'object',
          description: 'Per-card priority scores (higher = more urgent). Keys are card IDs.',
          additionalProperties: { type: 'number' },
        },
        interleave: {
          type: 'boolean',
          description: 'Interleave retention/calibration cards in output (default true).',
        },
      },
    },
  },
];
