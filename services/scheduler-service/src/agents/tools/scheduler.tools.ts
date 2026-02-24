import type { CorrelationId, UserId } from '@noema/types';
import type { SchedulerService } from '../../domain/scheduler-service/scheduler.service.js';
import { buildExecutionContext } from '../../domain/scheduler-service/scheduler.service.js';
import { schedulerObservability } from '../../infrastructure/observability/scheduler-observability.js';
import type { IExecutionContext } from '../../types/scheduler.types.js';
import type { IToolDefinition, IToolResult, ToolHandler } from './tool.types.js';

// ============================================================================
// Helpers
// ============================================================================

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

async function executeObserved(
  spanName: string,
  traceId: string,
  operation: () => Promise<IToolResult>,
  throughput?: 'proposal' | 'commit'
): Promise<IToolResult> {
  const span = schedulerObservability.startSpan(spanName, {
    traceId,
    correlationId: traceId,
    component: 'domain',
  });

  let success = false;
  try {
    const result = await operation();
    success = result.success;

    if (result.success && throughput === 'proposal') {
      schedulerObservability.recordProposalThroughput(1);
    }

    if (result.success && throughput === 'commit') {
      schedulerObservability.recordCommitThroughput(1);
    }

    return result;
  } finally {
    span.end(success);
  }
}

// ============================================================================
// Tool Handlers
// ============================================================================

export function createPlanDualLaneHandler(service: SchedulerService): ToolHandler {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    return executeObserved(`domain.scheduler.planDualLaneQueue`, correlationId, async () => {
      try {
        const ctx = toContext(userId, correlationId);
        const result = await service.planDualLaneQueue(input, ctx);
        return { success: true, data: result.data, agentHints: result.agentHints };
      } catch (error) {
        return errorResult(error);
      }
    });
  };
}

export function createGetSRSScheduleHandler(service: SchedulerService): ToolHandler {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    return executeObserved(`domain.scheduler.getReviewQueue`, correlationId, async () => {
      try {
        const ctx = toContext(userId, correlationId);
        const result = await service.getReviewQueue(input, ctx);
        return { success: true, data: result.data, agentHints: result.agentHints };
      } catch (error) {
        return errorResult(error);
      }
    });
  };
}

export function createPredictRetentionHandler(service: SchedulerService): ToolHandler {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    return executeObserved(`domain.scheduler.predictRetention`, correlationId, async () => {
      try {
        const ctx = toContext(userId, correlationId);
        const result = await service.predictRetention(input, ctx);
        return { success: true, data: result.data, agentHints: result.agentHints };
      } catch (error) {
        return errorResult(error);
      }
    });
  };
}

export function createProposeReviewWindowsHandler(service: SchedulerService): ToolHandler {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    return executeObserved(
      `domain.scheduler.proposeReviewWindows`,
      correlationId,
      async () => {
        try {
          const ctx = toContext(userId, correlationId);
          const result = await service.proposeReviewWindows(input, ctx);
          return { success: true, data: result.data, agentHints: result.agentHints };
        } catch (error) {
          return errorResult(error);
        }
      },
      'proposal'
    );
  };
}

export function createProposeSessionCandidatesHandler(service: SchedulerService): ToolHandler {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    return executeObserved(
      `domain.scheduler.proposeSessionCandidates`,
      correlationId,
      async () => {
        try {
          const ctx = toContext(userId, correlationId);
          const result = await service.proposeSessionCandidates(input, ctx);
          return { success: true, data: result.data, agentHints: result.agentHints };
        } catch (error) {
          return errorResult(error);
        }
      },
      'proposal'
    );
  };
}

export function createReconcileSessionCandidatesHandler(service: SchedulerService): ToolHandler {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    return executeObserved(
      `domain.scheduler.simulateSessionCandidates`,
      correlationId,
      async () => {
        try {
          const ctx = toContext(userId, correlationId);
          const result = await service.simulateSessionCandidates(input, ctx);
          return { success: true, data: result.data, agentHints: result.agentHints };
        } catch (error) {
          return errorResult(error);
        }
      },
      'proposal'
    );
  };
}

