/**
 * @noema/session-service - Session Service
 *
 * Domain service implementing all session lifecycle, attempt recording,
 * queue management, and strategy/teaching change business logic.
 *
 * Follows the SERVICE_CLASS_SPECIFICATION pattern from user-service.
 */

import type { IAgentHints, ISuggestedAction } from '@noema/contracts';
import { createEmptyAgentHints } from '@noema/contracts';
import type {
  IAttemptContextSnapshot,
  IAttemptHintRequestedPayload,
  IAttemptRecordedPayload,
  IPriorSchedulingState,
  ISessionAbandonedPayload,
  ISessionCompletedPayload,
  ISessionExpiredPayload,
  ISessionPausedPayload,
  ISessionQueueInjectedPayload,
  ISessionQueueRemovedPayload,
  ISessionResumedPayload,
  ISessionStartedPayload,
  ISessionStrategyUpdatedPayload,
  ISessionTeachingChangedPayload,
} from '@noema/events';
import type {
  AttemptId,
  AttemptOutcome,
  CardId,
  CardQueueStatus,
  CardType,
  CategoryId,
  CorrelationId,
  DeckQueryLogId,
  ForceLevel,
  HintDepth,
  LearningMode,
  LoadoutArchetype,
  LoadoutId,
  Rating,
  RemediationCardType,
  SchedulingAlgorithm,
  SessionId,
  TeachingApproach,
  UserId,
} from '@noema/types';
import { ID_PREFIXES, SessionTerminationReason } from '@noema/types';
import { decodeProtectedHeader, jwtVerify, SignJWT } from 'jose';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import type { Prisma } from '../../../generated/prisma/index.js';

import type {
  AdaptiveCheckpointSignal,
  IAttempt,
  IEvaluateAdaptiveCheckpointInput,
  IEvaluateAdaptiveCheckpointResult,
  ISession,
  ISessionFilters,
  ISessionQueueItem,
  ISessionStats,
  IValidateSessionBlueprintResult,
  SessionState,
} from '../../types/index.js';
import { createEmptyStats, SessionState as States } from '../../types/index.js';
import type { IEventPublisher } from '../shared/event-publisher.js';
import {
  AttemptNotFoundError,
  AuthorizationError,
  BusinessRuleError,
  InvalidSessionStateError,
  OutboxDispatchError,
  QueueError,
  SessionNotFoundError,
  ValidationError,
} from './errors/index.js';
import type { IOutboxEventInput, IOutboxRepository } from './outbox.repository.js';
import type { ISessionRepository } from './session.repository.js';
import {
  ChangeTeachingInputSchema,
  EvaluateAdaptiveCheckpointInputSchema,
  InjectQueueInputSchema,
  IssueOfflineIntentTokenInputSchema,
  RecordAttemptInputSchema,
  RecordDialogueTurnInputSchema,
  RemoveQueueInputSchema,
  RequestHintInputSchema,
  StartSessionInputSchema,
  UpdateStrategyInputSchema,
  ValidateSessionBlueprintInputSchema,
  VerifyOfflineIntentTokenInputSchema,
} from './session.schemas.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Execution context for service operations.
 */
export interface IExecutionContext {
  /** Current user ID */
  userId: UserId;
  /** Request correlation ID */
  correlationId: CorrelationId;
  /** Client IP for audit */
  clientIp?: string;
  /** User agent */
  userAgent?: string;
}

/**
 * Service result wrapper.
 */
export interface IServiceResult<T> {
  /** Result data */
  data: T;
  /** Agent hints for next actions */
  agentHints: IAgentHints;
}

export interface ISessionServiceSecurityConfig {
  verifyOfflineIntentTokens: boolean;
  offlineIntentTokenActiveKeyId: string;
  offlineIntentTokenKeys: Record<string, string>;
  offlineIntentTokenIssuer: string;
  offlineIntentTokenAudience: string;
}

