/**
 * @noema/session-service - Session MCP Tool Handlers
 *
 * 5 MCP tools registered per AGENT_MCP_TOOL_REGISTRY.md:
 * - get-session-history (P2)
 * - record-attempt (P0)
 * - get-attempt-history (P0)
 * - get-thinking-trace (P0)
 * - record-dialogue-turn (P1)
 *
 * Each handler wraps a SessionService method and returns IToolResult.
 */

import { createEmptyAgentHints } from '@noema/contracts';
import type { CorrelationId, UserId } from '@noema/types';
import { DomainError } from '../../domain/session-service/errors/index.js';
import type {
  IExecutionContext,
  SessionService,
} from '../../domain/session-service/session.service.js';
import type { SessionState } from '../../types/index.js';
import type { IToolDefinition, IToolResult } from './tool.types.js';

// ============================================================================
// Helper
// ============================================================================

function buildContext(userId: string, correlationId: string): IExecutionContext {
  return {
    userId: userId as UserId,
    correlationId: correlationId as CorrelationId,
  };
}

function errorResult(error: unknown): IToolResult {
  if (error instanceof DomainError) {
    return {
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
      agentHints: {
        suggestedNextActions: [],
        relatedResources: [],
        confidence: 0.9,
        sourceQuality: 'high',
        validityPeriod: 'short',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [
          {
            type: 'accuracy',
            severity: 'medium',
            description: error.message,
            probability: 1.0,
            impact: 0.5,
            mitigation: error.message,
          },
        ],
        dependencies: [],
        estimatedImpact: { benefit: 0, effort: 0.1, roi: 0 },
        preferenceAlignment: [],
        reasoning: `Tool failed: ${error.message}`,
      },
    };
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    success: false,
    error: { code: 'INTERNAL_ERROR', message },
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
      reasoning: `Tool failed unexpectedly: ${message}`,
    },
  };
}

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * get-session-history — Get session history for the current user.
 * P2 tool used by agents to review session patterns.
 */
