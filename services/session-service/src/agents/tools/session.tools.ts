/**
 * @noema/session-service - Session MCP Tools
 *
 * 5 MCP tools registered per AGENT_MCP_TOOL_REGISTRY.md:
 * - get-session-history (P2)
 * - record-attempt (P0)
 * - get-attempt-history (P0)
 * - get-thinking-trace (P0) — DEFERRED: returns stub until Phase 3+
 * - record-dialogue-turn (P1) — placeholder for future dialogue tracking
 */

import type { CorrelationId, UserId } from '@noema/types';
import type { SessionService } from '../../domain/session-service/session.service.js';
import type { SessionState } from '../../types/index.js';
import type { IToolDefinition, IToolHandlerResult, ToolHandler } from './tool.types.js';

// ============================================================================
// Tool Handler Factories
// ============================================================================

function errorResult(error: unknown): IToolHandlerResult {
  const message = error instanceof Error ? error.message : String(error);
  return { success: false, data: null, error: message };
}

/**
 * get-session-history: Get session history for a user.
 */
function createGetSessionHistoryHandler(service: SessionService): ToolHandler {
  return async (input, userId, correlationId) => {
    try {
      const stateRaw = input['state'] as string | undefined;
      const result = await service.listSessions(
        {
          ...(stateRaw !== undefined ? { state: stateRaw as SessionState } : {}),
        },
        (input['limit'] as number) ?? 10,
        (input['offset'] as number) ?? 0,
        { userId: userId as UserId, correlationId: correlationId as CorrelationId },
      );
      return { success: true, data: result.data, error: null };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * record-attempt: Record a card review attempt within an active session.
 */
function createRecordAttemptHandler(service: SessionService): ToolHandler {
  return async (input, userId, correlationId) => {
    try {
      const sessionId = input['sessionId'] as string;
      if (!sessionId) {
        return { success: false, data: null, error: 'sessionId is required' };
      }
      const result = await service.recordAttempt(sessionId, input, {
        userId: userId as UserId,
        correlationId: correlationId as CorrelationId,
      });
      return { success: true, data: result.data, error: null };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * get-attempt-history: Get attempt history for a session.
 */
function createGetAttemptHistoryHandler(service: SessionService): ToolHandler {
  return async (input, userId, correlationId) => {
    try {
      const sessionId = input['sessionId'] as string;
      if (!sessionId) {
        return { success: false, data: null, error: 'sessionId is required' };
      }
      const result = await service.listAttempts(
        sessionId,
        (input['limit'] as number) ?? 50,
        (input['offset'] as number) ?? 0,
        { userId: userId as UserId, correlationId: correlationId as CorrelationId },
      );
      return { success: true, data: result.data, error: null };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * get-thinking-trace: DEFERRED to Phase 3+.
 *
 * This tool will eventually return the 7-frame cognitive stack trace
 * for an attempt (Perception → Encoding → Retrieval → Evaluation →
 * Metacognition → Response → Scheduling). Currently returns a stub.
 */
function createGetThinkingTraceHandler(_service: SessionService): ToolHandler {
  return async (input, _userId, _correlationId) => {
    const attemptId = input['attemptId'] as string;
    return {
      success: true,
      data: {
        attemptId,
        status: 'deferred',
        message:
          'Thinking traces (7-frame cognitive stack) are planned for Phase 3+. ' +
          'The trace will cover: Perception → Encoding → Retrieval → Evaluation → ' +
          'Metacognition → Response → Scheduling.',
        frames: [],
      },
      error: null,
    };
  };
}

/**
 * record-dialogue-turn: Placeholder for future dialogue tracking.
 *
 * Will track agent ↔ learner dialogue turns within a session.
 */
function createRecordDialogueTurnHandler(_service: SessionService): ToolHandler {
  return async (input, _userId, _correlationId) => {
    const sessionId = input['sessionId'] as string;
    return {
      success: true,
      data: {
        sessionId,
        status: 'acknowledged',
        message:
          'Dialogue turn recording is a Phase 2+ feature. Turn acknowledged but not persisted.',
      },
      error: null,
    };
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
    description:
      'Get the 7-frame cognitive stack trace for an attempt. DEFERRED: returns stub until Phase 3+.',
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
    description:
      'Record an agent-learner dialogue turn within a session. Placeholder for Phase 2+.',
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
];

// ============================================================================
// Handler Map Factory
// ============================================================================

export function createSessionToolHandlers(service: SessionService): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  handlers.set('get-session-history', createGetSessionHistoryHandler(service));
  handlers.set('record-attempt', createRecordAttemptHandler(service));
  handlers.set('get-attempt-history', createGetAttemptHistoryHandler(service));
  handlers.set('get-thinking-trace', createGetThinkingTraceHandler(service));
  handlers.set('record-dialogue-turn', createRecordDialogueTurnHandler(service));
  return handlers;
}
