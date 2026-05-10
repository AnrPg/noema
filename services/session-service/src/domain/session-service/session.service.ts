/**
 * @noema/session-service - Step-first session application service.
 */

import { SignJWT, jwtVerify } from 'jose';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import type { IMetacognitionEvaluationRecordedPayload } from '@noema/events';
import type {
  IEvidenceCompletenessDto,
  IAgentSurfaceExposureDto,
  IExposureBudgetStateDto,
  ILearnerFeedbackActionDto,
  ILearnerFeedbackHistoryDto,
  ILearnerLoadStateDto,
  IRubricSummaryRecordDto,
  ISevenFrameTraceDto,
  IStepActivityContextDto,
  IStepCurriculumAnchorDto,
  IStepEvidenceRecordDto,
} from '@noema/contracts';

import {
  EpistemicMode,
  GoalSource,
  GoalState,
  GoalType,
  ID_PREFIXES,
  LearningMode,
  LessonPlanState,
  RigorLevel,
  SessionLifecycleState,
  SessionTerminationReason,
  StepStatus,
  TransformationType,
  type ActivityId,
  type CorrelationId,
  type EvaluationId,
  type EventId,
  type GoalId,
  type LessonPlanId,
  type SessionId,
  type StepSelfRating,
  type StepId,
  type UserId,
} from '@noema/types';

import type { Prisma, PrismaClient } from '../../../generated/prisma/index.js';
import type { IEventPublisher } from '../shared/event-publisher.js';
import {
  AuthorizationError,
  BusinessRuleError,
  OutboxDispatchError,
  SessionNotFoundError,
  ValidationError,
} from './errors/index.js';
import type { IOutboxEventInput, IOutboxRepository } from './outbox.repository.js';
import {
  NoopPedagogyGuardianClient,
  type IPedagogyGuardianPort,
} from './pedagogy-guardian.port.js';
import type { ICreateLessonPlanRecord, ISessionRepository } from './session.repository.js';
import {
  AnswerStepInputSchema,
  CreateGoalInputSchema,
  CreateLessonPlanInputSchema,
  IssueOfflineIntentTokenInputSchema,
  SessionListQuerySchema,
  StartSessionInputSchema,
  VerifyOfflineIntentTokenInputSchema,
} from './session.schemas.js';
import {
  ActivityContentSourceType,
  createEmptyStats,
  type ICreateGoalInput,
  type ICreateLessonPlanInput,
  type ILessonPlan,
  type ILessonPlanGoal,
  type IPlannedActivityInput,
  type IPlannedStepInput,
  type ISession,
  type ISessionFilters,
  type IStep,
  type IStepAnswerArtifact,
  type IStepLoopSnapshot,
} from '../../types/index.js';

export interface IExecutionContext {
  userId: UserId;
  correlationId: CorrelationId;
  idempotencyKey?: string;
  clientIp?: string;
  userAgent?: string;
  timezone?: string;
}

export interface IServiceResult<T> {
  data: T;
  agentHints: {
    suggestedNextActions: Array<{
      action: string;
      description: string;
      priority: 'low' | 'medium' | 'high';
      category: string;
    }>;
    relatedResources: unknown[];
    confidence: number;
    sourceQuality: 'high' | 'medium' | 'low';
    validityPeriod: 'short' | 'medium' | 'long';
    contextNeeded: string[];
    assumptions: string[];
    riskFactors: string[];
    dependencies: string[];
    estimatedImpact: { benefit: number; effort: number; roi: number };
    preferenceAlignment: string[];
    reasoning: string;
  };
}

export interface ISessionServiceOptions {
  security: {
    verifyOfflineIntentTokens: boolean;
    offlineIntentTokenActiveKeyId: string;
    offlineIntentTokenKeys: Record<string, string>;
    offlineIntentTokenIssuer: string;
    offlineIntentTokenAudience: string;
  };
  session: {
    maxConcurrentSessions: number;
  };
  lessonPlanAgentUrl?: string;
  pedagogyGuardianClient?: IPedagogyGuardianPort;
}

function normalizeTerminationReason(reason?: string): SessionTerminationReason {
  switch (reason) {
    case SessionTerminationReason.CARD_LIMIT_REACHED:
    case SessionTerminationReason.TIME_LIMIT_REACHED:
    case SessionTerminationReason.AUTO_EXPIRED:
    case SessionTerminationReason.ERROR:
    case SessionTerminationReason.USER_ENDED:
    case SessionTerminationReason.COMPLETED_NORMALLY:
      return reason;
    default:
      return reason === undefined
        ? SessionTerminationReason.COMPLETED_NORMALLY
        : SessionTerminationReason.USER_ENDED;
  }
}

function id<T extends string>(prefix: string): T {
  return `${prefix}${nanoid(21)}` as T;
}

function validationError(error: {
  flatten: () => { fieldErrors: Record<string, string[]> };
}): ValidationError {
  return new ValidationError('Invalid input', error.flatten().fieldErrors);
}

function result<T>(data: T, reasoning: string): IServiceResult<T> {
  return {
    data,
    agentHints: {
      suggestedNextActions: [],
      relatedResources: [],
      confidence: 0.9,
      sourceQuality: 'high',
      validityPeriod: 'medium',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 1, effort: 1, roi: 1 },
      preferenceAlignment: [],
      reasoning,
    },
  };
}

function isoNow(): string {
  return new Date().toISOString();
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function humanizeKey(value: string): string {
  return value.replace(/[_-]+/g, ' ').trim();
}

function describeResponseShape(response: unknown): string {
  if (response === undefined || response === null) return 'missing';
  if (Array.isArray(response)) return 'array';
  if (typeof response === 'object') return 'object';
  return typeof response;
}

function readableValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return truncateText(value.trim(), 240);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(readableValue).filter(Boolean).slice(0, 5).join(', ');
  }
  if (isRecord(value)) {
    const label = value['label'] ?? value['text'] ?? value['value'] ?? value['id'];
    if (label !== undefined) return readableValue(label);
    return truncateText(JSON.stringify(value), 240);
  }
  return truncateText(String(value), 240);
}

function commonFailureModesFor(evaluationType: string): string[] {
  const normalized = evaluationType.toLowerCase();
  if (normalized.includes('trace') || normalized.includes('explanation')) {
    return [
      'Answer states a result without enough reasoning evidence.',
      'Reasoning skips the check or reflection step.',
      'The response uses a plausible cue without showing why it applies.',
    ];
  }
  if (normalized.includes('choice') || normalized.includes('select')) {
    return [
      'Selected option does not match the diagnostic cue.',
      'A nearby confusable option is chosen without enough evidence.',
    ];
  }
  return [
    'The response does not address the Step objective.',
    'The response is too thin to compare against the expected outcome.',
  ];
}

export class SessionService {
  private readonly logger: Logger;
  private readonly options: ISessionServiceOptions;
  private readonly pedagogyGuardianClient: IPedagogyGuardianPort;

  constructor(
    private readonly repository: ISessionRepository,
    private readonly eventPublisher: IEventPublisher,
    private readonly outboxRepository: IOutboxRepository,
    private readonly prisma: PrismaClient,
    _logger: Logger,
    options?: Partial<ISessionServiceOptions>
  ) {
    this.logger = _logger.child({ component: 'SessionService' });
    const lessonPlanAgentUrl = options?.lessonPlanAgentUrl ?? process.env['LESSON_PLAN_AGENT_URL'];
    this.pedagogyGuardianClient =
      options?.pedagogyGuardianClient ?? new NoopPedagogyGuardianClient();
    this.options = {
      security: {
        verifyOfflineIntentTokens: true,
        offlineIntentTokenActiveKeyId: 'default',
        offlineIntentTokenKeys: { default: 'dev-only-session-service-secret' },
        offlineIntentTokenIssuer: 'noema.session-service',
        offlineIntentTokenAudience: 'noema.offline-intent',
        ...options?.security,
      },
      session: {
        maxConcurrentSessions: 10,
        ...options?.session,
      },
      ...(lessonPlanAgentUrl ? { lessonPlanAgentUrl } : {}),
      pedagogyGuardianClient: this.pedagogyGuardianClient,
    };
  }