export function createGetSessionHistoryHandler(service: SessionService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const ctx = buildContext(userId, correlationId);
      const body = input as Record<string, unknown>;
      const stateRaw = body['state'] as string | undefined;
      const result = await service.listSessions(
        {
          ...(stateRaw !== undefined ? { state: stateRaw as SessionState } : {}),
        },
        (body['limit'] as number) ?? 10,
        (body['offset'] as number) ?? 0,
        ctx
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * record-attempt — Record a card review attempt within an active session.
 * P0 tool — the most critical MCP tool. Publishes attempt.recorded event.
 */
export function createRecordAttemptHandler(service: SessionService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const ctx = buildContext(userId, correlationId);
      const body = input as Record<string, unknown>;
      const sessionId = body['sessionId'] as string;
      if (!sessionId) {
        return {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'sessionId is required' },
          agentHints: createEmptyAgentHints(),
        };
      }
      const result = await service.recordAttempt(sessionId, input, ctx);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * get-attempt-history — Get attempt history for a session.
 * P0 tool used by metacognition and strategy agents.
 */
export function createGetAttemptHistoryHandler(service: SessionService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const ctx = buildContext(userId, correlationId);
      const body = input as Record<string, unknown>;
      const sessionId = body['sessionId'] as string;
      if (!sessionId) {
        return {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'sessionId is required' },
          agentHints: createEmptyAgentHints(),
        };
      }
      const result = await service.listAttempts(
        sessionId,
        (body['limit'] as number) ?? 50,
        (body['offset'] as number) ?? 0,
        ctx
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * get-thinking-trace — Retrieve trace metadata for an attempt.
 */
export function createGetThinkingTraceHandler(service: SessionService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const ctx = buildContext(userId, correlationId);
      const body = input as Record<string, unknown>;
      const attemptId = body['attemptId'] as string;
      if (!attemptId) {
        return {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'attemptId is required' },
          agentHints: createEmptyAgentHints(),
        };
      }
      const result = await service.getThinkingTrace(attemptId, ctx);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * record-dialogue-turn — Record a dialogue turn and update session activity.
 */
export function createRecordDialogueTurnHandler(service: SessionService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const ctx = buildContext(userId, correlationId);
      const body = input as Record<string, unknown>;
      const sessionId = body['sessionId'] as string;
      if (!sessionId) {
        return {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'sessionId is required' },
          agentHints: createEmptyAgentHints(),
        };
      }
      const result = await service.recordDialogueTurn(sessionId, input, ctx);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

export function createValidateSessionBlueprintHandler(service: SessionService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const ctx = buildContext(userId, correlationId);
      const result = await service.validateSessionBlueprint(input, ctx);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

export function createEvaluateSessionCheckpointHandler(service: SessionService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const ctx = buildContext(userId, correlationId);
      const body = input as Record<string, unknown>;
      const sessionId = body['sessionId'] as string;
      if (!sessionId) {
        return {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'sessionId is required' },
          agentHints: createEmptyAgentHints(),
        };
      }
      const result = await service.evaluateAdaptiveCheckpoint(sessionId, input, ctx);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const SESSION_TOOL_DEFINITIONS: IToolDefinition[] = [
  {
    name: 'get-session-history',
    description: 'Get session history for the current user, optionally filtered by state',
    service: 'session-service',
    priority: 'P2',
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', description: 'Filter by session state' },
        limit: { type: 'number', description: 'Max results (default 10)', default: 10 },
        offset: { type: 'number', description: 'Offset for pagination', default: 0 },
      },
    },
  },
  {
    name: 'record-attempt',
    description:
      'Record a card review attempt. The most critical MCP tool — publishes attempt.recorded event consumed by scheduler, metacognition, gamification, and analytics.',
    service: 'session-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: [
        'sessionId',
        'cardId',
        'outcome',
        'rating',
        'ratingValue',
        'responseTimeMs',
        'dwellTimeMs',
        'wasRevisedBeforeCommit',
        'hintDepthReached',
        'contextSnapshot',
      ],
      properties: {
        sessionId: { type: 'string', description: 'Active session ID' },
        cardId: { type: 'string', description: 'Card ID being reviewed' },
        outcome: {
          type: 'string',
          enum: ['correct', 'incorrect', 'partial', 'timeout', 'skipped'],
        },
        rating: { type: 'string', enum: ['again', 'hard', 'good', 'easy'] },
        ratingValue: { type: 'number', minimum: 1, maximum: 4 },
        responseTimeMs: { type: 'number', minimum: 0 },
        dwellTimeMs: { type: 'number', minimum: 0 },
        timeToFirstInteractionMs: { type: 'number', minimum: 0 },
        confidenceBefore: { type: 'number', minimum: 0, maximum: 1 },
        confidenceAfter: { type: 'number', minimum: 0, maximum: 1 },
        wasRevisedBeforeCommit: { type: 'boolean' },
        revisionCount: { type: 'number', minimum: 0 },
        hintRequestCount: { type: 'number', minimum: 0 },
        hintDepthReached: { type: 'string', enum: ['none', 'cue', 'partial', 'full_explanation'] },
        contextSnapshot: { type: 'object', description: 'Attempt context snapshot' },
        priorSchedulingState: { type: 'object', description: 'Prior scheduling state' },
      },
    },
  },
  {
    name: 'get-attempt-history',
    description: 'Get attempt history for a session, ordered by sequence number',
    service: 'session-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['sessionId'],
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
        limit: { type: 'number', description: 'Max results (default 50)', default: 50 },
        offset: { type: 'number', description: 'Offset for pagination', default: 0 },
      },
    },
  },
  {
    name: 'get-thinking-trace',
    description: 'Get trace metadata for an attempt when available.',
    service: 'session-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['attemptId'],
      properties: {
        attemptId: { type: 'string', description: 'Attempt ID to get trace for' },
      },
    },
  },
  {
    name: 'record-dialogue-turn',
    description: 'Record an agent-learner dialogue turn within a session.',
    service: 'session-service',
    priority: 'P1',
    inputSchema: {
      type: 'object',
      required: ['sessionId', 'role', 'content'],
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
        role: { type: 'string', enum: ['agent', 'learner'], description: 'Who sent the message' },
        content: { type: 'string', description: 'Message content' },
        turnType: {
          type: 'string',
          description: 'Type of turn (hint, explanation, question, etc.)',
        },
      },
    },
  },
  {
    name: 'validate-session-blueprint',
    description: 'Validate an agent-orchestrated session blueprint before calling start-session.',
    service: 'session-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['blueprint'],
      properties: {
        blueprint: { type: 'object' },
      },
    },
  },
  {
    name: 'evaluate-session-checkpoint',
    description: 'Evaluate event-driven adaptive checkpoint signals and return directives.',
    service: 'session-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['sessionId', 'trigger'],
      properties: {
        sessionId: { type: 'string' },
        trigger: {
          type: 'string',
          enum: ['confidence_drift', 'latency_spike', 'error_cascade', 'streak_break', 'manual'],
        },
        lastAttemptResponseTimeMs: { type: 'number' },
        rollingAverageResponseTimeMs: { type: 'number' },
        recentIncorrectStreak: { type: 'number' },
        confidenceDrift: { type: 'number' },
      },
    },
  },
];

// ============================================================================
// Handler Map Factory
// ============================================================================

export function createSessionToolHandlers(
  service: SessionService
): Map<string, (input: unknown, userId: string, correlationId: string) => Promise<IToolResult>> {
  const handlers = new Map<
    string,
    (input: unknown, userId: string, correlationId: string) => Promise<IToolResult>
  >();
  handlers.set('get-session-history', createGetSessionHistoryHandler(service));
  handlers.set('record-attempt', createRecordAttemptHandler(service));
  handlers.set('get-attempt-history', createGetAttemptHistoryHandler(service));
  handlers.set('get-thinking-trace', createGetThinkingTraceHandler(service));
  handlers.set('record-dialogue-turn', createRecordDialogueTurnHandler(service));
  handlers.set('validate-session-blueprint', createValidateSessionBlueprintHandler(service));
  handlers.set('evaluate-session-checkpoint', createEvaluateSessionCheckpointHandler(service));
  return handlers;
}
