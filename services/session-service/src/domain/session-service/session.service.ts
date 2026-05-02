/**
 * @noema/session-service - Step-first session application service.
 */

import { SignJWT, jwtVerify } from 'jose';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';

import {
  EpistemicMode,
  GoalState,
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
import type { IMetacognitionEvaluationPort } from './metacognition-evaluation.port.js';
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
  type IStepLoopSnapshot,
} from '../../types/index.js';

export interface IExecutionContext {
  userId: UserId;
  correlationId: CorrelationId;
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
  metacognitionClient?: IMetacognitionEvaluationPort;
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

export class SessionService {
  private readonly logger: Logger;
  private readonly options: ISessionServiceOptions;
  private readonly metacognitionClient: IMetacognitionEvaluationPort;
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
    this.metacognitionClient =
      options?.metacognitionClient ??
      ({
        recordStepEvaluation: async () => {
          throw new BusinessRuleError('Metacognition evaluation client is not configured');
        },
      } satisfies IMetacognitionEvaluationPort);
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
  ): Promise<IServiceResult<{ lessonPlan: ILessonPlan; steps: IStep[] }>> {
    const parsed = CreateLessonPlanInputSchema.safeParse(input ?? {});
    if (!parsed.success) throw validationError(parsed.error);

    const session = await this.repository.getSessionById(sessionIdValue as SessionId);
    this.assertOwnsSession(session, ctx);

    const existing = await this.repository.findLessonPlanBySessionId(session.id);
    if (existing) {
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

      return { lessonPlan: activated, steps: createdPlan.steps };
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
  ): Promise<IServiceResult<IStep | null>> {
    const session = await this.repository.getSessionById(sessionIdValue as SessionId);
    this.assertOwnsSession(session, ctx);
    const item = await this.repository.findNextQueueItem(session.id);
    return result(item?.step ?? null, item?.step ? 'Next Step found.' : 'No pending Step found.');
  }

  async presentStep(stepIdValue: string, ctx: IExecutionContext): Promise<IServiceResult<IStep>> {
    const step = await this.repository.getStepById(stepIdValue as StepId);
    await this.assertOwnsStep(step, ctx);
    if (step.status === StepStatus.EVALUATED) {
      throw new BusinessRuleError('Evaluated Steps are immutable', { stepId: step.id });
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
    if (step.status === StepStatus.EVALUATED) {
      throw new BusinessRuleError('Evaluated Steps are immutable', { stepId: step.id });
    }

    const evaluationId = parsed.data.evaluationId ?? id<EvaluationId>(ID_PREFIXES.EvaluationId);
    if (step.conceptRefs.length === 0) {
      throw new BusinessRuleError('Cannot evaluate a Step without concept references', {
        stepId: step.id,
      });
    }

    let session = await this.repository.getSessionById(step.sessionId);
    if (session.lifecycleState !== SessionLifecycleState.DIAGNOSIS) {
      session = await this.runInTransaction(async (tx) => {
        return this.transitionSession(session, SessionLifecycleState.DIAGNOSIS, ctx, tx);
      });
    }

    const metacognitionEvaluation = await this.metacognitionClient.recordStepEvaluation({
      evaluationId: evaluationId as EvaluationId,
      stepId: step.id,
      lessonPlanId: step.lessonPlanId,
      sessionId: step.sessionId,
      userId: step.userId,
      conceptRefs: step.conceptRefs,
      epistemicMode: step.selectedMode,
      correct: parsed.data.correct,
      selfRating: parsed.data.selfRating,
      trace: parsed.data.trace,
      ...(parsed.data.responseTimeMs !== undefined
        ? { responseTimeMs: parsed.data.responseTimeMs }
        : {}),
      studyMode: session.studyMode,
      transformation: step.transformationType,
    });

    const evaluated = await this.runInTransaction(async (tx) => {
      const updated = await this.repository.markStepAnsweredAndEvaluated(
        step.id,
        metacognitionEvaluation.evaluationId,
        tx
      );
      if (session.lifecycleState !== SessionLifecycleState.EVALUATION) {
        await this.transitionSession(session, SessionLifecycleState.EVALUATION, ctx, tx);
      }
      await this.enqueueEvent(
        'step.answered',
        'Step',
        updated.id,
        this.stepPayload(updated),
        ctx,
        tx
      );
      await this.enqueueEvent(
        'step.evaluated',
        'Step',
        updated.id,
        this.stepPayload(updated),
        ctx,
        tx
      );
      return updated;
    });

    return result(evaluated, 'Step answer accepted and Step marked EVALUATED.');
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
    const next = await this.repository.findNextQueueItem(session.id);
    return result(
      { session, lessonPlan, nextStep: next?.step ?? null },
      'Step-loop snapshot fetched.'
    );
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

    const activityInput: IPlannedActivityInput | undefined = plannedStep?.activities?.[0];
    const stepInput: IPlannedStepInput = plannedStep ?? {
      objective: `Review ${topic}`,
      expectedOutcome: `Learner can explain the core idea of ${topic}.`,
      conceptRefs: (input.selectedNodeIds ?? []) as never,
    };

    return {
      id: lessonPlanId,
      sessionId: session.id,
      userId: session.userId,
      curriculumId: input.curriculumId ?? session.curriculumId,
      curriculumVersionId:
        input.curriculumVersionId ??
        session.curriculumVersionId ??
        ('cver_maintenance_system' as never),
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
      steps: [
        {
          id: stepId,
          lessonPlanId,
          sessionId: session.id,
          userId: session.userId,
          studyMode: session.studyMode,
          position: 0,
          objective: stepInput.objective,
          servesGoalIds: stepInput.servesGoalIds ?? [],
          eligibleModes: stepInput.eligibleModes ?? [EpistemicMode.GENERATIVE_RETRIEVAL],
          selectedMode: stepInput.selectedMode ?? EpistemicMode.GENERATIVE_RETRIEVAL,
          transformationType: stepInput.transformationType ?? TransformationType.RECALL,
          expectedOutcome: stepInput.expectedOutcome,
          evaluationType: stepInput.evaluationType ?? 'self_explanation',
          difficulty: stepInput.difficulty ?? 0.5,
          isRepair: stepInput.isRepair ?? false,
          conceptRefs: stepInput.conceptRefs ?? [],
          variantSeed: stepInput.variantSeed ?? variantSeed,
          status: StepStatus.PLANNED,
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

    const response = await fetch(this.options.lessonPlanAgentUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.id,
        userId: session.userId,
        studyMode: session.studyMode,
        learningMode: session.learningMode,
        ...input,
      }),
    });

    if (!response.ok) {
      throw new BusinessRuleError('Full LessonPlan generation agent rejected the request', {
        status: response.status,
      });
    }

    const generated = (await response.json()) as { steps?: IPlannedStepInput[]; topic?: string };
    return this.minimalLessonPlanFactory(session, {
      ...input,
      rigorLevel: RigorLevel.FULL,
      topic: generated.topic ?? input.topic,
      steps: generated.steps ?? input.steps,
    });
  }

  private assertLessonPlanServesCurriculumSlice(record: ICreateLessonPlanRecord): void {
    if (record.selectedNodeIds.length === 0) return;
    const servedNodes = new Set(record.steps.flatMap((step) => step.conceptRefs));
    const hasServedSelectedNode = record.selectedNodeIds.some((nodeId) =>
      servedNodes.has(nodeId as never)
    );
    if (!hasServedSelectedNode) {
      throw new BusinessRuleError(
        'LessonPlan steps must serve at least one selected curriculum node',
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