  setStreakService(_service: unknown): void {
    // Streaks moved to the derived gamification projection in the realignment.
  }

  async startSession(input: unknown, ctx: IExecutionContext): Promise<IServiceResult<ISession>> {
    const parsed = StartSessionInputSchema.safeParse(input);
    if (!parsed.success) throw validationError(parsed.error);
    const data = parsed.data;
    const now = isoNow();
    const sessionId = id<SessionId>(ID_PREFIXES.SessionId);

    const session = await this.runInTransaction(async (tx) => {
      const created = await this.repository.createSession(
        {
          id: sessionId,
          userId: ctx.userId,
          curriculumId: data.curriculumId as never,
          curriculumVersionId: (data.curriculumVersionId ?? null) as never,
          studyMode: data.studyMode,
          learningMode: data.learningMode,
          lifecycleState: SessionLifecycleState.PLANNING,
          config: {
            ...data.config,
            curriculumId: data.curriculumId as never,
            ...(data.curriculumVersionId
              ? { curriculumVersionId: data.curriculumVersionId as never }
              : {}),
            ...(data.topic ? { topic: data.topic } : {}),
            sourceDecks: data.sourceDecks,
            sourceCategories: data.sourceCategories,
          } satisfies Record<string, unknown>,
          stats: createEmptyStats(),
          pauseCount: 0,
          totalPausedMs: 0,
          startedAt: now,
          lastActivityAt: now,
          completedAt: null,
          terminationReason: null,
          version: 1,
        },
        tx
      );

      await this.enqueueEvent(
        'session.started',
        'Session',
        created.id,
        {
          userId: ctx.userId,
          studyMode: created.studyMode,
          learningMode: created.learningMode,
          lifecycleState: created.lifecycleState,
        },
        ctx,
        tx
      );

      return created;
    });

    this.logger.debug({ sessionId: session.id, userId: ctx.userId }, 'Session started');
    return result(session, 'Session created in PLANNING state.');
  }

  async getSession(idValue: string, ctx: IExecutionContext): Promise<IServiceResult<ISession>> {
    const session = await this.repository.getSessionById(idValue as SessionId);
    this.assertOwnsSession(session, ctx);
    return result(session, 'Session fetched.');
  }

  async listSessions(
    input: unknown,
    limit?: number,
    offset?: number,
    ctx?: IExecutionContext
  ): Promise<IServiceResult<{ sessions: ISession[]; total: number }>> {
    if (!ctx) throw new AuthorizationError('Missing execution context');
    const parsed = SessionListQuerySchema.safeParse(input ?? {});
    if (!parsed.success) throw validationError(parsed.error);
    const query = parsed.data;
    const filters: ISessionFilters = {
      ...(query.lifecycleState ? { lifecycleState: query.lifecycleState } : {}),
      ...(query.learningMode ? { learningMode: query.learningMode } : {}),
      ...(query.studyMode ? { studyMode: query.studyMode } : {}),
      ...(query.createdAfter ? { createdAfter: query.createdAfter } : {}),
      ...(query.createdBefore ? { createdBefore: query.createdBefore } : {}),
      ...(query.completedAfter ? { completedAfter: query.completedAfter } : {}),
      ...(query.completedBefore ? { completedBefore: query.completedBefore } : {}),
    };
    const data = await this.repository.findSessionsByUser(
      ctx.userId,
      filters,
      limit ?? query.limit,
      offset ?? query.offset
    );
    return result(data, 'Sessions listed.');
  }