export function createApplySessionAdjustmentsHandler(service: SchedulerService): ToolHandler {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    return executeObserved(
      `domain.scheduler.applySessionAdjustments`,
      correlationId,
      async () => {
        try {
          const ctx = toContext(userId, correlationId);
          const result = await service.applySessionAdjustments(input, ctx);
          return { success: true, data: result.data, agentHints: result.agentHints };
        } catch (error) {
          return errorResult(error);
        }
      },
      'commit'
    );
  };
}

export function createUpdateCardSchedulingHandler(service: SchedulerService): ToolHandler {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    return executeObserved(
      `domain.scheduler.commitCardSchedule`,
      correlationId,
      async () => {
        try {
          const ctx = toContext(userId, correlationId);
          const result = await service.commitCardSchedule(input, ctx);
          return { success: true, data: result.data, agentHints: result.agentHints };
        } catch (error) {
          return errorResult(error);
        }
      },
      'commit'
    );
  };
}

export function createBatchUpdateCardSchedulingHandler(service: SchedulerService): ToolHandler {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    return executeObserved(
      `domain.scheduler.commitCardScheduleBatch`,
      correlationId,
      async () => {
        try {
          const ctx = toContext(userId, correlationId);
          const result = await service.commitCardScheduleBatch(input, ctx);
          return { success: true, data: result.data, agentHints: result.agentHints };
        } catch (error) {
          return errorResult(error);
        }
      },
      'commit'
    );
  };
}

// ============================================================================
// Tool Definitions (Phase 4)
// ============================================================================