export interface ISessionServiceOptions {
  security: ISessionServiceSecurityConfig;
  session: {
    maxConcurrentSessions: number;
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a well-formed IAgentHints from a list of action names and reasoning.
 */
function buildHints(
  actions: Array<{ action: string; description: string; priority?: ISuggestedAction['priority'] }>,
  reasoning?: string
): IAgentHints {
  return {
    ...createEmptyAgentHints(),
    suggestedNextActions: actions.map((a) => ({
      action: a.action,
      description: a.description,
      priority: a.priority ?? 'medium',
    })),
    confidence: 1.0,
    sourceQuality: 'high',
    validityPeriod: 'short',
    ...(reasoning !== undefined ? { reasoning } : {}),
  };
}

// ============================================================================
// Session Service
// ============================================================================

export interface IOfflineIntentTokenInput {
  userId: UserId;
  sessionBlueprint: unknown;
  expiresInSeconds: number;
}

export interface IOfflineIntentToken {
  token: string;
  expiresAt: string;
}

export interface IOfflineIntentTokenClaims {
  tokenVersion: 'v1';
  userId: UserId;
  sessionBlueprint: {
    checkpointSignals?: AdaptiveCheckpointSignal[];
  };
  issuedAt: string;
  expiresAt: string;
  nonce: string;
}

export interface IVerifyOfflineIntentTokenResult {
  valid: boolean;
  userId?: UserId;
  expiresAt?: string;
  checkpointSignals?: AdaptiveCheckpointSignal[];
  reason?: string;
}

export class SessionService {
  private readonly logger: Logger;
  private readonly options: ISessionServiceOptions;
  private readonly activeTokenKeyId: string;
  private readonly tokenSecrets: Map<string, Uint8Array>;

  constructor(
    private readonly repository: ISessionRepository,
    private readonly eventPublisher: IEventPublisher,
    private readonly outboxRepository: IOutboxRepository,
    private readonly prisma: import('../../../generated/prisma/index.js').PrismaClient,
    logger: Logger,
    options?: Partial<ISessionServiceOptions>
  ) {
    this.logger = logger.child({ component: 'SessionService' });
    this.options = {
      security: {
        verifyOfflineIntentTokens: options?.security?.verifyOfflineIntentTokens ?? false,
        offlineIntentTokenActiveKeyId:
          options?.security?.offlineIntentTokenActiveKeyId ?? 'default',
        offlineIntentTokenKeys: options?.security?.offlineIntentTokenKeys ?? {},
        offlineIntentTokenIssuer: options?.security?.offlineIntentTokenIssuer ?? 'noema.session',
        offlineIntentTokenAudience: options?.security?.offlineIntentTokenAudience ?? 'noema.mobile',
      },
      session: {
        maxConcurrentSessions: Math.max(1, options?.session?.maxConcurrentSessions ?? 1),
      },
    };
    this.activeTokenKeyId = this.options.security.offlineIntentTokenActiveKeyId;
    this.tokenSecrets = new Map(
      Object.entries(this.options.security.offlineIntentTokenKeys).map(([keyId, secret]) => [
        keyId,
        new TextEncoder().encode(secret),
      ])
    );
  }

  // ==========================================================================
  // Session Lifecycle
  // ==========================================================================

  /**
   * Start a new study session.
   *
   * Creates the session record,
   * populates the queue, and publishes session.started.
   */
  async startSession(input: unknown, ctx: IExecutionContext): Promise<IServiceResult<ISession>> {
    const parsed = StartSessionInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError('Invalid start session input', parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data;

    await this.verifyOfflineIntentToken(data.offlineIntentToken, ctx);

    if (data.blueprint !== undefined) {
      const consistency = this.validateBlueprintConsistency(
        data.blueprint.initialCardIds,
        data.initialCardIds
      );
      if (!consistency.valid) {
        throw new ValidationError('Invalid session blueprint', {
          blueprint: consistency.errors,
        });
      }
    }

    const sessionId = `${ID_PREFIXES.SessionId}${nanoid()}` as SessionId;
    const now = new Date().toISOString();

    const sessionInput = {
      id: sessionId,
      userId: ctx.userId,
      deckQueryId: data.deckQueryId as DeckQueryLogId,
      state: States.ACTIVE,
      learningMode: data.learningMode as LearningMode,
      teachingApproach: (data.teachingApproach ?? 'socratic_questioning') as TeachingApproach,
      schedulingAlgorithm: (data.schedulingAlgorithm ?? 'fsrs') as SchedulingAlgorithm,
      loadoutId: (data.loadoutId as LoadoutId) ?? null,
      loadoutArchetype: (data.loadoutArchetype as LoadoutArchetype) ?? null,
      forceLevel: null,
      config: {
        sessionTimeoutHours: data.config.sessionTimeoutHours ?? 24,
        ...(data.config.maxCards !== undefined ? { maxCards: data.config.maxCards } : {}),
        ...(data.config.maxDurationMinutes !== undefined
          ? { maxDurationMinutes: data.config.maxDurationMinutes }
          : {}),
        ...(data.config.categoryIds !== undefined ? { categoryIds: data.config.categoryIds } : {}),
        ...(data.config.cardTypes !== undefined ? { cardTypes: data.config.cardTypes } : {}),
      },
      stats: createEmptyStats(),
      initialQueueSize: data.initialCardIds.length,
      pauseCount: 0,
      totalPausedDurationMs: 0,
      lastPausedAt: null,
      startedAt: now,
      lastActivityAt: now,
      completedAt: null,
      terminationReason: null,
      version: 1,
    };

    // Populate queue
    const queueItems = data.initialCardIds.map((cardId, idx) => ({
      id: nanoid(),
      sessionId,
      cardId: cardId as CardId,
      position: idx,
      status: 'pending' as CardQueueStatus,
      injectedBy: null,
      reason: null,
    }));
    const session = await this.runInTransaction(async (tx) => {
      const activeSessionCount = await this.repository.countSessionsByUser(
        ctx.userId,
        States.ACTIVE,
        tx
      );

      if (activeSessionCount >= this.options.session.maxConcurrentSessions) {
        throw new BusinessRuleError(
          `User already has ${String(activeSessionCount)} active session(s); max concurrent sessions is ${String(this.options.session.maxConcurrentSessions)}`,
          {
            activeSessionCount,
            maxConcurrentSessions: this.options.session.maxConcurrentSessions,
          }
        );
      }

      const createdSession = await this.repository.createSession(sessionInput, tx);
      await this.repository.createQueueItemsBatch(queueItems, tx);
      await this.publishThroughOutbox(
        {
          id: `${ID_PREFIXES.EventId}${nanoid()}` as import('@noema/types').EventId,
          eventType: 'session.started',
          aggregateType: 'Session',
          aggregateId: sessionId,
          payload: {
            userId: ctx.userId,
            deckQueryId: data.deckQueryId as DeckQueryLogId,
            learningMode: data.learningMode as LearningMode,
            teachingApproach: createdSession.teachingApproach,
            schedulingAlgorithm: createdSession.schedulingAlgorithm,
            ...(data.loadoutId !== undefined ? { loadoutId: data.loadoutId as LoadoutId } : {}),
            ...(data.loadoutArchetype !== undefined
              ? { loadoutArchetype: data.loadoutArchetype as LoadoutArchetype }
              : {}),
            config: {
              sessionTimeoutHours: createdSession.config.sessionTimeoutHours,
              ...(createdSession.config.maxCards !== undefined
                ? { maxCards: createdSession.config.maxCards }
                : {}),
              ...(createdSession.config.maxDurationMinutes !== undefined
                ? { maxDurationMinutes: createdSession.config.maxDurationMinutes }
                : {}),
              ...(createdSession.config.categoryIds !== undefined
                ? { categoryIds: createdSession.config.categoryIds as CategoryId[] }
                : {}),
              ...(createdSession.config.cardTypes !== undefined
                ? {
                    cardTypes: createdSession.config.cardTypes as (
                      | CardType
                      | RemediationCardType
                    )[],
                  }
                : {}),
            },
            initialQueueSize: data.initialCardIds.length,
          } satisfies ISessionStartedPayload,
          metadata: { correlationId: ctx.correlationId, userId: ctx.userId },
        },
        tx
      );
      return createdSession;
    });

    this.logger.info({ sessionId, userId: ctx.userId }, 'Session started');

    return {
      data: session,
      agentHints: buildHints(
        [
          {
            action: 'present_first_card',
            description: 'Present the first card from the queue',
            priority: 'high',
          },
          { action: 'get_queue', description: 'Retrieve the session queue' },
        ],
        `Session started with ${data.initialCardIds.length} cards in ${data.learningMode} mode`
      ),
    };
  }

  async validateSessionBlueprint(
    input: unknown,
    _ctx: IExecutionContext
  ): Promise<IServiceResult<IValidateSessionBlueprintResult>> {
    const parsed = ValidateSessionBlueprintInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid session blueprint input',
        parsed.error.flatten().fieldErrors
      );
    }

    const { blueprint } = parsed.data;
    const normalizedSignals = [
      ...new Set(blueprint.checkpointSignals),
    ] as AdaptiveCheckpointSignal[];
    const laneSum = blueprint.laneMix.retention + blueprint.laneMix.calibration;
    const errors: string[] = [];

    if (Math.abs(laneSum - 1) > 0.0001) {
      errors.push('laneMix.retention + laneMix.calibration must equal 1.0');
    }

    return {
      data: {
        valid: errors.length === 0,
        errors,
        normalizedCheckpointSignals: normalizedSignals,
      },
      agentHints: buildHints(
        [
          {
            action: errors.length === 0 ? 'start_session' : 'fix_blueprint',
            description:
              errors.length === 0
                ? 'Blueprint is valid and can be used to start session'
                : 'Fix invalid blueprint fields before starting session',
            priority: errors.length === 0 ? 'high' : 'critical',
          },
        ],
        errors.length === 0
          ? 'Blueprint validation passed'
          : `Blueprint validation failed with ${errors.length} error(s)`
      ),
    };
  }

  async evaluateAdaptiveCheckpoint(
    sessionId: string,
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IEvaluateAdaptiveCheckpointResult>> {
    const session = await this.getAuthorizedSession(sessionId, ctx);
    this.assertState(session, States.ACTIVE, 'evaluate checkpoint');

    const parsed = EvaluateAdaptiveCheckpointInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid adaptive checkpoint input',
        parsed.error.flatten().fieldErrors
      );
    }

    const data = parsed.data as IEvaluateAdaptiveCheckpointInput;
    const directives: IEvaluateAdaptiveCheckpointResult['directives'] = [];

    if (data.trigger === 'error_cascade' && (data.recentIncorrectStreak ?? 0) >= 2) {
      directives.push({
        action: 'increase_support',
        reason: 'Incorrect streak indicates immediate support escalation',
        priority: 'high',
      });
    }

    if (
      data.trigger === 'latency_spike' &&
      data.lastAttemptResponseTimeMs !== undefined &&
      data.rollingAverageResponseTimeMs !== undefined &&
      data.lastAttemptResponseTimeMs > data.rollingAverageResponseTimeMs * 1.6
    ) {
      directives.push({
        action: 'slowdown',
        reason: 'Response latency spike indicates cognitive overload risk',
        priority: 'medium',
      });
    }

    if (data.trigger === 'confidence_drift' && Math.abs(data.confidenceDrift ?? 0) >= 0.25) {
      directives.push({
        action: 'reduce_calibration_lane',
        reason: 'High confidence drift needs temporary lane rebalance',
        priority: 'high',
      });
    }

    if (directives.length === 0) {
      directives.push({
        action: 'continue',
        reason: 'No adaptive intervention required for current checkpoint signal',
        priority: 'low',
      });
    }

    await this.runInTransaction(async (tx) => {
      await this.publishThroughOutbox(
        {
          id: `${ID_PREFIXES.EventId}${nanoid()}` as import('@noema/types').EventId,
          eventType: 'session.checkpoint.evaluated',
          aggregateType: 'Session',
          aggregateId: session.id,
          payload: {
            trigger: data.trigger,
            shouldAdapt: directives.some((d) => d.action !== 'continue'),
            directives,
          },
          metadata: { correlationId: ctx.correlationId, userId: ctx.userId },
        },
        tx
      );
    });

    return {
      data: {
        shouldAdapt: directives.some((d) => d.action !== 'continue'),
        directives,
        reason: directives.map((d) => d.reason).join('; '),
      },
      agentHints: buildHints(
        directives.map((directive) => ({
          action: directive.action,
          description: directive.reason,
          priority:
            directive.priority === 'critical' || directive.priority === 'high' ? 'high' : 'medium',
        })),
        `Checkpoint evaluated for trigger ${data.trigger}`
      ),
    };
  }