  async createLessonPlan(
    sessionIdValue: string,
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<{ lessonPlan: ILessonPlan; goals: ILessonPlanGoal[]; steps: IStep[] }>> {
    const parsed = CreateLessonPlanInputSchema.safeParse(input ?? {});
    if (!parsed.success) throw validationError(parsed.error);

    const session = await this.repository.getSessionById(sessionIdValue as SessionId);
    this.assertOwnsSession(session, ctx);

    const existing = await this.repository.findLessonPlanBySessionId(session.id);
    if (existing) {
      if (ctx.idempotencyKey && ctx.idempotencyKey.trim().length > 0) {
        const existingGoals = await this.repository.findGoalsByLessonPlanId(existing.id);
        const existingSteps = await this.repository.findStepsBySessionId(session.id);
        return result(
          { lessonPlan: existing, goals: existingGoals, steps: existingSteps },
          'LessonPlan create request replayed idempotently.'
        );
      }
      throw new BusinessRuleError('Session already has a LessonPlan', {
        sessionId: session.id,
        lessonPlanId: existing.id,
      });
    }

    const requested = parsed.data as ICreateLessonPlanInput;
    const rigorLevel =
      requested.rigorLevel ??
      (session.learningMode === LearningMode.GOAL_DRIVEN ? RigorLevel.FULL : RigorLevel.MINIMAL);

    const record =
      rigorLevel === RigorLevel.FULL
        ? await this.fullLessonPlanFactory(session, requested)
        : this.minimalLessonPlanFactory(session, requested);

    this.assertLessonPlanServesCurriculumSlice(record);

    await this.validateLessonPlanWithGuardian(record, ctx);

    const created = await this.runInTransaction(async (tx) => {
      const createdPlan = await this.repository.createLessonPlanWithSteps(record, tx);
      const activated =
        record.state === LessonPlanState.ACTIVE
          ? createdPlan.lessonPlan
          : await this.repository.activateLessonPlan(createdPlan.lessonPlan.id, tx);

      await this.enqueueEvent(
        'lesson_plan.created',
        'LessonPlan',
        activated.id,
        { lessonPlanId: activated.id, sessionId: activated.sessionId, userId: activated.userId },
        ctx,
        tx
      );
      await this.enqueueEvent(
        'lesson_plan.activated',
        'LessonPlan',
        activated.id,
        { lessonPlanId: activated.id, sessionId: activated.sessionId, userId: activated.userId },
        ctx,
        tx
      );

      for (const step of createdPlan.steps) {
        await this.enqueueEvent(
          'step.planned',
          'Step',
          step.id,
          {
            stepId: step.id,
            lessonPlanId: step.lessonPlanId,
            sessionId: step.sessionId,
            userId: step.userId,
          },
          ctx,
          tx
        );
      }

      return { lessonPlan: activated, goals: createdPlan.goals, steps: createdPlan.steps };
    });

    return result(created, 'LessonPlan created and activated.');
  }

  async createGoal(
    lessonPlanIdValue: string,
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ILessonPlanGoal>> {
    const parsed = CreateGoalInputSchema.safeParse(input);
    if (!parsed.success) throw validationError(parsed.error);
    const lessonPlanId = lessonPlanIdValue as LessonPlanId;
    const plan = await this.repository.findLessonPlanById(lessonPlanId);
    if (!plan) throw new SessionNotFoundError(lessonPlanId);
    if (plan.userId !== ctx.userId)
      throw new AuthorizationError('LessonPlan belongs to another user');

    const data = parsed.data as ICreateGoalInput;
    if (data.state === GoalState.ACTIVE) {
      const activeGoals = await this.repository.countActiveGoals(lessonPlanId);
      if (activeGoals >= 4) {
        throw new BusinessRuleError('A LessonPlan may have at most 4 active goals', {
          lessonPlanId,
          activeGoals,
        });
      }
    }

    const goal = await this.repository.createGoal(
      lessonPlanId,
      id<GoalId>(ID_PREFIXES.GoalId),
      data
    );
    return result(goal, 'Goal created.');
  }

  private async validateLessonPlanWithGuardian(
    record: ICreateLessonPlanRecord,
    ctx: IExecutionContext
  ): Promise<void> {
    const planValidation = await this.pedagogyGuardianClient.validateLessonPlan(
      {
        lessonPlan: record,
        triggeredBy: 'session-service.createLessonPlan',
      },
      ctx
    );
    if (planValidation.blocking) {
      throw new BusinessRuleError('Pedagogy Guardian rejected LessonPlan activation', {
        lessonPlanId: record.id,
        validationId: planValidation.validationId,
        reasonCodes: planValidation.reasonCodes,
      });
    }
    record.guardianValidationId = planValidation.validationId;

    for (const step of record.steps) {
      const stepValidation = await this.pedagogyGuardianClient.validateStep(
        {
          step,
          triggeredBy: 'session-service.queueStep',
        },
        ctx
      );
      if (stepValidation.blocking) {
        throw new BusinessRuleError('Pedagogy Guardian rejected Step queueing', {
          lessonPlanId: record.id,
          stepId: step.id,
          validationId: stepValidation.validationId,
          reasonCodes: stepValidation.reasonCodes,
        });
      }
      step.guardianValidationId = stepValidation.validationId;
    }
  }

  async getNextStep(
    sessionIdValue: string,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IStepLoopSnapshot>> {
    return this.getStepLoopSnapshot(sessionIdValue, ctx);
  }

  async presentStep(stepIdValue: string, ctx: IExecutionContext): Promise<IServiceResult<IStep>> {
    const step = await this.repository.getStepById(stepIdValue as StepId);
    await this.assertOwnsStep(step, ctx);
    if (step.status === StepStatus.EVALUATED) {
      throw new BusinessRuleError('Evaluated Steps are immutable', { stepId: step.id });
    }
    if (step.status === StepStatus.ANSWERED) {
      return result(step, 'Step answer already accepted and evaluation is pending.');
    }
    if (step.status === StepStatus.PRESENTED) {
      return result(step, 'Step already presented.');
    }

    const presented = await this.runInTransaction(async (tx) => {
      const updated = await this.repository.markStepPresented(step.id, tx);
      const session = await this.repository.getSessionById(step.sessionId);
      if (session.lifecycleState === SessionLifecycleState.PLANNING) {
        await this.transitionSession(session, SessionLifecycleState.EXECUTION, ctx, tx);
      }
      await this.enqueueEvent(
        'step.presented',
        'Step',
        updated.id,
        {
          stepId: updated.id,
          lessonPlanId: updated.lessonPlanId,
          sessionId: updated.sessionId,
          userId: updated.userId,
        },
        ctx,
        tx
      );
      return updated;
    });

    return result(presented, 'Step presented.');
  }

  async answerStep(
    stepIdValue: string,
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IStep>> {
    const parsed = AnswerStepInputSchema.safeParse(input ?? {});
    if (!parsed.success) throw validationError(parsed.error);
    const step = await this.repository.getStepById(stepIdValue as StepId);
    await this.assertOwnsStep(step, ctx);
    if (step.status === StepStatus.PLANNED || step.status === StepStatus.QUEUED) {
      throw new BusinessRuleError('Step must be presented before it can be answered', {
        stepId: step.id,
        status: step.status,
      });
    }
    if (step.status === StepStatus.EVALUATED) {
      throw new BusinessRuleError('Evaluated Steps are immutable', { stepId: step.id });
    }
    if (step.status === StepStatus.ANSWERED) {
      return result(step, 'Step answer already accepted and evaluation is pending.');
    }

    const evaluationId = (parsed.data.evaluationId ??
      id<EvaluationId>(ID_PREFIXES.EvaluationId)) as EvaluationId;
    if (step.conceptRefs.length === 0) {
      throw new BusinessRuleError('Cannot evaluate a Step without concept references', {
        stepId: step.id,
      });
    }

    const session = await this.repository.getSessionById(step.sessionId);
    const lessonPlan = await this.repository.findLessonPlanById(step.lessonPlanId);
    if (lessonPlan === null || lessonPlan.selectedNodeIds.length === 0) {
      throw new BusinessRuleError('Cannot evaluate a Step without selected curriculum nodes', {
        stepId: step.id,
        lessonPlanId: step.lessonPlanId,
      });
    }

    const answered = await this.runInTransaction(async (tx) => {
      const markResult = await this.repository.markStepAnswered(step.id, tx);
      if (!markResult.transitioned) {
        return markResult.step;
      }
      const answerSummary = this.buildLearnerAnswerSummary(parsed.data.response, step.activities?.[0]);
      await this.repository.upsertStepAnswerArtifact(
        {
          id: `answer_${nanoid(16)}`,
          stepId: step.id,
          userId: step.userId,
          responseShape: describeResponseShape(parsed.data.response),
          learnerAnswerSummaryText: answerSummary,
          rawResponse: parsed.data.response ?? null,
          rawResponseRef: `step-answer:${step.id}`,
          ...(parsed.data.responseTimeMs !== undefined
            ? { responseTimeMs: parsed.data.responseTimeMs }
            : {}),
          hintRequestCount: 0,
          revisionCount: 0,
        },
        tx
      );
      if (session.lifecycleState !== SessionLifecycleState.DIAGNOSIS) {
        await this.transitionSession(session, SessionLifecycleState.DIAGNOSIS, ctx, tx);
      }
      await this.enqueueEvent(
        'step.answered',
        'Step',
        markResult.step.id,
        this.stepAnsweredPayload(
          markResult.step,
          evaluationId,
          parsed.data.correct,
          parsed.data.selfRating,
          parsed.data.trace,
          parsed.data.response,
          parsed.data.responseTimeMs,
          lessonPlan.selectedNodeIds
        ),
        ctx,
        tx
      );
      return markResult.step;
    });

    return result(answered, 'Step answer accepted and evaluation is pending.');
  }

  async completeSession(
    sessionIdValue: string,
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ISession>> {
    const payload =
      input && typeof input === 'object' ? (input as { reason?: string; force?: boolean }) : {};
    const session = await this.repository.getSessionById(sessionIdValue as SessionId);
    this.assertOwnsSession(session, ctx);
    if (session.lifecycleState === SessionLifecycleState.COMPLETION) {
      return result(session, 'Session already completed.');
    }

    const steps = await this.repository.findStepsBySessionId(session.id);
    const incompleteSteps = steps.filter(
      (step) =>
        step.status !== StepStatus.EVALUATED &&
        step.status !== StepStatus.SKIPPED &&
        step.status !== StepStatus.SUPERSEDED
    );
    if (incompleteSteps.length > 0 && payload.force !== true) {
      throw new BusinessRuleError('Cannot complete a session with active Steps', {
        sessionId: session.id,
        incompleteStepIds: incompleteSteps.map((step) => step.id),
      });
    }

    const completedAt = isoNow();
    const terminationReason = normalizeTerminationReason(payload.reason);
    const completed = await this.runInTransaction(async (tx) => {
      const updated = await this.repository.updateSession(
        session.id,
        {
          lifecycleState: SessionLifecycleState.COMPLETION,
          completedAt,
          lastActivityAt: completedAt,
          terminationReason,
        },
        session.version,
        tx
      );
      await this.enqueueEvent(
        'session.completed',
        'Session',
        session.id,
        {
          sessionId: session.id,
          userId: session.userId,
          studyMode: session.studyMode,
          completedAt,
          terminationReason,
          learningMode: session.learningMode,
          sourceCategories: Array.isArray(session.config.sourceCategories)
            ? (session.config.sourceCategories as string[])
            : [],
          sourceDecks: Array.isArray(session.config.sourceDecks)
            ? (session.config.sourceDecks as string[])
            : [],
        },
        ctx,
        tx
      );
      return updated;
    });

    return result(completed, 'Session completed.');
  }

  async skipStep(
    stepIdValue: string,
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IStep>> {
    const parsed = input && typeof input === 'object' ? (input as { reason?: string }) : {};
    const step = await this.repository.getStepById(stepIdValue as StepId);
    await this.assertOwnsStep(step, ctx);
    if (step.status === StepStatus.EVALUATED) {
      throw new BusinessRuleError('Evaluated Steps are immutable', { stepId: step.id });
    }
    const skipped = await this.repository.markStepSkipped(step.id, parsed.reason ?? null);
    return result(skipped, 'Step skipped.');
  }

  async getStepLoopSnapshot(
    sessionIdValue: string,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IStepLoopSnapshot>> {
    const session = await this.repository.getSessionById(sessionIdValue as SessionId);
    this.assertOwnsSession(session, ctx);
    const lessonPlan = await this.repository.findLessonPlanBySessionId(session.id);
    if (!lessonPlan) {
      throw new BusinessRuleError('Session does not have a LessonPlan yet', {
        sessionId: session.id,
      });
    }
    const next = await this.repository.findCurrentOrNextQueueItem(session.id);
    return result(
      { session, lessonPlan, nextStep: next?.step ?? null },
      'Step-loop snapshot fetched.'
    );
  }

  async getStepEvidenceRecord(
    stepIdValue: string,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IStepEvidenceRecordDto>> {
    const step = await this.repository.getStepById(stepIdValue as StepId);
    await this.assertOwnsStep(step, ctx);
    const artifact = await this.repository.findStepAnswerArtifactByStepId(step.id);
    const activity = step.activities?.[0];
    const rubricSummary = this.buildRubricSummary(step, activity);
    const learnerAnswerSummaryText =
      artifact?.learnerAnswerSummaryText ?? 'No learner answer artifact has been recorded for this Step yet.';
    const completeness = this.validateStepEvidenceReadiness(step, artifact);

    return result(
      {
        stepId: step.id,
        sessionId: step.sessionId,
        lessonPlanId: step.lessonPlanId,
        userId: step.userId,
        studyMode: step.studyMode,
        epistemicMode: step.selectedMode,
        transformationType: step.transformationType,
        stepObjectiveText: step.objective,
        expectedOutcomeText: step.expectedOutcome,
        activityPromptText: activity?.prompt ?? 'No activity prompt is attached to this Step.',
        activityTypeLabel: `${step.evaluationType} / ${activity?.expectedResponseType ?? 'unknown response'}`,
        learnerAnswerSummaryText,
        responseShape: artifact?.responseShape ?? 'missing',
        ...(artifact?.responseTimeMs !== null && artifact?.responseTimeMs !== undefined
          ? { responseTimeMs: artifact.responseTimeMs }
          : {}),
        hintRequestCount: artifact?.hintRequestCount ?? 0,
        revisionCount: artifact?.revisionCount ?? 0,
        ...(step.answeredAt !== null ? { answeredAt: step.answeredAt } : {}),
        rubricSummary,
        evidenceCompleteness: completeness,
        serviceReferences: {
          stepId: step.id,
          sessionId: step.sessionId,
          lessonPlanId: step.lessonPlanId,
          ...(activity?.id !== undefined ? { activityId: activity.id } : {}),
          ...(step.evaluationId !== null ? { evaluationId: step.evaluationId } : {}),
          ...(artifact?.rawResponseRef !== undefined ? { rawResponseRef: artifact.rawResponseRef } : {}),
        },
      },
      'Step evidence record fetched.'
    );
  }

  async getStepRubricSummary(
    stepIdValue: string,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IRubricSummaryRecordDto>> {
    const step = await this.repository.getStepById(stepIdValue as StepId);
    await this.assertOwnsStep(step, ctx);
    return result(this.buildRubricSummary(step, step.activities?.[0]), 'Step rubric summary fetched.');
  }

  async getStepActivityContext(
    stepIdValue: string,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IStepActivityContextDto>> {
    const step = await this.repository.getStepById(stepIdValue as StepId);
    await this.assertOwnsStep(step, ctx);
    const anchors = (step.activities ?? []).map((activity) => ({
      anchorLabelText: activity.cardId
        ? `Card ${activity.cardId}`
        : activity.generatedVariantId
          ? `Generated activity ${activity.generatedVariantId}`
          : `Step activity ${activity.position + 1}`,
      sourceKind: activity.contentSourceType,
      promptExcerptText: truncateText(activity.prompt, 500),
      expectedUseText: `This activity supports the Step objective: ${step.objective}`,
      coverageStatusText: 'Coverage is inferred from the Step activity link; content-service coverage was not queried by session-service.',
      serviceReferences: {
        activityId: activity.id,
        ...(activity.cardId !== null ? { cardId: activity.cardId as never } : {}),
        ...(activity.generatedVariantId !== null
          ? { generatedVariantId: activity.generatedVariantId as never }
          : {}),
        ...(activity.templateId !== null ? { templateId: activity.templateId } : {}),
        conceptIds: step.conceptRefs,
      },
    }));
    const primary = step.activities?.[0];
    return result(
      {
        stepId: step.id,
        activityPromptText: primary?.prompt ?? 'No activity prompt is attached to this Step.',
        activityTypeText: `${step.evaluationType} / ${primary?.expectedResponseType ?? 'unknown response'}`,
        contentAnchorSummaries: anchors,
        serviceReferences: {
          stepId: step.id,
          activityIds: (step.activities ?? []).map((activity) => activity.id),
          cardIds: (step.activities ?? [])
            .map((activity) => activity.cardId)
            .filter((value): value is string => typeof value === 'string') as never,
          generatedVariantIds: (step.activities ?? [])
            .map((activity) => activity.generatedVariantId)
            .filter((value): value is string => typeof value === 'string') as never,
          templateIds: (step.activities ?? [])
            .map((activity) => activity.templateId)
            .filter((value): value is string => typeof value === 'string'),
        },
      },
      'Step activity context fetched.'
    );
  }

  async getStepCurriculumAnchor(
    stepIdValue: string,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IStepCurriculumAnchorDto>> {
    const step = await this.repository.getStepById(stepIdValue as StepId);
    await this.assertOwnsStep(step, ctx);
    const lessonPlan = await this.repository.findLessonPlanById(step.lessonPlanId);
    if (lessonPlan === null) {
      throw new BusinessRuleError('Step does not have a lesson plan anchor', {
        stepId: step.id,
        lessonPlanId: step.lessonPlanId,
      });
    }
    return result(
      {
        stepId: step.id,
        curriculumAnchorText: `This Step belongs to "${lessonPlan.topic}" and serves: ${step.objective}`,
        selectedNodeIds: lessonPlan.selectedNodeIds,
        topicText: lessonPlan.topic,
        serviceReferences: {
          stepId: step.id,
          sessionId: step.sessionId,
          lessonPlanId: step.lessonPlanId,
          curriculumNodeIds: lessonPlan.selectedNodeIds,
        },
      },
      'Step curriculum anchor fetched.'
    );
  }

  async recordLearnerFeedbackAction(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ILearnerFeedbackActionDto>> {
    if (!isRecord(input)) throw new ValidationError('Invalid input', { input: ['object required'] });
    const surface = asOptionalString(input['surface']);
    const actionType = asOptionalString(input['actionType']);
    if (surface === undefined || actionType === undefined) {
      throw new ValidationError('Invalid feedback action', {
        surface: surface === undefined ? ['surface is required'] : [],
        actionType: actionType === undefined ? ['actionType is required'] : [],
      });
    }

    const sessionId = asOptionalString(input['sessionId']) as SessionId | undefined;
    const stepId = asOptionalString(input['stepId']) as StepId | undefined;
    if (sessionId !== undefined) this.assertOwnsSession(await this.repository.getSessionById(sessionId), ctx);
    if (stepId !== undefined) await this.assertOwnsStep(await this.repository.getStepById(stepId), ctx);
    const noteText = asOptionalString(input['noteText']);
    const reasonText = asOptionalString(input['reasonText']);

    const action = await this.repository.recordLearnerFeedbackAction({
      id: id<string>('lfa_'),
      userId: ctx.userId,
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(stepId !== undefined ? { stepId } : {}),
      surface: surface as never,
      actionType: actionType as never,
      ...(noteText !== undefined ? { noteText } : {}),
      ...(reasonText !== undefined ? { reasonText } : {}),
      conceptIds: asStringArray(input['conceptIds']) as never,
      metadata: isRecord(input['metadata']) ? input['metadata'] : {},
    });
    return result(action, 'Learner feedback action recorded.');
  }

  async getLearnerFeedbackHistory(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ILearnerFeedbackHistoryDto>> {
    if (!isRecord(input)) throw new ValidationError('Invalid input', { input: ['object required'] });
    const surface = (asOptionalString(input['surface']) ?? 'mental_debugger') as ILearnerFeedbackHistoryDto['surface'];
    const windowDays = typeof input['windowDays'] === 'number' ? Math.max(1, input['windowDays']) : 30;
    const actions = await this.repository.findLearnerFeedbackActions({
      userId: ctx.userId,
      surface,
      since: isoDaysAgo(windowDays),
      limit: 50,
    });
    const dismissals = actions.filter((action) =>
      action.actionType.includes('dismissed') || action.actionType.includes('declined') || action.actionType.includes('not_fit')
    );
    const corrections = actions.filter((action) =>
      action.actionType.includes('marked_not_fit') || Boolean(action.reasonText || action.noteText)
    );
    const showMoreCount = actions.filter((action) => action.actionType.includes('show_more') || action.actionType === 'calibration_show_trend').length;
    const showLessCount = actions.filter((action) => action.actionType.includes('show_less')).length;
    const feedbackDepthPreference =
      showMoreCount > showLessCount ? 'more_detail' : showLessCount > showMoreCount ? 'less_detail' : 'standard';
    const hidden = actions.find((action) => action.actionType === 'debugger_pattern_hidden_temporarily');
    const correctionThemesText = corrections
      .map((action) => action.reasonText ?? action.noteText)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .slice(0, 5);

    return result(
      {
        userId: ctx.userId,
        surface,
        windowLabelText: `Last ${windowDays} days`,
        recentDismissals: dismissals,
        recentCorrections: corrections,
        feedbackDepthPreference,
        temporaryHideState: hidden
          ? {
              hidden: true,
              hiddenUntilText: 'Hidden for this recent interaction window unless policy clears it.',
              ...(hidden.reasonText !== undefined ? { reasonText: hidden.reasonText } : {}),
            }
          : { hidden: false },
        correctionThemesText:
          correctionThemesText.length > 0
            ? correctionThemesText
            : ['No corrections or dismissals recorded for this surface.'],
        summaryText:
          actions.length === 0
            ? 'No corrections or dismissals recorded for this surface.'
            : `${actions.length} recent learner feedback action(s) recorded for this surface.`,
        serviceReferences: { actionIds: actions.map((action) => action.id) },
      },
      'Learner feedback history fetched.'
    );
  }

  async getLearnerLoadState(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ILearnerLoadStateDto>> {
    if (!isRecord(input)) throw new ValidationError('Invalid input', { input: ['object required'] });
    const sessionId = asOptionalString(input['sessionId']) as SessionId | undefined;
    if (sessionId === undefined) {
      throw new ValidationError('Invalid load-state query', { sessionId: ['sessionId is required'] });
    }
    const session = await this.repository.getSessionById(sessionId);
    this.assertOwnsSession(session, ctx);
    const steps = await this.repository.findStepsBySessionId(session.id);
    const recentSteps = steps.slice(-8);
    const skippedCount = recentSteps.filter((step) => step.status === StepStatus.SKIPPED).length;
    const answeredUnevaluatedCount = recentSteps.filter((step) => step.status === StepStatus.ANSWERED).length;
    const pauseSignal = session.pauseCount >= 2 || session.totalPausedMs >= 180_000;
    const fatigueIndicatorsText = [
      ...(skippedCount > 0 ? [`${skippedCount} recent Step(s) were skipped.`] : []),
      ...(answeredUnevaluatedCount > 1 ? [`${answeredUnevaluatedCount} answered Step(s) are awaiting evaluation.`] : []),
      ...(pauseSignal ? ['The session has repeated or extended pauses.'] : []),
    ];
    const overloadRiskLevel =
      fatigueIndicatorsText.length >= 3 ? 'high' : fatigueIndicatorsText.length >= 1 ? 'medium' : 'low';
    return result(
      {
        userId: ctx.userId,
        sessionId: session.id,
        frustrationSignalText:
          fatigueIndicatorsText.length === 0
            ? 'No session-local overload signal is currently detected.'
            : fatigueIndicatorsText.join(' '),
        overloadRiskLevel,
        fatigueIndicatorsText:
          fatigueIndicatorsText.length > 0
            ? fatigueIndicatorsText
            : ['No fatigue indicators detected in the recent session window.'],
        recommendedToneText:
          overloadRiskLevel === 'high'
            ? 'Keep any reflective feedback brief, optional, and validating.'
            : overloadRiskLevel === 'medium'
              ? 'Use concise coaching and avoid stacking multiple reflective prompts.'
              : 'Standard reflective tone is acceptable.',
        shouldDeferReflectiveAgent: overloadRiskLevel === 'high',
        evidenceWindowText: `Recent ${recentSteps.length} Step(s) in this session.`,
        serviceReferences: { sessionId: session.id, stepIds: recentSteps.map((step) => step.id) },
      },
      'Learner load state fetched.'
    );
  }

  async recordAgentSurfaceExposure(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IAgentSurfaceExposureDto>> {
    if (!isRecord(input)) throw new ValidationError('Invalid input', { input: ['object required'] });
    const sessionId = asOptionalString(input['sessionId']) as SessionId | undefined;
    const surface = asOptionalString(input['surface']);
    if (sessionId === undefined || surface === undefined) {
      throw new ValidationError('Invalid exposure', {
        sessionId: sessionId === undefined ? ['sessionId is required'] : [],
        surface: surface === undefined ? ['surface is required'] : [],
      });
    }
    this.assertOwnsSession(await this.repository.getSessionById(sessionId), ctx);
    const stepId = asOptionalString(input['stepId']) as StepId | undefined;
    if (stepId !== undefined) await this.assertOwnsStep(await this.repository.getStepById(stepId), ctx);
    const exposure = await this.repository.recordAgentSurfaceExposure({
      id: id<string>('ase_'),
      userId: ctx.userId,
      sessionId,
      ...(stepId !== undefined ? { stepId } : {}),
      surface: surface as never,
      metadata: isRecord(input['metadata']) ? input['metadata'] : {},
    });
    return result(exposure, 'Agent surface exposure recorded.');
  }

  async getExposureBudgetState(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IExposureBudgetStateDto>> {
    if (!isRecord(input)) throw new ValidationError('Invalid input', { input: ['object required'] });
    const sessionId = asOptionalString(input['sessionId']) as SessionId | undefined;
    if (sessionId === undefined) {
      throw new ValidationError('Invalid exposure-budget query', { sessionId: ['sessionId is required'] });
    }
    this.assertOwnsSession(await this.repository.getSessionById(sessionId), ctx);
    const exposures = await this.repository.findAgentSurfaceExposures({
      userId: ctx.userId,
      sessionId,
      surfaces: ['mental_debugger', 'calibration_coach'] as never,
      limit: 100,
    });
    const debuggerExposures = exposures.filter((exposure) => exposure.surface === 'mental_debugger');
    const calibrationExposures = exposures.filter((exposure) => exposure.surface === 'calibration_coach');
    const debuggerBudget = 2;
    const calibrationBudget = 2;
    return result(
      {
        userId: ctx.userId,
        sessionId,
        debuggerExposureCountInSession: debuggerExposures.length,
        calibrationExposureCountInSession: calibrationExposures.length,
        lastDebuggerShownAtText: debuggerExposures[0]?.shownAt ?? 'No debugger reflection has been shown in this session.',
        lastCalibrationShownAtText: calibrationExposures[0]?.shownAt ?? 'No calibration coaching has been shown in this session.',
        debuggerExposureBudgetText: `At most ${debuggerBudget} prominent Mental Debugger reflections per session before using quiet surfaces.`,
        coachingFrequencyBudgetText: `At most ${calibrationBudget} prominent Calibration Coach notes per session before using quiet surfaces.`,
        remainingBudget: {
          mentalDebugger: Math.max(0, debuggerBudget - debuggerExposures.length),
          calibrationCoach: Math.max(0, calibrationBudget - calibrationExposures.length),
        },
        mustUseQuietSurface:
          debuggerExposures.length >= debuggerBudget || calibrationExposures.length >= calibrationBudget,
        serviceReferences: { exposureIds: exposures.map((exposure) => exposure.id) },
      },
      'Exposure budget state fetched.'
    );
  }

  async finalizeStepEvaluation(
    payload: IMetacognitionEvaluationRecordedPayload,
    ctx: IExecutionContext
  ): Promise<IStep | null> {
    const step = await this.repository.getStepById(payload.stepId);
    if (step.userId !== ctx.userId || payload.userId !== step.userId) {
      throw new AuthorizationError('Evaluation event belongs to another user');
    }
    if (payload.sessionId !== step.sessionId) {
      throw new BusinessRuleError('Evaluation event session does not match Step session', {
        stepId: step.id,
        expectedSessionId: step.sessionId,
        incomingSessionId: payload.sessionId,
      });
    }
    const lessonPlan = await this.repository.findLessonPlanById(step.lessonPlanId);
    if (lessonPlan === null) {
      throw new BusinessRuleError('Evaluation event references a Step without a LessonPlan', {
        stepId: step.id,
        lessonPlanId: step.lessonPlanId,
      });
    }
    this.assertSameStringSet('conceptRefs', step.conceptRefs, payload.conceptRefs);
    this.assertSameStringSet('selectedNodeIds', lessonPlan.selectedNodeIds, payload.selectedNodeIds);
    this.assertSameValue('studyMode', step.studyMode, payload.studyMode);
    this.assertSameValue('epistemicMode', step.selectedMode, payload.epistemicMode);
    this.assertSameValue('transformation', step.transformationType, payload.transformation);
    if (step.status === StepStatus.EVALUATED) {
      if (step.evaluationId === payload.evaluationId) {
        return step;
      }
      throw new BusinessRuleError('Step already finalized with a different evaluation', {
        stepId: step.id,
        evaluationId: step.evaluationId,
        incomingEvaluationId: payload.evaluationId,
      });
    }

    const session = await this.repository.getSessionById(step.sessionId);
    return this.runInTransaction(async (tx) => {
      const updated = await this.repository.markStepEvaluatedIfPending(
        step.id,
        payload.evaluationId,
        tx
      );
      if (updated === null) {
        return null;
      }
      if (session.lifecycleState !== SessionLifecycleState.EVALUATION) {
        await this.transitionSession(session, SessionLifecycleState.EVALUATION, ctx, tx);
      }
      await this.enqueueEvent('step.evaluated', 'Step', updated.id, this.stepPayload(updated), ctx, tx);
      return updated;
    });
  }

  async issueOfflineIntentToken(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<{ token: string; expiresAt: string; nonce: string }>> {
    const parsed = IssueOfflineIntentTokenInputSchema.safeParse(input);
    if (!parsed.success) throw validationError(parsed.error);
    if (parsed.data.userId !== ctx.userId) {
      throw new AuthorizationError('Cannot issue offline intent token for another user');
    }
    const key = this.getOfflineTokenKey();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = nowSeconds + parsed.data.expiresInSeconds;
    const nonce = nanoid(16);
    const token = await new SignJWT({
      userId: parsed.data.userId,
      sessionBlueprint: parsed.data.sessionBlueprint,
      nonce,
    })
      .setProtectedHeader({
        alg: 'HS256',
        kid: this.options.security.offlineIntentTokenActiveKeyId,
      })
      .setIssuer(this.options.security.offlineIntentTokenIssuer)
      .setAudience(this.options.security.offlineIntentTokenAudience)
      .setSubject(parsed.data.userId)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(expiresAtSeconds)
      .setJti(nonce)
      .sign(key);

    return result(
      { token, expiresAt: new Date(expiresAtSeconds * 1000).toISOString(), nonce },
      'Offline intent token issued.'
    );
  }

  async verifyOfflineIntentTokenPublic(
    input: unknown,
    _ctx: IExecutionContext
  ): Promise<IServiceResult<{ valid: boolean; claims: unknown }>> {
    const parsed = VerifyOfflineIntentTokenInputSchema.safeParse(input);
    if (!parsed.success) throw validationError(parsed.error);
    const key = this.getOfflineTokenKey();
    const verified = await jwtVerify(parsed.data.token, key, {
      issuer: this.options.security.offlineIntentTokenIssuer,
      audience: this.options.security.offlineIntentTokenAudience,
    });
    return result({ valid: true, claims: verified.payload }, 'Offline intent token verified.');
  }

  private minimalLessonPlanFactory(
    session: ISession,
    input: ICreateLessonPlanInput
  ): ICreateLessonPlanRecord {
    const topic = input.topic ?? session.config.topic ?? 'Review session';
    const lessonPlanId = id<LessonPlanId>(ID_PREFIXES.LessonPlanId);
    const stepId = id<StepId>(ID_PREFIXES.StepId);
    const activityId = id<ActivityId>(ID_PREFIXES.ActivityId);
    const variantSeed = `minimal-${session.id}-${Date.now().toString(36)}`;
    const plannedStep = input.steps?.[0];
    const canonicalConceptRefs =
      plannedStep?.conceptRefs && plannedStep.conceptRefs.length > 0
        ? plannedStep.conceptRefs
        : input.conceptRefs ?? [];
    const goals =
      (input.goals ?? []).length > 0
        ? (input.goals ?? []).map((goalInput) => ({
            id: id<GoalId>(ID_PREFIXES.GoalId),
            lessonPlanId,
            description: goalInput.description,
            type: goalInput.type,
            parentGoalId: goalInput.parentGoalId ?? null,
            state: goalInput.state ?? GoalState.PENDING,
            source: goalInput.source ?? GoalSource.SYSTEM_PROPOSED,
            conceptRefs: goalInput.conceptRefs ?? [],
          }))
        : [
            {
              id: id<GoalId>(ID_PREFIXES.GoalId),
              lessonPlanId,
              description: `Serve ${topic}`,
              type: GoalType.REASONING,
              parentGoalId: null,
              state: GoalState.ACTIVE,
              source: GoalSource.SYSTEM_PROPOSED,
              conceptRefs: canonicalConceptRefs,
            },
          ];

    const activityInput: IPlannedActivityInput | undefined = plannedStep?.activities?.[0];
    const stepInput: IPlannedStepInput = plannedStep ?? {
      objective: `Review ${topic}`,
      expectedOutcome: `Learner can explain the core idea of ${topic}.`,
      conceptRefs: canonicalConceptRefs,
    };
    const resolvedCurriculumVersionId = input.curriculumVersionId ?? session.curriculumVersionId;
    if (resolvedCurriculumVersionId === null || resolvedCurriculumVersionId === undefined) {
      throw new BusinessRuleError('LessonPlan creation requires a bound curriculum version', {
        sessionId: session.id,
        curriculumId: input.curriculumId ?? session.curriculumId,
      });
    }

    return {
      id: lessonPlanId,
      sessionId: session.id,
      userId: session.userId,
      curriculumId: input.curriculumId ?? session.curriculumId,
      curriculumVersionId: resolvedCurriculumVersionId,
      selectedNodeIds: input.selectedNodeIds ?? [],
      studyMode: session.studyMode,
      learningMode: session.learningMode,
      rigorLevel: input.rigorLevel ?? RigorLevel.MINIMAL,
      topic,
      prerequisites: input.prerequisites ?? [],
      sourceDecks: input.sourceDecks ?? session.config.sourceDecks ?? [],
      sourceCategories: input.sourceCategories ?? session.config.sourceCategories ?? [],
      assessmentStrategy: input.assessmentStrategy ?? 'Structural review step evaluation',
      adaptationRules:
        input.adaptationRules ?? 'Advance through pending Steps; adapt in later batches.',
      guardianValidationId: null,
      state: LessonPlanState.ACTIVE,
      version: 1,
      goals,
      steps: [
        {
          id: stepId,
          lessonPlanId,
          sessionId: session.id,
          userId: session.userId,
          studyMode: session.studyMode,
          position: 0,
          objective: stepInput.objective,
          servesGoalIds: stepInput.servesGoalIds ?? goals.map((goal) => goal.id),
          eligibleModes: stepInput.eligibleModes ?? [EpistemicMode.GENERATIVE_RETRIEVAL],
          selectedMode: stepInput.selectedMode ?? EpistemicMode.GENERATIVE_RETRIEVAL,
          transformationType: stepInput.transformationType ?? TransformationType.RECALL,
          expectedOutcome: stepInput.expectedOutcome,
          evaluationType: stepInput.evaluationType ?? 'self_explanation',
          difficulty: stepInput.difficulty ?? 0.5,
          isRepair: stepInput.isRepair ?? false,
          conceptRefs: canonicalConceptRefs,
          variantSeed: stepInput.variantSeed ?? variantSeed,
          status: StepStatus.QUEUED,
          evaluationId: null,
          guardianValidationId: null,
          presentedAt: null,
          answeredAt: null,
          evaluatedAt: null,
          supersededByStepId: null,
          version: 1,
          queueStatus: 'pending',
          activities: [
            {
              id: activityId,
              stepId,
              position: 0,
              contentSourceType:
                activityInput?.contentSourceType ?? ActivityContentSourceType.GENERATED,
              cardId: activityInput?.cardId ?? null,
              templateId: activityInput?.templateId ?? null,
              generatedVariantId: activityInput?.generatedVariantId ?? null,
              prompt:
                activityInput?.prompt ??
                `Explain ${topic} in your own words, then name one uncertainty.`,
              renderPayload: activityInput?.renderPayload ?? {},
              expectedResponseType: activityInput?.expectedResponseType ?? 'free_text',
              responseSchema: activityInput?.responseSchema ?? {},
              variantSeed: activityInput?.variantSeed ?? variantSeed,
              generationFallbackReason: activityInput?.generationFallbackReason ?? null,
            },
          ],
        },
      ],
    };
  }

  private async fullLessonPlanFactory(
    session: ISession,
    input: ICreateLessonPlanInput
  ): Promise<ICreateLessonPlanRecord> {
    if (!this.options.lessonPlanAgentUrl) {
      throw new BusinessRuleError('Full LessonPlan generation agent is not configured', {
        sessionId: session.id,
      });
    }

    const response = await fetch(this.resolveLessonPlanAgentRunUrl(this.options.lessonPlanAgentUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': session.id,
        'x-user-id': session.userId,
      },
      body: JSON.stringify({
        sessionId: session.id,
        userId: session.userId,
        curriculumId: input.curriculumId ?? session.curriculumId,
        selectedNodeIds: input.selectedNodeIds ?? [],
        selectedCardIds: [],
        studyMode: session.studyMode,
        executionPreference: 'auto',
        payload: {
          topic: input.topic,
          prerequisites: input.prerequisites ?? [],
          sourceDecks: input.sourceDecks ?? session.config.sourceDecks ?? [],
          sourceCategories: input.sourceCategories ?? session.config.sourceCategories ?? [],
          assessmentStrategy: input.assessmentStrategy,
          adaptationRules: input.adaptationRules,
          rigorLevel: RigorLevel.FULL,
          curriculumVersionId: input.curriculumVersionId ?? session.curriculumVersionId,
        },
      }),
    });

    if (!response.ok) {
      throw new BusinessRuleError('Full LessonPlan generation agent rejected the request', {
        status: response.status,
      });
    }

    const envelope = (await response.json()) as { data?: Record<string, unknown> } & Record<string, unknown>;
    const generated = await this.resolveLessonPlanAgentPayload(
      this.resolveLessonPlanAgentBaseUrl(this.options.lessonPlanAgentUrl),
      (envelope.data ?? envelope) as Record<string, unknown>,
      session.userId
    );
    return this.minimalLessonPlanFactory(session, {
      ...input,
      rigorLevel: RigorLevel.FULL,
      topic: generated.topic ?? generated.rationale ?? input.topic,
      goals: (generated.goals ?? []).map((goal) => ({
        description: String(goal['description'] ?? goal['title'] ?? 'Serve generated lesson goal'),
        type: (goal['type'] as ICreateGoalInput['type']) ?? GoalType.ACQUISITION,
        source: (goal['source'] as ICreateGoalInput['source']) ?? GoalSource.SYSTEM_PROPOSED,
        conceptRefs: Array.isArray(goal['conceptRefs'])
          ? (goal['conceptRefs'] as never)
          : ((goal['targetNodeIds'] ?? []) as never),
      })),
      steps: generated.steps ?? input.steps,
    });
  }

  private resolveLessonPlanAgentRunUrl(configuredUrl: string): string {
    const trimmed = configuredUrl.replace(/\/+$/, '');
    if (trimmed.includes('/v1/agents/')) {
      return trimmed;
    }
    const baseUrl = this.resolveLessonPlanAgentBaseUrl(trimmed);
    return `${baseUrl}/v1/agents/lesson-plan-generator/run`;
  }

  private resolveLessonPlanAgentBaseUrl(configuredUrl: string): string {
    return configuredUrl.replace(/\/v1\/lesson-plans\/generate$/, '').replace(/\/+$/, '');
  }

  private async resolveLessonPlanAgentPayload(
    baseUrl: string,
    payload: Record<string, unknown>,
    userId: UserId
  ): Promise<{
    goals?: Array<Record<string, unknown>>;
    steps?: IPlannedStepInput[];
    topic?: string;
    rationale?: string;
  }> {
    const status = payload['status'];
    const jobId = payload['jobId'];
    const execution = payload['execution'];
    if (status !== 'queued') {
      if (
        execution &&
        typeof execution === 'object' &&
        'result' in execution &&
        execution['result'] &&
        typeof execution['result'] === 'object'
      ) {
        return execution['result'] as {
          goals?: Array<Record<string, unknown>>;
          steps?: IPlannedStepInput[];
          topic?: string;
          rationale?: string;
        };
      }
      return payload as {
        goals?: Array<Record<string, unknown>>;
        steps?: IPlannedStepInput[];
        topic?: string;
        rationale?: string;
      };
    }

    if (typeof jobId !== 'string' || jobId.trim().length === 0) {
      throw new BusinessRuleError('Queued lesson plan generation did not include a batch job id');
    }

    const timeoutAt = Date.now() + 60_000;
    while (Date.now() < timeoutAt) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const jobResponse = await fetch(`${baseUrl}/v1/batch-jobs/${jobId}`, {
        headers: {
          'x-correlation-id': jobId,
          'x-user-id': userId,
        },
      });
      if (!jobResponse.ok) {
        throw new BusinessRuleError('Failed to poll queued lesson plan generation job', {
          jobId,
          status: jobResponse.status,
        });
      }
      const body = (await jobResponse.json()) as { data?: { job?: { status?: string; result?: Record<string, unknown>; errorMessage?: string | null } } };
      const job = body.data?.job;
      if (!job) continue;
      if (job.status === 'completed' && job.result) {
        return job.result as {
          goals?: Array<Record<string, unknown>>;
          steps?: IPlannedStepInput[];
          topic?: string;
          rationale?: string;
        };
      }
      if (job.status === 'failed' || job.status === 'cancelled') {
        throw new BusinessRuleError('Queued lesson plan generation failed', {
          jobId,
          status: job.status,
          errorMessage: job.errorMessage,
        });
      }
    }

    throw new BusinessRuleError('Queued lesson plan generation timed out', { jobId });
  }

  private assertLessonPlanServesCurriculumSlice(record: ICreateLessonPlanRecord): void {
    if (record.selectedNodeIds.length === 0) {
      throw new BusinessRuleError('LessonPlan must select at least one curriculum node', {
        lessonPlanId: record.id,
        sessionId: record.sessionId,
      });
    }
    const servedConceptRefs = new Set(record.steps.flatMap((step) => step.conceptRefs));
    if (servedConceptRefs.size === 0) {
      throw new BusinessRuleError(
        'LessonPlan steps must carry canonical concept refs for selected curriculum nodes',
        {
          lessonPlanId: record.id,
          selectedNodeIds: record.selectedNodeIds,
        }
      );
    }
  }

  private async assertOwnsStep(step: IStep, ctx: IExecutionContext): Promise<void> {
    if (step.userId !== ctx.userId) {
      throw new AuthorizationError('Step belongs to another user');
    }
  }

  private assertOwnsSession(session: ISession, ctx: IExecutionContext): void {
    if (session.userId !== ctx.userId) {
      throw new AuthorizationError('Session belongs to another user');
    }
  }

  private stepPayload(step: IStep): Record<string, unknown> {
    return {
      stepId: step.id,
      lessonPlanId: step.lessonPlanId,
      sessionId: step.sessionId,
      userId: step.userId,
    };
  }

  private stepAnsweredPayload(
    step: IStep,
    evaluationId: EvaluationId,
    correct: boolean,
    selfRating: StepSelfRating,
    trace: ISevenFrameTraceDto,
    response: unknown,
    responseTimeMs?: number,
    selectedNodeIds: ILessonPlan['selectedNodeIds'] = []
  ): Record<string, unknown> {
    return {
      ...this.stepPayload(step),
      evaluationId,
      conceptRefs: step.conceptRefs,
      selectedNodeIds,
      correct,
      selfRating,
      trace,
      learnerAnswerSummaryText: this.buildLearnerAnswerSummary(response, step.activities?.[0]),
      responseShape: describeResponseShape(response),
      ...(responseTimeMs !== undefined ? { responseTimeMs } : {}),
      studyMode: step.studyMode,
      epistemicMode: step.selectedMode,
      transformation: step.transformationType,
    };
  }

  private buildLearnerAnswerSummary(response: unknown, activity?: { expectedResponseType?: string }): string {
    const shape = describeResponseShape(response);
    if (response === undefined || response === null) {
      return 'The learner did not submit a visible response payload.';
    }
    if (typeof response === 'string') {
      const trimmed = response.trim();
      return trimmed.length > 0
        ? `The learner answered: "${truncateText(trimmed, 700)}"`
        : 'The learner submitted an empty text response.';
    }
    if (typeof response === 'number' || typeof response === 'boolean') {
      return `The learner answered with ${String(response)}.`;
    }
    if (Array.isArray(response)) {
      const values = response.map(readableValue).filter((value) => value.length > 0).slice(0, 8);
      return values.length > 0
        ? `The learner selected or supplied: ${values.join(', ')}.`
        : 'The learner submitted an array response with no readable values.';
    }
    if (isRecord(response)) {
      const preferred = ['answer', 'text', 'value', 'choice', 'selected', 'explanation']
        .map((key) => response[key])
        .find((value) => value !== undefined);
      if (preferred !== undefined) {
        return `The learner answered: ${readableValue(preferred)}.`;
      }
      const entries = Object.entries(response)
        .filter(([, value]) => value !== undefined && value !== null)
        .slice(0, 6)
        .map(([key, value]) => `${humanizeKey(key)}: ${readableValue(value)}`);
      if (entries.length > 0) {
        return `The learner submitted a ${activity?.expectedResponseType ?? shape} response with ${entries.join('; ')}.`;
      }
    }
    return `The learner submitted a ${shape} response that could not be summarized deterministically.`;
  }

  private buildRubricSummary(step: IStep, activity?: { expectedResponseType?: string }): IRubricSummaryRecordDto {
    const expectedAnswerShapeText = activity?.expectedResponseType
      ? `Expected response shape: ${humanizeKey(activity.expectedResponseType)}.`
      : `Expected response shape follows evaluation type: ${humanizeKey(step.evaluationType)}.`;
    return {
      stepId: step.id,
      rubricSummaryText: `A complete answer should satisfy this expected outcome: ${step.expectedOutcome}`,
      successCriteriaText: [
        `Address the Step objective: ${step.objective}`,
        `Match the expected outcome: ${step.expectedOutcome}`,
        expectedAnswerShapeText,
      ],
      commonFailureModesText: commonFailureModesFor(step.evaluationType),
      expectedAnswerShapeText,
      rubricVersion: 'step-rubric-summary.v1',
      authority: 'deterministic_projection',
    };
  }

  private validateStepEvidenceReadiness(
    step: IStep,
    artifact: IStepAnswerArtifact | null
  ): IEvidenceCompletenessDto {
    const missingRequiredFields: string[] = [];
    const missingOptionalFields: string[] = [];
    if (!step.objective.trim()) missingRequiredFields.push('stepObjectiveText');
    if (!step.expectedOutcome.trim()) missingRequiredFields.push('expectedOutcomeText');
    if (!step.activities?.[0]?.prompt?.trim()) missingRequiredFields.push('activityPromptText');
    if (artifact === null) missingRequiredFields.push('learnerAnswerSummaryText');
    if (step.answeredAt === null) missingOptionalFields.push('answeredAt');
    if (artifact?.responseTimeMs === null || artifact?.responseTimeMs === undefined) {
      missingOptionalFields.push('responseTimeMs');
    }
    return {
      state: missingRequiredFields.length > 0 ? 'missing_required' : missingOptionalFields.length > 0 ? 'partial' : 'complete',
      missingRequiredFields,
      missingOptionalFields,
      notes:
        artifact === null
          ? ['Step exists, but no answer artifact has been recorded yet.']
          : ['Step evidence record is derived from session-owned Step and answer artifact data.'],
    };
  }

  private assertSameStringSet(
    field: string,
    expected: readonly string[],
    actual: readonly string[]
  ): void {
    const expectedSet = new Set(expected);
    const actualSet = new Set(actual);
    if (
      expectedSet.size !== actualSet.size ||
      [...expectedSet].some((value) => !actualSet.has(value))
    ) {
      throw new BusinessRuleError(`Evaluation event ${field} does not match Step context`, {
        field,
        expected,
        actual,
      });
    }
  }

  private assertSameValue(field: string, expected: unknown, actual: unknown): void {
    if (expected !== actual) {
      throw new BusinessRuleError(`Evaluation event ${field} does not match Step context`, {
        field,
        expected,
        actual,
      });
    }
  }

  private async transitionSession(
    session: ISession,
    nextState: SessionLifecycleState,
    ctx: IExecutionContext,
    tx: Prisma.TransactionClient
  ): Promise<ISession> {
    if (session.lifecycleState === nextState) return session;
    const updated = await this.repository.updateSession(
      session.id,
      {
        lifecycleState: nextState,
        lastActivityAt: isoNow(),
      },
      session.version,
      tx
    );
    await this.enqueueEvent(
      'session.lifecycle.transitioned',
      'Session',
      session.id,
      {
        sessionId: session.id,
        userId: session.userId,
        previousState: session.lifecycleState,
        newState: nextState,
        transitionedAt: isoNow(),
      },
      ctx,
      tx
    );
    return updated;
  }

  private async runInTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => fn(tx));
  }

  private async enqueueEvent(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: unknown,
    ctx: IExecutionContext,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const event: IOutboxEventInput = {
      id: id<EventId>(ID_PREFIXES.EventId),
      eventType,
      aggregateType,
      aggregateId,
      payload,
      metadata: {
        correlationId: ctx.correlationId,
        userId: ctx.userId,
      },
    };

    await this.outboxRepository.enqueue(event, tx);
    if (tx !== undefined) return;

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
      await this.outboxRepository.markFailed(event.id, message);
      throw new OutboxDispatchError('Failed to publish outbox event', {
        eventId: event.id,
        eventType: event.eventType,
        error: message,
      });
    }
  }

  private getOfflineTokenKey(): Uint8Array {
    const keyId = this.options.security.offlineIntentTokenActiveKeyId;
    const secret = this.options.security.offlineIntentTokenKeys[keyId];
    if (!secret) {
      throw new BusinessRuleError(`Offline intent token key not configured: ${keyId}`);
    }
    return new TextEncoder().encode(secret);
  }
}