export const SCHEDULER_TOOL_DEFINITIONS: IToolDefinition[] = [
  {
    name: 'plan-dual-lane',
    description:
      'Build a dual-lane scheduler plan from retention and calibration card pools. ' +
      'Supports priority-based selection, urgency-aware spillover, and interleaved ordering.',
    service: 'scheduler-service',
    priority: 'P0',
    scopeRequirement: {
      match: 'all',
      requiredScopes: ['scheduler:plan', 'scheduler:tools:execute'],
    },
    capabilities: {
      idempotent: true,
      sideEffects: false,
      timeoutMs: 5000,
      costClass: 'medium',
    },
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
          additionalProperties: { type: 'number' },
        },
        interleave: { type: 'boolean' },
      },
    },
  },
  {
    name: 'get-srs-schedule',
    description:
      'Retrieve SRS review queue with cards due for review. ' +
      'Supports lane filtering and customizable result limits.',
    service: 'scheduler-service',
    priority: 'P0',
    scopeRequirement: {
      match: 'all',
      requiredScopes: ['scheduler:read', 'scheduler:tools:execute'],
    },
    capabilities: {
      idempotent: true,
      sideEffects: false,
      timeoutMs: 3000,
      costClass: 'low',
    },
    inputSchema: {
      type: 'object',
      required: ['userId'],
      properties: {
        userId: { type: 'string' },
        lane: { type: 'string', enum: ['retention', 'calibration'] },
        limit: { type: 'number', minimum: 1, maximum: 500 },
        asOf: { type: 'string', format: 'date-time' },
      },
    },
  },
  {
    name: 'predict-retention',
    description:
      'Compute retention probability predictions for cards using FSRS, HLR, or SM2 algorithms. ' +
      'Returns forgetting curve projections and next review estimates.',
    service: 'scheduler-service',
    priority: 'P1',
    scopeRequirement: {
      match: 'all',
      requiredScopes: ['scheduler:predict', 'scheduler:tools:execute'],
    },
    capabilities: {
      idempotent: true,
      sideEffects: false,
      timeoutMs: 8000,
      costClass: 'medium',
    },
    inputSchema: {
      type: 'object',
      required: ['userId', 'cards'],
      properties: {
        userId: { type: 'string' },
        cards: {
          type: 'array',
          minItems: 1,
          maxItems: 500,
          items: {
            type: 'object',
            required: ['cardId', 'algorithm'],
            properties: {
              cardId: { type: 'string' },
              algorithm: { type: 'string', enum: ['fsrs', 'hlr', 'sm2'] },
              asOf: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  },
  {
    name: 'propose-review-windows',
    description:
      'Generate deterministic review schedule proposals for a card pool without committing. ' +
      'Used by agents to preview scheduler decisions before session creation.',
    service: 'scheduler-service',
    priority: 'P0',
    scopeRequirement: {
      match: 'all',
      requiredScopes: ['scheduler:plan', 'scheduler:tools:execute'],
    },
    capabilities: {
      idempotent: true,
      sideEffects: false,
      timeoutMs: 6000,
      costClass: 'medium',
    },
    inputSchema: {
      type: 'object',
      required: ['userId', 'cards'],
      properties: {
        userId: { type: 'string' },
        cards: {
          type: 'array',
          minItems: 1,
          maxItems: 500,
          items: {
            type: 'object',
            required: ['cardId', 'algorithm'],
            properties: {
              cardId: { type: 'string' },
              algorithm: { type: 'string', enum: ['fsrs', 'hlr', 'sm2'] },
              lastReviewAt: { type: 'string', format: 'date-time' },
              stability: { type: 'number', minimum: 0 },
              difficulty: { type: 'number', minimum: 0 },
              lapses: { type: 'number', minimum: 0 },
            },
          },
        },
        asOf: { type: 'string', format: 'date-time' },
      },
    },
  },
  {
    name: 'propose-session-candidates',
    description:
      'Compute scored session candidate selection from a card pool using deterministic scheduling policy. ' +
      'Supports lane mix constraints and urgency-based prioritization.',
    service: 'scheduler-service',
    priority: 'P1',
    scopeRequirement: {
      match: 'all',
      requiredScopes: ['scheduler:plan', 'scheduler:tools:execute'],
    },
    capabilities: {
      idempotent: true,
      sideEffects: false,
      timeoutMs: 7000,
      costClass: 'medium',
    },
    inputSchema: {
      type: 'object',
      required: ['userId', 'cards', 'constraints'],
      properties: {
        userId: { type: 'string' },
        cards: {
          type: 'array',
          minItems: 1,
          maxItems: 2000,
          items: {
            type: 'object',
            required: ['cardId', 'lane'],
            properties: {
              cardId: { type: 'string' },
              lane: { type: 'string', enum: ['retention', 'calibration'] },
              dueAt: { type: 'string', format: 'date-time' },
              retentionProbability: { type: 'number', minimum: 0, maximum: 1 },
              estimatedSeconds: { type: 'number', minimum: 1 },
            },
          },
        },
        constraints: {
          type: 'object',
          required: ['targetCards'],
          properties: {
            targetCards: { type: 'number', minimum: 1, maximum: 500 },
            maxSessionDurationMinutes: { type: 'number', minimum: 1, maximum: 240 },
            includeCalibration: { type: 'boolean' },
            laneMix: {
              type: 'object',
              properties: {
                retention: { type: 'number', minimum: 0, maximum: 1 },
                calibration: { type: 'number', minimum: 0, maximum: 1 },
              },
            },
          },
        },
        sourceDeckId: { type: 'string' },
        sessionContext: { type: 'object' },
      },
    },
  },
  {
    name: 'reconcile-session-candidates',
    description:
      'Recompute session candidate recommendations for an active session using live telemetry. ' +
      'Simulation-only operation (no side effects).',
    service: 'scheduler-service',
    priority: 'P2',
    scopeRequirement: {
      match: 'all',
      requiredScopes: ['scheduler:plan', 'scheduler:tools:execute'],
    },
    capabilities: {
      idempotent: true,
      sideEffects: false,
      timeoutMs: 6000,
      costClass: 'medium',
    },
    inputSchema: {
      type: 'object',
      required: ['userId', 'cards', 'constraints'],
      properties: {
        userId: { type: 'string' },
        cards: {
          type: 'array',
          minItems: 1,
          maxItems: 2000,
          items: {
            type: 'object',
            required: ['cardId', 'lane'],
            properties: {
              cardId: { type: 'string' },
              lane: { type: 'string', enum: ['retention', 'calibration'] },
              dueAt: { type: 'string', format: 'date-time' },
              retentionProbability: { type: 'number', minimum: 0, maximum: 1 },
              estimatedSeconds: { type: 'number', minimum: 1 },
            },
          },
        },
        constraints: {
          type: 'object',
          required: ['targetCards'],
          properties: {
            targetCards: { type: 'number', minimum: 1, maximum: 500 },
          },
        },
        whatIfAdjustments: { type: 'object' },
        sessionContext: { type: 'object' },
      },
    },
  },
  {
    name: 'apply-session-adjustments',
    description:
      'Apply runtime session adjustments to modify card priority, add/remove cards from active session. ' +
      'Used by agents for dynamic session optimization.',
    service: 'scheduler-service',
    priority: 'P1',
    scopeRequirement: {
      match: 'all',
      requiredScopes: ['scheduler:write', 'scheduler:tools:execute'],
    },
    capabilities: {
      idempotent: false,
      sideEffects: true,
      timeoutMs: 4000,
      costClass: 'low',
    },
    inputSchema: {
      type: 'object',
      required: ['userId', 'sessionId', 'adjustments', 'orchestration'],
      properties: {
        userId: { type: 'string' },
        sessionId: { type: 'string' },
        adjustments: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            required: ['cardId', 'action', 'reason'],
            properties: {
              cardId: { type: 'string' },
              action: { type: 'string', enum: ['add', 'remove', 'reprioritize'] },
              reason: { type: 'string' },
              newPriority: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
        },
        orchestration: { type: 'object' },
      },
    },
  },
  {
    name: 'update-card-scheduling',
    description:
      'Commit a single card schedule decision. ' +
      'Updates next review date, interval, and scheduling parameters.',
    service: 'scheduler-service',
    priority: 'P0',
    scopeRequirement: {
      match: 'all',
      requiredScopes: ['scheduler:write', 'scheduler:tools:execute'],
    },
    capabilities: {
      idempotent: false,
      sideEffects: true,
      timeoutMs: 3000,
      costClass: 'low',
    },
    inputSchema: {
      type: 'object',
      required: ['userId', 'decision', 'policyVersion', 'orchestration'],
      properties: {
        userId: { type: 'string' },
        decision: {
          type: 'object',
          required: ['cardId', 'nextReviewAt', 'intervalDays', 'lane', 'algorithm', 'rationale'],
          properties: {
            cardId: { type: 'string' },
            nextReviewAt: { type: 'string', format: 'date-time' },
            intervalDays: { type: 'number', minimum: 0 },
            lane: { type: 'string', enum: ['retention', 'calibration'] },
            algorithm: { type: 'string', enum: ['fsrs', 'hlr', 'sm2'] },
            rationale: { type: 'string' },
          },
        },
        policyVersion: { type: 'object' },
        orchestration: { type: 'object' },
        reason: { type: 'string' },
      },
    },
  },
  {
    name: 'batch-update-card-scheduling',
    description:
      'Commit multiple card schedule decisions in a single batch operation. ' +
      'Supports partial failure with detailed accepted/rejected counts.',
    service: 'scheduler-service',
    priority: 'P1',
    scopeRequirement: {
      match: 'all',
      requiredScopes: ['scheduler:write', 'scheduler:tools:execute'],
    },
    capabilities: {
      idempotent: false,
      sideEffects: true,
      timeoutMs: 15000,
      costClass: 'high',
    },
    inputSchema: {
      type: 'object',
      required: ['userId', 'decisions', 'source', 'policyVersion', 'orchestration'],
      properties: {
        userId: { type: 'string' },
        decisions: {
          type: 'array',
          minItems: 1,
          maxItems: 500,
          items: {
            type: 'object',
            required: ['cardId', 'nextReviewAt', 'intervalDays', 'lane', 'algorithm', 'rationale'],
            properties: {
              cardId: { type: 'string' },
              nextReviewAt: { type: 'string', format: 'date-time' },
              intervalDays: { type: 'number', minimum: 0 },
              lane: { type: 'string', enum: ['retention', 'calibration'] },
              algorithm: { type: 'string', enum: ['fsrs', 'hlr', 'sm2'] },
              rationale: { type: 'string' },
            },
          },
        },
        source: { type: 'string', enum: ['agent', 'session-service', 'scheduler-service'] },
        policyVersion: { type: 'object' },
        orchestration: { type: 'object' },
        reason: { type: 'string' },
      },
    },
  },
];