  /**
   * Pause an active session.
   */
  async pauseSession(
    sessionId: string,
    reason: string | undefined,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ISession>> {
    const session = await this.getAuthorizedSession(sessionId, ctx);
    this.assertState(session, States.ACTIVE, 'pause');

    const now = new Date().toISOString();
    const activeDurationMs =
      new Date(now).getTime() -
      new Date(session.startedAt).getTime() -
      session.totalPausedDurationMs;

    const updated = await this.runInTransaction(async (tx) => {
      const next = await this.repository.updateSession(
        session.id,
        {
          state: States.PAUSED,
          pauseCount: session.pauseCount + 1,
          lastPausedAt: now,
          lastActivityAt: now,
        },
        session.version,
        tx
      );

      await this.publishThroughOutbox(
        {
          id: `${ID_PREFIXES.EventId}${nanoid()}` as import('@noema/types').EventId,
          eventType: 'session.paused',
          aggregateType: 'Session',
          aggregateId: session.id,
          payload: {
            userId: ctx.userId,
            pauseCount: next.pauseCount,
            activeDurationMs,
            attemptsCompleted: session.stats.totalAttempts,
            ...(reason !== undefined && { reason }),
          } satisfies ISessionPausedPayload,
          metadata: { correlationId: ctx.correlationId, userId: ctx.userId },
        },
        tx
      );

      return next;
    });

    this.logger.info({ sessionId: session.id }, 'Session paused');

    return {
      data: updated,
      agentHints: buildHints(
        [{ action: 'resume_session', description: 'Resume the paused session', priority: 'high' }],
        `Session paused (pause #${updated.pauseCount})`
      ),
    };
  }

  /**
   * Resume a paused session.
   */
  async resumeSession(
    sessionId: string,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ISession>> {
    const session = await this.getAuthorizedSession(sessionId, ctx);
    this.assertState(session, States.PAUSED, 'resume');

    const now = new Date().toISOString();
    const pausedDurationMs = session.lastPausedAt
      ? new Date(now).getTime() - new Date(session.lastPausedAt).getTime()
      : 0;

    const updated = await this.runInTransaction(async (tx) => {
      const next = await this.repository.updateSession(
        session.id,
        {
          state: States.ACTIVE,
          totalPausedDurationMs: session.totalPausedDurationMs + pausedDurationMs,
          lastPausedAt: null,
          lastActivityAt: now,
        },
        session.version,
        tx
      );

      await this.publishThroughOutbox(
        {
          id: `${ID_PREFIXES.EventId}${nanoid()}` as import('@noema/types').EventId,
          eventType: 'session.resumed',
          aggregateType: 'Session',
          aggregateId: session.id,
          payload: {
            userId: ctx.userId,
            pausedDurationMs,
            totalPauseCount: next.pauseCount,
          } satisfies ISessionResumedPayload,
          metadata: { correlationId: ctx.correlationId, userId: ctx.userId },
        },
        tx
      );

      return next;
    });

    this.logger.info({ sessionId: session.id }, 'Session resumed');

    return {
      data: updated,
      agentHints: buildHints(
        [
          { action: 'present_next_card', description: 'Present the next card', priority: 'high' },
          { action: 'get_queue', description: 'Retrieve the session queue' },
        ],
        `Session resumed after ${Math.round(pausedDurationMs / 1000)}s pause`
      ),
    };
  }

  /**
   * Complete a session (natural completion).
   */
  async completeSession(
    sessionId: string,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ISession>> {
    const session = await this.getAuthorizedSession(sessionId, ctx);
    this.assertActiveOrPaused(session, 'complete');

    const now = new Date().toISOString();
    const totalDurationMs = new Date(now).getTime() - new Date(session.startedAt).getTime();
    const activeDurationMs = totalDurationMs - session.totalPausedDurationMs;

    const updated = await this.runInTransaction(async (tx) => {
      const next = await this.repository.updateSession(
        session.id,
        {
          state: States.COMPLETED,
          completedAt: now,
          lastActivityAt: now,
          terminationReason: SessionTerminationReason.COMPLETED_NORMALLY,
        },
        session.version,
        tx
      );

      await this.publishThroughOutbox(
        {
          id: `${ID_PREFIXES.EventId}${nanoid()}` as import('@noema/types').EventId,
          eventType: 'session.completed',
          aggregateType: 'Session',
          aggregateId: session.id,
          payload: {
            userId: ctx.userId,
            terminationReason: SessionTerminationReason.COMPLETED_NORMALLY,
            stats: session.stats as ISessionCompletedPayload['stats'],
            totalDurationMs,
            activeDurationMs,
          } satisfies ISessionCompletedPayload,
          metadata: { correlationId: ctx.correlationId, userId: ctx.userId },
        },
        tx
      );

      return next;
    });

    this.logger.info({ sessionId: session.id, stats: session.stats }, 'Session completed');

    return {
      data: updated,
      agentHints: buildHints(
        [
          {
            action: 'show_session_summary',
            description: 'Display session completion summary',
            priority: 'high',
          },
          { action: 'start_new_session', description: 'Start a new study session' },
        ],
        `Session completed with ${session.stats.totalAttempts} attempts`
      ),
    };
  }

  /**
   * Abandon a session (user exits early).
   */
  async abandonSession(
    sessionId: string,
    reason: string | undefined,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ISession>> {
    const session = await this.getAuthorizedSession(sessionId, ctx);
    this.assertActiveOrPaused(session, 'abandon');

    const now = new Date().toISOString();
    const activeDurationMs =
      new Date(now).getTime() -
      new Date(session.startedAt).getTime() -
      session.totalPausedDurationMs;
    const cardsRemaining = await this.repository.countPendingQueueItems(session.id);

    const updated = await this.runInTransaction(async (tx) => {
      const next = await this.repository.updateSession(
        session.id,
        {
          state: States.ABANDONED,
          completedAt: now,
          lastActivityAt: now,
          terminationReason: SessionTerminationReason.USER_ENDED,
        },
        session.version,
        tx
      );

      await this.publishThroughOutbox(
        {
          id: `${ID_PREFIXES.EventId}${nanoid()}` as import('@noema/types').EventId,
          eventType: 'session.abandoned',
          aggregateType: 'Session',
          aggregateId: session.id,
          payload: {
            userId: ctx.userId,
            stats: session.stats as ISessionAbandonedPayload['stats'],
            activeDurationMs,
            cardsRemaining,
            ...(reason !== undefined && { reason }),
          } satisfies ISessionAbandonedPayload,
          metadata: { correlationId: ctx.correlationId, userId: ctx.userId },
        },
        tx
      );

      return next;
    });

    this.logger.info({ sessionId: session.id, cardsRemaining }, 'Session abandoned');

    return {
      data: updated,
      agentHints: buildHints(
        [
          {
            action: 'show_session_summary',
            description: 'Display session summary',
            priority: 'high',
          },
          { action: 'start_new_session', description: 'Start a new study session' },
        ],
        `Session abandoned with ${cardsRemaining} cards remaining`
      ),
    };
  }

  /**
   * Expire a session (timeout). Called by the expiration job / sidecar.
   */
  async expireSession(
    sessionId: string,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ISession>> {
    const session = await this.getAuthorizedSession(sessionId, ctx);
    this.assertActiveOrPaused(session, 'expire');

    const updated = await this.runInTransaction(async (tx) => {
      const next = await this.repository.updateSession(
        session.id,
        {
          state: States.EXPIRED,
          completedAt: new Date().toISOString(),
          terminationReason: SessionTerminationReason.AUTO_EXPIRED,
        },
        session.version,
        tx
      );

      await this.publishThroughOutbox(
        {
          id: `${ID_PREFIXES.EventId}${nanoid()}` as import('@noema/types').EventId,
          eventType: 'session.expired',
          aggregateType: 'Session',
          aggregateId: session.id,
          payload: {
            userId: session.userId,
            timeoutHours: session.config.sessionTimeoutHours,
            stats: session.stats as ISessionExpiredPayload['stats'],
            lastActivityAt: session.lastActivityAt,
          } satisfies ISessionExpiredPayload,
          metadata: { correlationId: ctx.correlationId, userId: session.userId },
        },
        tx
      );

      return next;
    });

    this.logger.info({ sessionId: session.id }, 'Session expired');

    return {
      data: updated,
      agentHints: buildHints(
        [
          {
            action: 'notify_user',
            description: 'Notify user of session expiration',
            priority: 'high',
          },
          { action: 'start_new_session', description: 'Start a new study session' },
        ],
        `Session expired after ${session.config.sessionTimeoutHours}h of inactivity`
      ),
    };
  }

  // ==========================================================================
  // Session Queries
  // ==========================================================================

  /**
   * Get a session by ID.
   */
  async getSession(sessionId: string, ctx: IExecutionContext): Promise<IServiceResult<ISession>> {
    const session = await this.getAuthorizedSession(sessionId, ctx);

    return {
      data: session,
      agentHints: buildHints(
        this.suggestedActionsForState(session),
        `Session in ${session.state} state`
      ),
    };
  }

  /**
   * List sessions for the current user.
   */
  async listSessions(
    filters: ISessionFilters | undefined,
    limit: number,
    offset: number,
    ctx: IExecutionContext
  ): Promise<IServiceResult<{ sessions: ISession[]; total: number }>> {
    const result = await this.repository.findSessionsByUser(ctx.userId, filters, limit, offset);

    return {
      data: result,
      agentHints: buildHints(
        [{ action: 'start_new_session', description: 'Start a new study session' }],
        `Found ${result.total} sessions`
      ),
    };
  }

  // ==========================================================================
  // Attempt Recording
  // ==========================================================================

  /**
   * Record an attempt (the most critical operation in Noema).
   *
   * Updates session stats, marks queue item as answered,
   * and publishes attempt.recorded.
   */
  async recordAttempt(
    sessionId: string,
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IAttempt>> {
    const parsed = RecordAttemptInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError('Invalid attempt input', parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data;

    const session = await this.getAuthorizedSession(sessionId, ctx);
    this.assertState(session, States.ACTIVE, 'record attempt');

    const sequenceNumber = await this.repository.getNextSequenceNumber(session.id);
    const attemptId = `${ID_PREFIXES.AttemptId}${nanoid()}` as AttemptId;

    // Compute calibration delta if both confidence values provided
    const calibrationDelta =
      data.confidenceBefore != null && data.confidenceAfter != null
        ? data.confidenceAfter - data.confidenceBefore
        : null;

    const attemptInput = {
      id: attemptId,
      sessionId: session.id,
      cardId: data.cardId as CardId,
      userId: ctx.userId,
      sequenceNumber,
      outcome: data.outcome as AttemptOutcome,
      rating: data.rating as Rating,
      ratingValue: data.ratingValue,
      responseTimeMs: data.responseTimeMs,
      dwellTimeMs: data.dwellTimeMs,
      timeToFirstInteractionMs: data.timeToFirstInteractionMs ?? null,
      confidenceBefore: data.confidenceBefore ?? null,
      confidenceAfter: data.confidenceAfter ?? null,
      calibrationDelta,
      wasRevisedBeforeCommit: data.wasRevisedBeforeCommit,
      revisionCount: data.revisionCount ?? 0,
      hintRequestCount: data.hintRequestCount ?? 0,
      hintDepthReached: data.hintDepthReached as HintDepth,
      contextSnapshot:
        data.contextSnapshot as unknown as import('../../types/index.js').IAttemptContext,
      priorSchedulingState:
        (data.priorSchedulingState as unknown as import('../../types/index.js').IPriorScheduling) ??
        null,
      traceId: null,
      diagnosisId: null,
    };

    const attempt = await this.runInTransaction(async (tx) => {
      const createdAttempt = await this.repository.createAttempt(attemptInput, tx);

      const attemptsForCard = await this.repository.findAttemptsByCard(
        session.id,
        data.cardId as CardId
      );
      const isFirstAttemptForCard = attemptsForCard.length === 1;

      const updatedStats = this.computeUpdatedStats(session.stats, {
        outcome: data.outcome,
        rating: data.rating,
        ratingValue: data.ratingValue,
        responseTimeMs: data.responseTimeMs,
        confidenceBefore: data.confidenceBefore ?? undefined,
        confidenceAfter: data.confidenceAfter ?? undefined,
        hintRequestCount: data.hintRequestCount ?? undefined,
        isFirstAttemptForCard,
      });

      await this.repository.updateSession(
        session.id,
        {
          stats: updatedStats,
          lastActivityAt: new Date().toISOString(),
        },
        session.version,
        tx
      );

      try {
        await this.repository.markQueueItemAnswered(session.id, data.cardId as CardId, tx);
      } catch {
        this.logger.debug(
          { sessionId: session.id, cardId: data.cardId },
          'Queue item not found for marking'
        );
      }

      await this.publishThroughOutbox(
        {
          id: `${ID_PREFIXES.EventId}${nanoid()}` as import('@noema/types').EventId,
          eventType: 'attempt.recorded',
          aggregateType: 'Attempt',
          aggregateId: attemptId,
          payload: {
            attemptId,
            sessionId: session.id,
            cardId: data.cardId as CardId,
            userId: ctx.userId,
            sequenceNumber,
            outcome: data.outcome as AttemptOutcome,
            rating: data.rating as Rating,
            ratingValue: data.ratingValue,
            responseTimeMs: data.responseTimeMs,
            dwellTimeMs: data.dwellTimeMs,
            wasRevisedBeforeCommit: data.wasRevisedBeforeCommit,
            revisionCount: data.revisionCount ?? 0,
            hintRequestCount: data.hintRequestCount ?? 0,
            hintDepthReached: data.hintDepthReached as HintDepth,
            contextSnapshot: data.contextSnapshot as unknown as IAttemptContextSnapshot,
            ...(data.timeToFirstInteractionMs !== undefined && {
              timeToFirstInteractionMs: data.timeToFirstInteractionMs,
            }),
            ...(data.confidenceBefore !== undefined && { confidenceBefore: data.confidenceBefore }),
            ...(data.confidenceAfter !== undefined && { confidenceAfter: data.confidenceAfter }),
            ...(calibrationDelta !== null && { calibrationDelta }),
            ...(data.priorSchedulingState !== undefined && {
              priorSchedulingState: data.priorSchedulingState as unknown as IPriorSchedulingState,
            }),
          } satisfies IAttemptRecordedPayload,
          metadata: { correlationId: ctx.correlationId, userId: ctx.userId },
        },
        tx
      );

      return createdAttempt;
    });

    this.logger.info(
      { attemptId, sessionId: session.id, cardId: data.cardId, rating: data.rating },
      'Attempt recorded'
    );

    return {
      data: attempt,
      agentHints: buildHints(
        [
          { action: 'present_next_card', description: 'Present the next card', priority: 'high' },
          { action: 'check_queue_remaining', description: 'Check how many cards remain in queue' },
        ],
        `Attempt #${sequenceNumber} recorded: ${data.outcome} (${data.rating})`
      ),
    };
  }

  /**
   * Request a hint during an active attempt.
   */
  async requestHint(
    sessionId: string,
    attemptId: string,
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<{ acknowledged: boolean }>> {
    const parsed = RequestHintInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError('Invalid hint request input', parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data;

    const session = await this.getAuthorizedSession(sessionId, ctx);
    this.assertState(session, States.ACTIVE, 'request hint');

    const attempt = await this.repository.findAttemptById(attemptId as AttemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(attemptId);
    }
    if (attempt.sessionId !== session.id) {
      throw new ValidationError('Attempt does not belong to this session', {
        attemptId: ['Attempt session mismatch'],
      });
    }
    if (data.cardId !== undefined && attempt.cardId !== (data.cardId as CardId)) {
      throw new ValidationError('Attempt card does not match provided cardId', {
        cardId: ['Provided cardId does not match attempt.cardId'],
      });
    }

    const payload: IAttemptHintRequestedPayload = {
      attemptId: attemptId as AttemptId,
      sessionId: session.id,
      cardId: attempt.cardId,
      userId: ctx.userId,
      hintDepth: data.hintDepth as HintDepth,
      hintRequestNumber: data.hintRequestNumber,
      responseTimeMsAtRequest: data.responseTimeMsAtRequest,
    };

    await this.runInTransaction(async (tx) => {
      await this.publishThroughOutbox(
        {
          id: `${ID_PREFIXES.EventId}${nanoid()}` as import('@noema/types').EventId,
          eventType: 'attempt.hint.requested',
          aggregateType: 'Attempt',
          aggregateId: attemptId,
          payload,
          metadata: { correlationId: ctx.correlationId, userId: ctx.userId },
        },
        tx
      );
    });

    this.logger.debug(
      { sessionId: session.id, attemptId, hintDepth: data.hintDepth },
      'Hint requested'
    );

    return {
      data: { acknowledged: true },
      agentHints: buildHints(
        [
          {
            action: 'provide_hint',
            description: 'Generate and provide the hint to the user',
            priority: 'high',
          },
        ],
        `Hint depth ${data.hintDepth} requested (hint #${data.hintRequestNumber})`
      ),
    };
  }

  async getThinkingTrace(
    attemptId: string,
    ctx: IExecutionContext
  ): Promise<
    IServiceResult<{
      attemptId: string;
      traceId: string | null;
      diagnosisId: string | null;
      status: 'available' | 'not_available';
      frames: unknown[];
    }>
  > {
    const attempt = await this.repository.findAttemptById(attemptId as AttemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(attemptId);
    }
    await this.getAuthorizedSession(attempt.sessionId, ctx);

    const hasTrace = attempt.traceId !== null;
    return {
      data: {
        attemptId: attempt.id,
        traceId: attempt.traceId,
        diagnosisId: attempt.diagnosisId,
        status: hasTrace ? 'available' : 'not_available',
        frames: [],
      },
      agentHints: buildHints(
        [
          {
            action: hasTrace ? 'inspect_trace' : 'record_attempt',
            description: hasTrace
              ? 'Inspect the available trace identifiers for this attempt'
              : 'Trace is not yet attached to this attempt; continue session flow',
            priority: 'medium',
          },
        ],
        hasTrace ? 'Attempt has trace metadata' : 'Attempt currently has no trace metadata'
      ),
    };
  }

  async recordDialogueTurn(
    sessionId: string,
    input: unknown,
    ctx: IExecutionContext
  ): Promise<
    IServiceResult<{
      acknowledged: boolean;
      sessionId: string;
      recordedAt: string;
      role: 'agent' | 'learner';
      turnType: string | null;
    }>
  > {
    const parsed = RecordDialogueTurnInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError('Invalid dialogue turn input', parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data;

    const session = await this.getAuthorizedSession(sessionId, ctx);
    this.assertActiveOrPaused(session, 'record dialogue turn');

    const recordedAt = new Date().toISOString();
    await this.runInTransaction(async (tx) => {
      await this.repository.updateSession(
        session.id,
        {
          lastActivityAt: recordedAt,
        },
        session.version,
        tx
      );
    });

    this.logger.debug(
      {
        sessionId: session.id,
        userId: ctx.userId,
        role: data.role,
        turnType: data.turnType ?? null,
      },
      'Dialogue turn recorded'
    );

    return {
      data: {
        acknowledged: true,
        sessionId: session.id,
        recordedAt,
        role: data.role,
        turnType: data.turnType ?? null,
      },
      agentHints: buildHints(
        [
          {
            action: 'continue_session',
            description: 'Continue the active tutoring interaction',
            priority: 'high',
          },
        ],
        `Dialogue turn recorded from ${data.role}`
      ),
    };
  }

  /**
   * Get attempts for a session.
   */
  async listAttempts(
    sessionId: string,
    limit: number,
    offset: number,
    ctx: IExecutionContext
  ): Promise<IServiceResult<{ attempts: IAttempt[]; total: number }>> {
    const session = await this.getAuthorizedSession(sessionId, ctx);
    const result = await this.repository.findAttemptsBySession(session.id, limit, offset);

    return {
      data: result,
      agentHints: buildHints(
        [{ action: 'analyze_attempts', description: 'Analyze attempt patterns and performance' }],
        `Found ${result.total} attempts in session`
      ),
    };
  }

  // ==========================================================================
  // Queue Management
  // ==========================================================================

  /**
   * Get the current queue for a session.
   */
  async getQueue(
    sessionId: string,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ISessionQueueItem[]>> {
    const session = await this.getAuthorizedSession(sessionId, ctx);
    const items = await this.repository.getQueueItems(session.id);

    return {
      data: items,
      agentHints: buildHints(
        [
          {
            action: 'present_next_card',
            description: 'Present the next pending card',
            priority: 'high',
          },
        ],
        `Queue has ${items.filter((i) => i.status === 'pending').length} pending items`
      ),
    };
  }

  /**
   * Inject a card into the queue at a specific position.
   */
  async injectQueueItem(
    sessionId: string,
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ISessionQueueItem>> {
    const parsed = InjectQueueInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError('Invalid inject queue input', parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data;

    const session = await this.getAuthorizedSession(sessionId, ctx);
    this.assertActiveOrPaused(session, 'inject queue item');

    // Check if card already in queue
    const existingItem = await this.repository.findQueueItemByCard(
      session.id,
      data.cardId as CardId
    );
    if (existingItem) {
      throw new QueueError(`Card ${data.cardId} is already in the session queue`);
    }

    const item = await this.runInTransaction(async (tx) => {
      const injected = await this.repository.injectQueueItem(
        {
          id: nanoid(),
          sessionId: session.id,
          cardId: data.cardId as CardId,
          position: data.position,
          status: 'pending' as CardQueueStatus,
          injectedBy: data.injectedBy ?? 'user',
          reason: data.reason,
        },
        tx
      );

      await this.publishThroughOutbox(
        {
          id: `${ID_PREFIXES.EventId}${nanoid()}` as import('@noema/types').EventId,
          eventType: 'session.queue.injected',
          aggregateType: 'Session',
          aggregateId: session.id,
          payload: {
            userId: ctx.userId,
            cardId: data.cardId as CardId,
            position: data.position,
            reason: data.reason,
            injectedBy: data.injectedBy ?? 'user',
          } satisfies ISessionQueueInjectedPayload,
          metadata: { correlationId: ctx.correlationId, userId: ctx.userId },
        },
        tx
      );

      return injected;
    });

    this.logger.info(
      { sessionId: session.id, cardId: data.cardId, position: data.position },
      'Queue item injected'
    );

    return {
      data: item,
      agentHints: buildHints(
        [{ action: 'get_queue', description: 'Retrieve the updated session queue' }],
        `Card injected at position ${data.position}`
      ),
    };
  }

  /**
   * Remove a card from the queue.
   */
  async removeQueueItem(
    sessionId: string,
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<{ removed: boolean }>> {
    const parsed = RemoveQueueInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError('Invalid remove queue input', parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data;

    const session = await this.getAuthorizedSession(sessionId, ctx);
    this.assertActiveOrPaused(session, 'remove queue item');

    const existingItem = await this.repository.findQueueItemByCard(
      session.id,
      data.cardId as CardId
    );
    if (!existingItem) {
      throw new QueueError(`Card ${data.cardId} is not in the session queue`);
    }

    await this.runInTransaction(async (tx) => {
      await this.repository.removeQueueItem(session.id, data.cardId as CardId, tx);

      await this.publishThroughOutbox(
        {
          id: `${ID_PREFIXES.EventId}${nanoid()}` as import('@noema/types').EventId,
          eventType: 'session.queue.removed',
          aggregateType: 'Session',
          aggregateId: session.id,
          payload: {
            userId: ctx.userId,
            cardId: data.cardId as CardId,
            reason: data.reason,
            removedBy: data.removedBy ?? 'user',
          } satisfies ISessionQueueRemovedPayload,
          metadata: { correlationId: ctx.correlationId, userId: ctx.userId },
        },
        tx
      );
    });

    this.logger.info({ sessionId: session.id, cardId: data.cardId }, 'Queue item removed');

    return {
      data: { removed: true },
      agentHints: buildHints(
        [{ action: 'get_queue', description: 'Retrieve the updated session queue' }],
        `Card removed from queue: ${data.reason}`
      ),
    };
  }

  // ==========================================================================
  // Strategy & Teaching
  // ==========================================================================

  /**
   * Update the active strategy (loadout, archetype, force level).
   */
  async updateStrategy(
    sessionId: string,
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ISession>> {
    const parsed = UpdateStrategyInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid strategy update input',
        parsed.error.flatten().fieldErrors
      );
    }
    const data = parsed.data;

    const session = await this.getAuthorizedSession(sessionId, ctx);
    this.assertActiveOrPaused(session, 'update strategy');

    const previousLoadoutId = session.loadoutId;

    const updated = await this.runInTransaction(async (tx) => {
      const next = await this.repository.updateSession(
        session.id,
        {
          loadoutId: data.newLoadoutId as LoadoutId,
          loadoutArchetype: data.newLoadoutArchetype as LoadoutArchetype,
          forceLevel: data.newForceLevel as ForceLevel,
          lastActivityAt: new Date().toISOString(),
        },
        session.version,
        tx
      );

      await this.publishThroughOutbox(
        {
          id: `${ID_PREFIXES.EventId}${nanoid()}` as import('@noema/types').EventId,
          eventType: 'session.strategy.updated',
          aggregateType: 'Session',
          aggregateId: session.id,
          payload: {
            userId: ctx.userId,
            newLoadoutId: data.newLoadoutId as LoadoutId,
            newLoadoutArchetype: data.newLoadoutArchetype as LoadoutArchetype,
            newForceLevel: data.newForceLevel as ForceLevel,
            trigger: data.trigger,
            ...(previousLoadoutId !== null && { previousLoadoutId }),
          } satisfies ISessionStrategyUpdatedPayload,
          metadata: { correlationId: ctx.correlationId, userId: ctx.userId },
        },
        tx
      );

      return next;
    });

    this.logger.info(
      { sessionId: session.id, archetype: data.newLoadoutArchetype },
      'Session strategy updated'
    );

    return {
      data: updated,
      agentHints: buildHints(
        [
          {
            action: 'continue_session',
            description: 'Continue the session with updated strategy',
            priority: 'high',
          },
        ],
        `Strategy updated to ${data.newLoadoutArchetype} (${data.trigger})`
      ),
    };
  }

  /**
   * Change the teaching approach mid-session.
   */
  async changeTeaching(
    sessionId: string,
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ISession>> {
    const parsed = ChangeTeachingInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid teaching change input',
        parsed.error.flatten().fieldErrors
      );
    }
    const data = parsed.data;

    const session = await this.getAuthorizedSession(sessionId, ctx);
    this.assertActiveOrPaused(session, 'change teaching');

    const previousApproach = session.teachingApproach;

    const updated = await this.runInTransaction(async (tx) => {
      const next = await this.repository.updateSession(
        session.id,
        {
          teachingApproach: data.newApproach as TeachingApproach,
          lastActivityAt: new Date().toISOString(),
        },
        session.version,
        tx
      );

      await this.publishThroughOutbox(
        {
          id: `${ID_PREFIXES.EventId}${nanoid()}` as import('@noema/types').EventId,
          eventType: 'session.teaching.changed',
          aggregateType: 'Session',
          aggregateId: session.id,
          payload: {
            userId: ctx.userId,
            previousApproach,
            newApproach: data.newApproach as TeachingApproach,
            trigger: data.trigger,
          } satisfies ISessionTeachingChangedPayload,
          metadata: { correlationId: ctx.correlationId, userId: ctx.userId },
        },
        tx
      );

      return next;
    });

    this.logger.info(
      { sessionId: session.id, from: previousApproach, to: data.newApproach },
      'Teaching approach changed'
    );

    return {
      data: updated,
      agentHints: buildHints(
        [
          {
            action: 'continue_session',
            description: 'Continue with the new teaching approach',
            priority: 'high',
          },
        ],
        `Teaching changed from ${previousApproach} to ${data.newApproach} (${data.trigger})`
      ),
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Fetch a session and verify the user owns it.
   */
  private async getAuthorizedSession(sessionId: string, ctx: IExecutionContext): Promise<ISession> {
    const session = await this.repository.findSessionById(sessionId as SessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    if (session.userId !== ctx.userId) {
      throw new AuthorizationError('You do not have access to this session');
    }
    return session;
  }

  /**
   * Assert the session is in the expected state.
   */
  private assertState(session: ISession, expected: SessionState, action: string): void {
    if (session.state !== expected) {
      throw new InvalidSessionStateError(session.state, action);
    }
  }

  /**
   * Assert the session is either active or paused.
   */
  private assertActiveOrPaused(session: ISession, action: string): void {
    if (session.state !== States.ACTIVE && session.state !== States.PAUSED) {
      throw new InvalidSessionStateError(session.state, action);
    }
  }

  private validateBlueprintConsistency(
    blueprintCardIds: string[],
    requestedCardIds: string[]
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (blueprintCardIds.length !== requestedCardIds.length) {
      errors.push('Blueprint card list length does not match initialCardIds length');
    }

    const requestedSet = new Set(requestedCardIds);
    for (const cardId of blueprintCardIds) {
      if (!requestedSet.has(cardId)) {
        errors.push(`Blueprint card ${cardId} not present in initialCardIds`);
        break;
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ==========================================================================
  // Offline Intent Token — Issuance & Verification
  // ==========================================================================

  /**
   * Issue a signed offline intent token.
   *
   * session-service is the single authority for token lifecycle (ADR-0023).
   */
  async issueOfflineIntentToken(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IOfflineIntentToken>> {
    const parsed = IssueOfflineIntentTokenInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid offline intent token input',
        parsed.error.flatten().fieldErrors
      );
    }

    const data = parsed.data as IOfflineIntentTokenInput;
    if (data.userId !== ctx.userId) {
      throw new AuthorizationError('userId in payload must match authenticated user');
    }

    if (this.tokenSecrets.size === 0) {
      throw new ValidationError('Offline intent token issuance is not configured', {
        offlineIntentToken: ['OFFLINE_INTENT_TOKEN_KEYS is required for token issuance'],
      });
    }

    const activeSecret = this.requireTokenSecret(this.activeTokenKeyId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + data.expiresInSeconds * 1000);

    const claims: IOfflineIntentTokenClaims = {
      tokenVersion: 'v1',
      userId: data.userId as UserId,
      sessionBlueprint: data.sessionBlueprint as IOfflineIntentTokenClaims['sessionBlueprint'],
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      nonce: crypto.randomUUID(),
    };

    const token = await new SignJWT(claims as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid: this.activeTokenKeyId })
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .setSubject(data.userId)
      .setIssuer(this.options.security.offlineIntentTokenIssuer)
      .setAudience(this.options.security.offlineIntentTokenAudience)
      .setJti(claims.nonce)
      .sign(activeSecret);

    await this.runInTransaction(async (tx) => {
      await this.publishThroughOutbox(
        {
          id: `${ID_PREFIXES.EventId}${nanoid()}` as import('@noema/types').EventId,
          eventType: 'session.intent_token.issued',
          aggregateType: 'Session',
          aggregateId: data.userId,
          payload: {
            expiresAt: claims.expiresAt,
            nonce: claims.nonce,
          },
          metadata: {
            correlationId: ctx.correlationId,
            userId: ctx.userId,
          },
        },
        tx
      );
    });

    this.logger.info(
      { userId: ctx.userId, kid: this.activeTokenKeyId, expiresAt: claims.expiresAt },
      'Issued offline intent token'
    );

    return {
      data: { token, expiresAt: claims.expiresAt },
      agentHints: buildHints(
        [
          {
            action: 'persist_intent_token',
            description: 'Store token offline for later session replay',
            priority: 'high',
          },
        ],
        'Token issued successfully'
      ),
    };
  }

  /**
   * Verify a signed offline intent token and extract claims.
   *
   * Supports kid-targeted key lookup with fallback to all keys for legacy tokens.
   */
  async verifyOfflineIntentTokenPublic(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IVerifyOfflineIntentTokenResult>> {
    const parsed = VerifyOfflineIntentTokenInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid verify intent token input',
        parsed.error.flatten().fieldErrors
      );
    }

    try {
      const protectedHeader = decodeProtectedHeader(parsed.data.token);
      const candidateKeys = this.getVerificationKeys(protectedHeader.kid);

      let verifiedPayload: Awaited<ReturnType<typeof jwtVerify>>['payload'] | undefined;
      let lastError: unknown;

      for (const key of candidateKeys) {
        try {
          const { payload } = await jwtVerify(parsed.data.token, key, {
            issuer: this.options.security.offlineIntentTokenIssuer,
            audience: this.options.security.offlineIntentTokenAudience,
          });
          verifiedPayload = payload;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (verifiedPayload === undefined) {
        throw lastError instanceof Error ? lastError : new Error('Token verification failed');
      }

      const claims = verifiedPayload as unknown as IOfflineIntentTokenClaims;
      if (claims.userId !== ctx.userId) {
        return {
          data: { valid: false, reason: 'Token userId does not match authenticated user' },
          agentHints: buildHints(
            [
              {
                action: 'request_new_intent_token',
                description: 'Token subject does not match user',
                priority: 'high',
              },
            ],
            'Token subject mismatch'
          ),
        };
      }

      const checkpointSignals =
        (claims.sessionBlueprint as { checkpointSignals?: AdaptiveCheckpointSignal[] })
          .checkpointSignals ?? [];

      return {
        data: {
          valid: true,
          userId: claims.userId,
          expiresAt: claims.expiresAt,
          checkpointSignals,
        },
        agentHints: buildHints(
          [
            {
              action: 'resume_offline_session',
              description: 'Intent token is valid',
              priority: 'high',
            },
          ],
          'Token verified successfully'
        ),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token verification failed';
      return {
        data: { valid: false, reason: message },
        agentHints: buildHints(
          [
            {
              action: 'request_new_intent_token',
              description: `Token invalid: ${message}`,
              priority: 'high',
            },
          ],
          'Token verification failed'
        ),
      };
    }
  }

  /**
   * Internal verification used by startSession.
   */
  private async verifyOfflineIntentToken(
    offlineIntentToken: string | undefined,
    ctx: IExecutionContext
  ): Promise<void> {
    if (!this.options.security.verifyOfflineIntentTokens || offlineIntentToken === undefined) {
      return;
    }

    if (this.tokenSecrets.size === 0) {
      throw new ValidationError('Offline intent token verification is enabled but not configured', {
        offlineIntentToken: ['OFFLINE_INTENT_TOKEN_KEYS is required when verification is enabled'],
      });
    }

    try {
      const protectedHeader = decodeProtectedHeader(offlineIntentToken);
      const candidateKeys = this.getVerificationKeys(protectedHeader.kid);

      let verifiedPayload: Awaited<ReturnType<typeof jwtVerify>>['payload'] | undefined;
      let lastError: unknown;

      for (const key of candidateKeys) {
        try {
          const { payload } = await jwtVerify(offlineIntentToken, key, {
            issuer: this.options.security.offlineIntentTokenIssuer,
            audience: this.options.security.offlineIntentTokenAudience,
          });
          verifiedPayload = payload;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (verifiedPayload === undefined) {
        if (lastError instanceof AuthorizationError) throw lastError;
        throw new AuthorizationError('Invalid offline intent token');
      }

      if (verifiedPayload.sub !== ctx.userId) {
        throw new AuthorizationError('Offline intent token does not match authenticated user');
      }
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new AuthorizationError('Invalid offline intent token');
    }
  }

  // --------------------------------------------------------------------------
  // Token Helpers
  // --------------------------------------------------------------------------

  private requireTokenSecret(keyId: string): Uint8Array {
    const secret = this.tokenSecrets.get(keyId);
    if (secret === undefined) {
      throw new Error(`Offline intent token secret missing for key id '${keyId}'`);
    }
    return secret;
  }

  private getVerificationKeys(tokenKid: unknown): Uint8Array[] {
    if (typeof tokenKid === 'string' && tokenKid.length > 0) {
      const selected = this.tokenSecrets.get(tokenKid);
      if (selected === undefined) {
        return [];
      }
      return [selected];
    }
    return [...this.tokenSecrets.values()];
  }

  private async runInTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => operation(tx));
  }

  private async publishThroughOutbox(
    event: IOutboxEventInput,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    await this.outboxRepository.enqueue(event, tx);

    if (tx !== undefined) {
      return;
    }

    try {
      await this.eventPublisher.publish({
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload,
        metadata: event.metadata,
      });
      await this.outboxRepository.markPublished(event.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown outbox publish failure';
      await this.outboxRepository.markFailed(event.id, message, tx);
      throw new OutboxDispatchError('Failed to publish outbox event', {
        eventId: event.id,
        eventType: event.eventType,
        error: message,
      });
    }
  }

  /**
   * Compute updated session stats after an attempt.
   */
  private computeUpdatedStats(
    current: ISessionStats,
    attempt: {
      outcome: string;
      rating: string;
      ratingValue: number;
      responseTimeMs: number;
      confidenceBefore: number | undefined;
      confidenceAfter: number | undefined;
      hintRequestCount: number | undefined;
      isFirstAttemptForCard: boolean;
    }
  ): ISessionStats {
    const totalAttempts = current.totalAttempts + 1;
    const correctCount = current.correctCount + (attempt.outcome === 'correct' ? 1 : 0);
    const incorrectCount = current.incorrectCount + (attempt.outcome === 'incorrect' ? 1 : 0);
    const skippedCount = current.skippedCount + (attempt.outcome === 'skipped' ? 1 : 0);

    // Running average for response time
    const averageResponseTimeMs = Math.round(
      (current.averageResponseTimeMs * current.totalAttempts + attempt.responseTimeMs) /
        totalAttempts
    );

    // Running average for confidence
    let averageConfidence = current.averageConfidence;
    if (attempt.confidenceBefore != null) {
      averageConfidence =
        averageConfidence != null
          ? (averageConfidence * current.totalAttempts + attempt.confidenceBefore) / totalAttempts
          : attempt.confidenceBefore;
    }

    // Calibration delta
    let averageCalibrationDelta = current.averageCalibrationDelta;
    if (attempt.confidenceBefore != null && attempt.confidenceAfter != null) {
      const delta = attempt.confidenceAfter - attempt.confidenceBefore;
      averageCalibrationDelta =
        averageCalibrationDelta != null
          ? (averageCalibrationDelta * current.totalAttempts + delta) / totalAttempts
          : delta;
    }

    // Streak tracking
    const isCorrect = attempt.outcome === 'correct';
    const streakCurrent = isCorrect ? current.streakCurrent + 1 : 0;
    const streakBest = Math.max(current.streakBest, streakCurrent);

    // Retention rate
    const retentionRate = totalAttempts > 0 ? correctCount / totalAttempts : 0;

    // Hints
    const totalHintsUsed = current.totalHintsUsed + (attempt.hintRequestCount ?? 0);

    // Rating distribution
    const ratingDistribution = { ...current.ratingDistribution };
    const ratingKey = attempt.rating.toLowerCase();
    ratingDistribution[ratingKey] = (ratingDistribution[ratingKey] ?? 0) + 1;

    return {
      totalAttempts,
      correctCount,
      incorrectCount,
      skippedCount,
      averageResponseTimeMs,
      averageConfidence,
      averageCalibrationDelta,
      retentionRate,
      streakCurrent,
      streakBest,
      totalHintsUsed,
      uniqueCardsReviewed: current.uniqueCardsReviewed + (attempt.isFirstAttemptForCard ? 1 : 0),
      newCardsIntroduced: current.newCardsIntroduced,
      lapsedCards: current.lapsedCards,
      ratingDistribution,
    };
  }

  /**
   * Suggest actions based on session state.
   */
  private suggestedActionsForState(
    session: ISession
  ): Array<{ action: string; description: string; priority?: ISuggestedAction['priority'] }> {
    switch (session.state) {
      case States.ACTIVE:
        return [
          { action: 'present_next_card', description: 'Present the next card', priority: 'high' },
          { action: 'pause_session', description: 'Pause the session' },
          { action: 'get_queue', description: 'Retrieve the session queue' },
        ];
      case States.PAUSED:
        return [
          { action: 'resume_session', description: 'Resume the paused session', priority: 'high' },
          { action: 'abandon_session', description: 'Abandon the session' },
        ];
      case States.COMPLETED:
      case States.ABANDONED:
      case States.EXPIRED:
        return [
          {
            action: 'show_session_summary',
            description: 'Display session summary',
            priority: 'high',
          },
          { action: 'start_new_session', description: 'Start a new study session' },
        ];
      default:
        return [];
    }
  }
}
