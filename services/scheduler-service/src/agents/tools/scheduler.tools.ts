import type { CorrelationId, UserId } from '@noema/types';
import type { SchedulerService } from '../../domain/scheduler-service/scheduler.service.js';
import { buildExecutionContext } from '../../domain/scheduler-service/scheduler.service.js';
import type { IToolDefinition, IToolResult } from './tool.types.js';

function toContext(userId: string, correlationId: string) {
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

export function createPlanDualLaneHandler(service: SchedulerService) {
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

export function createIssueOfflineIntentTokenHandler(service: SchedulerService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const ctx = toContext(userId, correlationId);
      const result = await service.issueOfflineIntentToken(input, ctx);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

export function createVerifyOfflineIntentTokenHandler(service: SchedulerService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const ctx = toContext(userId, correlationId);
      const result = await service.verifyOfflineIntentToken(input, ctx);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

export const SCHEDULER_TOOL_DEFINITIONS: IToolDefinition[] = [
  {
    name: 'plan-dual-lane',
    description: 'Build a dual-lane scheduler plan from retention and calibration card pools.',
    service: 'scheduler-service',
    priority: 'P0',
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
      },
    },
  },
  {
    name: 'issue-offline-intent-token',
    description: 'Issue a signed offline intent token for session replay and sync reconciliation.',
    service: 'scheduler-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['userId', 'sessionBlueprint', 'expiresInSeconds'],
      properties: {
        userId: { type: 'string' },
        sessionBlueprint: { type: 'object' },
        expiresInSeconds: { type: 'number', minimum: 60, maximum: 86400 },
      },
    },
  },
  {
    name: 'verify-offline-intent-token',
    description: 'Verify signed offline intent token authenticity and extract replay claims.',
    service: 'scheduler-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['token'],
      properties: {
        token: { type: 'string' },
      },
    },
  },
];
