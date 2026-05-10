import { afterEach, describe, expect, it, vi } from 'vitest';
import pino from 'pino';

import {
  GoalState,
  GoalType,
  LearningMode,
  SessionLifecycleState,
  StepStatus,
  StepSelfRating,
  StudyMode,
  type EvaluationId,
  type GoalId,
  type LessonPlanId,
  type SessionId,
  type StepId,
  type UserId,
} from '@noema/types';

import {
  SessionService,
  type IExecutionContext,
} from '../../../src/domain/session-service/session.service.js';
import type {
  ICreateLessonPlanRecord,
  IMarkStepAnsweredResult,
  ISessionRepository,
} from '../../../src/domain/session-service/session.repository.js';
import type { IPedagogyGuardianPort } from '../../../src/domain/session-service/pedagogy-guardian.port.js';
import type {
  IOutboxEventInput,
  IOutboxRepository,
} from '../../../src/domain/session-service/outbox.repository.js';
import type {
  ICreateGoalInput,
  ILessonPlan,
  ILessonPlanGoal,
  ISession,
  IStep,
  IStepAnswerArtifact,
  IStepQueueItem,
} from '../../../src/types/index.js';

class InMemoryRepository implements ISessionRepository {
  sessions = new Map<string, ISession>();
  lessonPlans = new Map<string, ILessonPlan>();
  goals = new Map<string, ILessonPlanGoal>();
  steps = new Map<string, IStep>();
  answerArtifacts = new Map<string, IStepAnswerArtifact>();
  feedbackActions: Array<import('../../../src/types/index.js').ILearnerFeedbackAction> = [];
  surfaceExposures: Array<import('../../../src/types/index.js').IAgentSurfaceExposure> = [];
  queue = new Map<string, IStepQueueItem>();
  lifecycleUpdates: SessionLifecycleState[] = [];

  async findSessionById(id: SessionId): Promise<ISession | null> {
    return this.sessions.get(id) ?? null;
  }

  async getSessionById(id: SessionId): Promise<ISession> {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Missing session ${id}`);
    return session;
  }

  async findSessionsByUser(userId: UserId): Promise<{ sessions: ISession[]; total: number }> {
    const sessions = [...this.sessions.values()].filter((session) => session.userId === userId);
    return { sessions, total: sessions.length };
  }

  async createSession(session: Omit<ISession, 'createdAt' | 'updatedAt'>): Promise<ISession> {
    const created = {
      ...session,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(created.id, created);
    return created;
  }

  async updateSession(
    id: SessionId,
    data: Partial<ISession>,
    _expectedVersion: number
  ): Promise<ISession> {
    const current = await this.getSessionById(id);
    const updated = {
      ...current,
      ...data,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    if (data.lifecycleState !== undefined) this.lifecycleUpdates.push(data.lifecycleState);
    this.sessions.set(id, updated);
    return updated;
  }

  async findLessonPlanById(id: LessonPlanId): Promise<ILessonPlan | null> {
    return this.lessonPlans.get(id) ?? null;
  }

  async findLessonPlanBySessionId(sessionId: SessionId): Promise<ILessonPlan | null> {
    return [...this.lessonPlans.values()].find((plan) => plan.sessionId === sessionId) ?? null;
  }

  async findGoalsByLessonPlanId(lessonPlanId: LessonPlanId): Promise<ILessonPlanGoal[]> {
    return [...this.goals.values()].filter((goal) => goal.lessonPlanId === lessonPlanId);
  }

  async createLessonPlanWithSteps(
    plan: ICreateLessonPlanRecord
  ): Promise<{ lessonPlan: ILessonPlan; goals: ILessonPlanGoal[]; steps: IStep[] }> {
    const now = new Date().toISOString();
    const lessonPlan = { ...plan, createdAt: now, updatedAt: now };
    this.lessonPlans.set(lessonPlan.id, lessonPlan);
    const goals = plan.goals.map((goal) => {
      const created = {
        ...goal,
        createdAt: now,
        updatedAt: now,
      } as ILessonPlanGoal;
      this.goals.set(created.id, created);
      return created;
    });
    const steps = plan.steps.map((step) => {
      const created = {
        ...step,
        createdAt: now,
        updatedAt: now,
        activities: step.activities.map((activity) => ({
          ...activity,
          createdAt: now,
          updatedAt: now,
        })),
      } as IStep;
      this.steps.set(created.id, created);
      this.queue.set(created.id, {
        id: `queue-${created.id}`,
        sessionId: created.sessionId,
        stepId: created.id,
        position: created.position,
        status: 'pending',
        injectedBy: null,
        reason: null,
        createdAt: now,
        updatedAt: now,
        step: created,
      });
      return created;
    });
    return { lessonPlan, goals, steps };
  }

  async activateLessonPlan(id: LessonPlanId): Promise<ILessonPlan> {
    const plan = this.lessonPlans.get(id)!;
    this.lessonPlans.set(id, plan);
    return plan;
  }

  async countActiveGoals(lessonPlanId: LessonPlanId): Promise<number> {
    return [...this.goals.values()].filter(
      (goal) => goal.lessonPlanId === lessonPlanId && goal.state === GoalState.ACTIVE
    ).length;
  }

  async createGoal(
    lessonPlanId: LessonPlanId,
    goalId: GoalId,
    input: ICreateGoalInput
  ): Promise<ILessonPlanGoal> {
    const now = new Date().toISOString();
    const goal = {
      id: goalId,
      lessonPlanId,
      description: input.description,
      type: input.type,
      parentGoalId: input.parentGoalId ?? null,
      state: input.state ?? GoalState.PENDING,
      source: input.source ?? 'user_accepted',
      conceptRefs: input.conceptRefs ?? [],
      createdAt: now,
      updatedAt: now,
    } as ILessonPlanGoal;
    this.goals.set(goal.id, goal);
    return goal;
  }

  async findStepById(id: StepId): Promise<IStep | null> {
    return this.steps.get(id) ?? null;
  }

  async getStepById(id: StepId): Promise<IStep> {
    const step = this.steps.get(id);
    if (!step) throw new Error(`Missing step ${id}`);
    return step;
  }

  async findStepsBySessionId(sessionId: SessionId): Promise<IStep[]> {
    return [...this.steps.values()]
      .filter((step) => step.sessionId === sessionId)
      .sort((a, b) => a.position - b.position);
  }

  async findNextQueueItem(sessionId: SessionId): Promise<IStepQueueItem | null> {
    return (
      [...this.queue.values()]
        .filter(
          (item) => item.sessionId === sessionId && ['pending', 'injected'].includes(item.status)
        )
        .sort((a, b) => a.position - b.position)[0] ?? null
    );
  }

  async findCurrentOrNextQueueItem(sessionId: SessionId): Promise<IStepQueueItem | null> {
    return (
      [...this.queue.values()]
        .filter(
          (item) =>
            item.sessionId === sessionId &&
            ['presented', 'pending', 'injected'].includes(item.status)
        )
        .sort((a, b) => a.position - b.position)[0] ?? null
    );
  }

  async markStepPresented(stepId: StepId): Promise<IStep> {
    const step = await this.getStepById(stepId);
    const updated = {
      ...step,
      status: StepStatus.PRESENTED,
      presentedAt: new Date().toISOString(),
    };
    this.steps.set(stepId, updated);
    this.queue.set(stepId, { ...this.queue.get(stepId)!, status: 'presented', step: updated });
    return updated;
  }

  async markStepAnswered(stepId: StepId): Promise<IMarkStepAnsweredResult> {
    const step = await this.getStepById(stepId);
    if (step.status === StepStatus.ANSWERED || step.status === StepStatus.EVALUATED) {
      return { step, transitioned: false };
    }
    if (step.status !== StepStatus.PRESENTED) {
      return { step, transitioned: false };
    }
    const now = new Date().toISOString();
    const updated = {
      ...step,
      status: StepStatus.ANSWERED,
      answeredAt: now,
    };
    this.steps.set(stepId, updated);
    this.queue.set(stepId, { ...this.queue.get(stepId)!, status: 'presented', step: updated });
    return { step: updated, transitioned: true };
  }

  async upsertStepAnswerArtifact(input: {
    id: string;
    stepId: StepId;
    userId: UserId;
    responseShape: string;
    learnerAnswerSummaryText: string;
    rawResponse: unknown;
    rawResponseRef: string;
    responseTimeMs?: number;
    hintRequestCount?: number;
    revisionCount?: number;
  }): Promise<IStepAnswerArtifact> {
    const now = new Date().toISOString();
    const artifact: IStepAnswerArtifact = {
      id: input.id,
      stepId: input.stepId,
      userId: input.userId,
      responseShape: input.responseShape,
      learnerAnswerSummaryText: input.learnerAnswerSummaryText,
      rawResponse: input.rawResponse,
      rawResponseRef: input.rawResponseRef,
      responseTimeMs: input.responseTimeMs ?? null,
      hintRequestCount: input.hintRequestCount ?? 0,
      revisionCount: input.revisionCount ?? 0,
      recordedAt: now,
      updatedAt: now,
    };
    this.answerArtifacts.set(input.stepId, artifact);
    return artifact;
  }

  async findStepAnswerArtifactByStepId(stepId: StepId): Promise<IStepAnswerArtifact | null> {
    return this.answerArtifacts.get(stepId) ?? null;
  }

  async recordLearnerFeedbackAction(input: Parameters<ISessionRepository['recordLearnerFeedbackAction']>[0]) {
    const action = {
      ...input,
      createdAt: new Date().toISOString(),
      metadata: input.metadata ?? {},
    };
    this.feedbackActions.unshift(action);
    return action;
  }

  async findLearnerFeedbackActions(query: Parameters<ISessionRepository['findLearnerFeedbackActions']>[0]) {
    return this.feedbackActions
      .filter((action) => action.userId === query.userId)
      .filter((action) => query.surface === undefined || action.surface === query.surface)
      .slice(0, query.limit);
  }

  async recordAgentSurfaceExposure(input: Parameters<ISessionRepository['recordAgentSurfaceExposure']>[0]) {
    const exposure = {
      ...input,
      shownAt: new Date().toISOString(),
      metadata: input.metadata ?? {},
    };
    this.surfaceExposures.unshift(exposure);
    return exposure;
  }

  async findAgentSurfaceExposures(query: Parameters<ISessionRepository['findAgentSurfaceExposures']>[0]) {
    return this.surfaceExposures
      .filter((exposure) => exposure.userId === query.userId)
      .filter((exposure) => query.sessionId === undefined || exposure.sessionId === query.sessionId)
      .filter((exposure) => query.surfaces === undefined || query.surfaces.includes(exposure.surface))
      .slice(0, query.limit);
  }

  async markStepEvaluatedIfPending(stepId: StepId, evaluationId: string): Promise<IStep | null> {
    const step = await this.getStepById(stepId);
    if (step.status !== StepStatus.ANSWERED) {
      return null;
    }
    const now = new Date().toISOString();
    const updated = {
      ...step,
      status: StepStatus.EVALUATED,
      evaluationId: evaluationId as never,
      answeredAt: step.answeredAt ?? now,
      evaluatedAt: now,
    };
    this.steps.set(stepId, updated);
    this.queue.set(stepId, { ...this.queue.get(stepId)!, status: 'completed', step: updated });
    return updated;
  }

  async markStepSkipped(stepId: StepId, reason: string | null): Promise<IStep> {
    const step = await this.getStepById(stepId);
    const updated = { ...step, status: StepStatus.SKIPPED };
    this.steps.set(stepId, updated);
    this.queue.set(stepId, {
      ...this.queue.get(stepId)!,
      status: 'skipped',
      reason,
      step: updated,
    });
    return updated;
  }

  async createSteps(steps: ICreateLessonPlanRecord['steps']): Promise<IStep[]> {
    return steps.map((step) => this.steps.get(step.id)!).filter(Boolean);
  }

  async markStepsSuperseded(
    replacements: { stepId: StepId; supersededByStepId: StepId }[]
  ): Promise<void> {
    for (const replacement of replacements) {
      const current = await this.getStepById(replacement.stepId);
      this.steps.set(replacement.stepId, {
        ...current,
        status: StepStatus.SUPERSEDED,
        supersededByStepId: replacement.supersededByStepId,
      });
    }
    return undefined;
  }
}

function makeService(
  repo: InMemoryRepository,
  guardian?: IPedagogyGuardianPort,
  outboxEvents: IOutboxEventInput[] = []
): SessionService {
  const outbox: IOutboxRepository = {
    enqueue: async (event) => {
      outboxEvents.push(event);
      return {
        ...event,
        publishedAt: null,
        attempts: 0,
        lastError: null,
        claimOwner: null,
        claimUntil: null,
        nextAttemptAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
    enqueueBatch: async (events) => {
      outboxEvents.push(...events);
    },
    listPending: async () => [],
    claimPending: async () => [],
    releaseClaims: async () => 0,
    markPublished: async () => undefined,
    markPublishedClaimed: async () => undefined,
    markFailed: async () => undefined,
    markFailedClaimed: async () => undefined,
    markDeadLettered: async () => undefined,
  };

  return new SessionService(
    repo,
    { publish: async () => undefined, publishBatch: async () => undefined },
    outbox,
    { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}) } as never,
    pino({ level: 'silent' }),
    {
      ...(guardian !== undefined ? { pedagogyGuardianClient: guardian } : {}),
    }
  );
}

describe('session Step loop', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a minimal plan, presents a Step, answers it, and finalizes asynchronously', async () => {
    const repo = new InMemoryRepository();
    const service = makeService(repo);
    const ctx: IExecutionContext = {
      userId: 'user_test' as UserId,
      correlationId: 'correlation_test' as never,
    };

    const sessionResult = await service.startSession(
      {
        curriculumId: 'curr_123456789012345678901',
        curriculumVersionId: 'cver_123456789012345678901',
        studyMode: StudyMode.KNOWLEDGE_GAINING,
        learningMode: LearningMode.EXPLORATION,
        topic: 'Bayes theorem',
      },
      ctx
    );

    expect(sessionResult.data.lifecycleState).toBe(SessionLifecycleState.PLANNING);

    const planResult = await service.createLessonPlan(
      sessionResult.data.id,
      {
        rigorLevel: 'minimal',
        topic: 'Bayes theorem',
        selectedNodeIds: ['cnode_123456789012345678901'] as never,
        steps: [
          {
            objective: 'Explain Bayes theorem',
            expectedOutcome: 'Learner can explain Bayesian updating',
            conceptRefs: ['concept_123456789012345678901'],
          },
        ],
      },
      ctx
    );

    expect(planResult.data.steps).toHaveLength(1);

    const goalResult = await service.createGoal(
      planResult.data.lessonPlan.id,
      {
        description: 'Explain Bayesian updating',
        type: GoalType.REASONING,
        state: GoalState.ACTIVE,
        conceptRefs: ['concept_123456789012345678901'],
      },
      ctx
    );

    expect(goalResult.data.state).toBe(GoalState.ACTIVE);

    const nextStep = await service.getNextStep(sessionResult.data.id, ctx);
    expect(nextStep.data.nextStep?.objective).toContain('Bayes theorem');
    expect(nextStep.data.nextStep?.status).toBe(StepStatus.QUEUED);

    const presented = await service.presentStep(nextStep.data.nextStep!.id, ctx);
    expect(presented.data.status).toBe(StepStatus.PRESENTED);

    const answered = await service.answerStep(
      nextStep.data.nextStep!.id,
      {
        response: 'Posterior odds update prior odds by the likelihood ratio.',
        correct: true,
        selfRating: StepSelfRating.KNEW_IT,
        trace: {
          frames: {
            f0: { score: 0.8, notes: 'goal clear' },
            f1: { score: 0.8, notes: 'prompt parsed' },
            f2: { score: 0.8, notes: 'diagnostic cue selected' },
            f3: { score: 0.8, notes: 'retrieved prior odds formulation' },
            f4: { score: 0.8, notes: 'applied likelihood-ratio transformation' },
            f5: { score: 0.8, notes: 'checked response before submit' },
            f6: { score: 0.8, notes: 'attributed outcome to Bayesian updating' },
          },
        },
      },
      ctx
    );

    expect(answered.data.status).toBe(StepStatus.ANSWERED);
    expect(answered.data.evaluationId).toBeNull();
    const evidence = await service.getStepEvidenceRecord(answered.data.id, ctx);
    expect(evidence.data.stepObjectiveText).toBe('Explain Bayes theorem');
    expect(evidence.data.learnerAnswerSummaryText).toContain('Posterior odds update');
    expect(evidence.data.rubricSummary.rubricSummaryText).toContain('Bayesian updating');
    expect(evidence.data.evidenceCompleteness.state).toBe('partial');
    const rubric = await service.getStepRubricSummary(answered.data.id, ctx);
    expect(rubric.data.successCriteriaText).toContain('Address the Step objective: Explain Bayes theorem');
    const activityContext = await service.getStepActivityContext(answered.data.id, ctx);
    expect(activityContext.data.activityPromptText).toContain('Explain Bayes theorem');
    expect(activityContext.data.contentAnchorSummaries[0]?.expectedUseText).toContain(
      'Explain Bayes theorem'
    );
    const curriculumAnchor = await service.getStepCurriculumAnchor(answered.data.id, ctx);
    expect(curriculumAnchor.data.curriculumAnchorText).toContain('Bayes theorem');
    expect(curriculumAnchor.data.selectedNodeIds).toEqual(['cnode_123456789012345678901']);
    expect(repo.lifecycleUpdates).toContain(SessionLifecycleState.DIAGNOSIS);
    expect((await repo.getSessionById(sessionResult.data.id)).lifecycleState).toBe(
      SessionLifecycleState.DIAGNOSIS
    );

    const finalized = await service.finalizeStepEvaluation(
      {
        evaluationId: 'eval_123456789012345678901' as EvaluationId,
        stepId: answered.data.id,
        sessionId: answered.data.sessionId,
        userId: answered.data.userId,
        conceptRefs: answered.data.conceptRefs,
        selectedNodeIds: ['cnode_123456789012345678901'] as never,
        reasoningQuality: 0.8,
        confidenceSignal: 1,
        combinedScore: 0.9,
        correct: true,
        studyMode: answered.data.studyMode,
        epistemicMode: answered.data.selectedMode,
        transformation: answered.data.transformationType,
      },
      ctx
    );

    expect(finalized?.status).toBe(StepStatus.EVALUATED);
    expect(finalized?.evaluationId).toBe('eval_123456789012345678901');
    expect((await repo.getSessionById(sessionResult.data.id)).lifecycleState).toBe(
      SessionLifecycleState.EVALUATION
    );

    const completed = await service.completeSession(
      sessionResult.data.id,
      { reason: 'completed_normally' },
      ctx
    );
    expect(completed.data.lifecycleState).toBe(SessionLifecycleState.COMPLETION);
    expect(completed.data.completedAt).toEqual(expect.any(String));
    expect(completed.data.terminationReason).toBe('completed_normally');
  });

  it('returns the current answered Step on repeat submissions before evaluation completes', async () => {
    const repo = new InMemoryRepository();
    const outboxEvents: IOutboxEventInput[] = [];
    const service = makeService(repo, undefined, outboxEvents);
    const ctx: IExecutionContext = {
      userId: 'user_test' as UserId,
      correlationId: 'correlation_test' as never,
    };

    const sessionResult = await service.startSession(
      {
        curriculumId: 'curr_123456789012345678901',
        curriculumVersionId: 'cver_123456789012345678901',
        studyMode: StudyMode.KNOWLEDGE_GAINING,
        learningMode: LearningMode.EXPLORATION,
        topic: 'Bayes theorem',
      },
      ctx
    );

    await service.createLessonPlan(
      sessionResult.data.id,
      {
        rigorLevel: 'minimal',
        topic: 'Bayes theorem',
        selectedNodeIds: ['cnode_123456789012345678901'] as never,
        steps: [
          {
            objective: 'Explain Bayes theorem',
            expectedOutcome: 'Learner can explain Bayesian updating',
            conceptRefs: ['concept_123456789012345678901'],
          },
        ],
      },
      ctx
    );

    const snapshot = await service.getNextStep(sessionResult.data.id, ctx);
    const stepId = snapshot.data.nextStep!.id;
    await service.presentStep(stepId, ctx);

    const first = await service.answerStep(
      stepId,
      {
        correct: false,
        selfRating: StepSelfRating.HESITATED,
        trace: {
          frames: {
            f0: { score: 0.6, notes: 'goal clear' },
            f1: { score: 0.6, notes: 'prompt parsed' },
            f2: { score: 0.6, notes: 'cue selected' },
            f3: { score: 0.6, notes: 'retrieval partial' },
            f4: { score: 0.6, notes: 'transformation partial' },
            f5: { score: 0.6, notes: 'confidence moderate' },
            f6: { score: 0.6, notes: 'outcome uncertain' },
          },
        },
      },
      ctx
    );
    const second = await service.answerStep(
      stepId,
      {
        correct: false,
        selfRating: StepSelfRating.HESITATED,
        trace: {
          frames: {
            f0: { score: 0.6, notes: 'goal clear' },
            f1: { score: 0.6, notes: 'prompt parsed' },
            f2: { score: 0.6, notes: 'cue selected' },
            f3: { score: 0.6, notes: 'retrieval partial' },
            f4: { score: 0.6, notes: 'transformation partial' },
            f5: { score: 0.6, notes: 'confidence moderate' },
            f6: { score: 0.6, notes: 'outcome uncertain' },
          },
        },
      },
      ctx
    );

    expect(first.data.status).toBe(StepStatus.ANSWERED);
    expect(second.data.status).toBe(StepStatus.ANSWERED);
    expect(second.data.answeredAt).toBe(first.data.answeredAt);
    expect(outboxEvents.filter((event) => event.eventType === 'step.answered')).toHaveLength(1);
  });

  it('rejects answers until a queued step has been presented', async () => {
    const repo = new InMemoryRepository();
    const service = makeService(repo);
    const ctx: IExecutionContext = {
      userId: 'user_test' as UserId,
      correlationId: 'correlation_test' as never,
    };

    const sessionResult = await service.startSession(
      {
        curriculumId: 'curr_123456789012345678901',
        curriculumVersionId: 'cver_123456789012345678901',
        studyMode: StudyMode.KNOWLEDGE_GAINING,
        learningMode: LearningMode.EXPLORATION,
        topic: 'Bayes theorem',
      },
      ctx
    );

    await service.createLessonPlan(
      sessionResult.data.id,
      {
        rigorLevel: 'minimal',
        topic: 'Bayes theorem',
        selectedNodeIds: ['cnode_123456789012345678901'] as never,
        steps: [
          {
            objective: 'Explain Bayes theorem',
            expectedOutcome: 'Learner can explain Bayesian updating',
            conceptRefs: ['concept_123456789012345678901'],
          },
        ],
      },
      ctx
    );

    const snapshot = await service.getNextStep(sessionResult.data.id, ctx);

    await expect(
      service.answerStep(
        snapshot.data.nextStep!.id,
        {
          correct: false,
          selfRating: StepSelfRating.HESITATED,
          trace: {
            frames: {
              f0: { score: 0.6, notes: 'goal clear' },
              f1: { score: 0.6, notes: 'prompt parsed' },
              f2: { score: 0.6, notes: 'cue selected' },
              f3: { score: 0.6, notes: 'retrieval partial' },
              f4: { score: 0.6, notes: 'transformation partial' },
              f5: { score: 0.6, notes: 'confidence moderate' },
              f6: { score: 0.6, notes: 'outcome uncertain' },
            },
          },
        },
        ctx
      )
    ).rejects.toThrow('Step must be presented before it can be answered');
  });

  it('records learner feedback, load state, and exposure budgets for reflective agents', async () => {
    const repo = new InMemoryRepository();
    const service = makeService(repo);
    const ctx: IExecutionContext = {
      userId: 'user_test' as UserId,
      correlationId: 'correlation_test' as never,
    };
    const session = await service.startSession(
      {
        curriculumId: 'curr_123456789012345678901',
        curriculumVersionId: 'cver_123456789012345678901',
        studyMode: StudyMode.KNOWLEDGE_GAINING,
        learningMode: LearningMode.EXPLORATION,
      },
      ctx
    );

    await service.recordLearnerFeedbackAction(
      {
        sessionId: session.data.id,
        surface: 'mental_debugger',
        actionType: 'debugger_reflection_marked_not_fit',
        reasonText: 'This was a reading issue, not a concept issue.',
        conceptIds: ['concept_123456789012345678901'],
      },
      ctx
    );
    await service.recordAgentSurfaceExposure(
      { sessionId: session.data.id, surface: 'mental_debugger' },
      ctx
    );

    const feedback = await service.getLearnerFeedbackHistory(
      { surface: 'mental_debugger' },
      ctx
    );
    const load = await service.getLearnerLoadState({ sessionId: session.data.id }, ctx);
    const budget = await service.getExposureBudgetState({ sessionId: session.data.id }, ctx);

    expect(feedback.data.recentCorrections[0]?.reasonText).toContain('reading issue');
    expect(load.data.overloadRiskLevel).toBe('low');
    expect(budget.data.debuggerExposureCountInSession).toBe(1);
    expect(budget.data.remainingBudget.mentalDebugger).toBe(1);
  });

  it('blocks LessonPlan creation when Pedagogy Guardian rejects a Step', async () => {
    const repo = new InMemoryRepository();
    const guardian: IPedagogyGuardianPort = {
      validateLessonPlan: async () => ({
        result: 'accepted',
        reasonCodes: [],
        blocking: false,
        validationId: 'guard_plan',
      }),
      validateStep: async () => ({
        result: 'rejected',
        reasonCodes: ['step.concepts.missing'],
        blocking: true,
        validationId: 'guard_step',
      }),
    };
    const service = makeService(repo, guardian);
    const ctx: IExecutionContext = {
      userId: 'user_test' as UserId,
      correlationId: 'correlation_test' as never,
    };

    const sessionResult = await service.startSession(
      {
        curriculumId: 'curr_123456789012345678901',
        curriculumVersionId: 'cver_123456789012345678901',
        studyMode: StudyMode.KNOWLEDGE_GAINING,
        learningMode: LearningMode.EXPLORATION,
        topic: 'Bayes theorem',
      },
      ctx
    );

    await expect(
      service.createLessonPlan(
        sessionResult.data.id,
        {
          rigorLevel: 'minimal',
          topic: 'Bayes theorem',
          selectedNodeIds: ['cnode_123456789012345678901'] as never,
          steps: [
            {
              objective: 'Explain Bayes theorem',
              expectedOutcome: 'Learner can explain Bayesian updating',
              conceptRefs: ['concept_123456789012345678901'],
            },
          ],
        },
        ctx
      )
    ).rejects.toThrow('Pedagogy Guardian rejected Step queueing');

    expect(await repo.findLessonPlanBySessionId(sessionResult.data.id)).toBeNull();
  });

  it('rejects LessonPlan creation when no curriculum version is bound', async () => {
    const repo = new InMemoryRepository();
    const service = makeService(repo);
    const ctx: IExecutionContext = {
      userId: 'user_test' as UserId,
      correlationId: 'correlation_test' as never,
    };

    const sessionResult = await service.startSession(
      {
        curriculumId: 'curr_123456789012345678901',
        studyMode: StudyMode.KNOWLEDGE_GAINING,
        learningMode: LearningMode.EXPLORATION,
        topic: 'Bayes theorem',
      },
      ctx
    );

    await expect(
      service.createLessonPlan(
        sessionResult.data.id,
        {
          rigorLevel: 'minimal',
          topic: 'Bayes theorem',
          selectedNodeIds: ['cnode_123456789012345678901'] as never,
          steps: [
            {
              objective: 'Explain Bayes theorem',
              expectedOutcome: 'Learner can explain Bayesian updating',
              conceptRefs: ['concept_123456789012345678901'],
            },
          ],
        },
        ctx
      )
    ).rejects.toThrow('LessonPlan creation requires a bound curriculum version');
  });

  it('rejects minimal LessonPlan creation without selected curriculum nodes', async () => {
    const repo = new InMemoryRepository();
    const service = makeService(repo);
    const ctx: IExecutionContext = {
      userId: 'user_test' as UserId,
      correlationId: 'correlation_test' as never,
    };

    const sessionResult = await service.startSession(
      {
        curriculumId: 'curr_123456789012345678901',
        curriculumVersionId: 'cver_123456789012345678901',
        studyMode: StudyMode.KNOWLEDGE_GAINING,
        learningMode: LearningMode.EXPLORATION,
        topic: 'Bayes theorem',
      },
      ctx
    );

    await expect(
      service.createLessonPlan(
        sessionResult.data.id,
        {
          rigorLevel: 'minimal',
          topic: 'Bayes theorem',
          steps: [
            {
              objective: 'Explain Bayes theorem',
              expectedOutcome: 'Learner can explain Bayesian updating',
              conceptRefs: ['concept_123456789012345678901'],
            },
          ],
        },
        ctx
      )
    ).rejects.toThrow('Invalid input');
  });

  it('reads full lesson plan responses from the agent envelope data field', async () => {
    const repo = new InMemoryRepository();
    const guardian: IPedagogyGuardianPort = {
      validateLessonPlan: async () => ({
        result: 'accepted',
        reasonCodes: [],
        blocking: false,
        validationId: 'guard_plan',
      }),
      validateStep: async () => ({
        result: 'accepted',
        reasonCodes: [],
        blocking: false,
        validationId: 'guard_step',
      }),
    };
    const service = new SessionService(
      repo,
      { publish: async () => undefined, publishBatch: async () => undefined },
      {
        enqueue: async (event) => ({
          ...event,
          publishedAt: null,
          attempts: 0,
          lastError: null,
          claimOwner: null,
          claimUntil: null,
          nextAttemptAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        enqueueBatch: async () => undefined,
        listPending: async () => [],
        claimPending: async () => [],
        releaseClaims: async () => 0,
        markPublished: async () => undefined,
        markPublishedClaimed: async () => undefined,
        markFailed: async () => undefined,
        markFailedClaimed: async () => undefined,
        markDeadLettered: async () => undefined,
      },
      { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}) } as never,
      pino({ level: 'silent' }),
      {
        lessonPlanAgentUrl: 'http://agents.test/v1/lesson-plans/generate',
        pedagogyGuardianClient: guardian,
      }
    );
    const ctx: IExecutionContext = {
      userId: 'user_test' as UserId,
      correlationId: 'correlation_test' as never,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            topic: 'Generated topic',
            steps: [
              {
                objective: 'Generated objective',
                expectedOutcome: 'Generated outcome',
                conceptRefs: ['concept_123456789012345678901'],
              },
            ],
          },
        }),
      })
    );

    const sessionResult = await service.startSession(
      {
        curriculumId: 'curr_123456789012345678901',
        curriculumVersionId: 'cver_123456789012345678901',
        studyMode: StudyMode.KNOWLEDGE_GAINING,
        learningMode: LearningMode.EXPLORATION,
        topic: 'Bayes theorem',
      },
      ctx
    );

    const created = await service.createLessonPlan(
      sessionResult.data.id,
      {
        rigorLevel: 'full',
        topic: 'Fallback topic',
        selectedNodeIds: ['cnode_123456789012345678901'] as never,
      },
      ctx
    );

    expect(created.data.lessonPlan.topic).toBe('Generated topic');
    expect(created.data.steps[0]?.objective).toBe('Generated objective');
    expect(fetch).toHaveBeenCalledWith(
      'http://agents.test/v1/agents/lesson-plan-generator/run',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('polls queued lesson-plan jobs and preserves generated goals/topic', async () => {
    const repo = new InMemoryRepository();
    const guardian: IPedagogyGuardianPort = {
      validateLessonPlan: async () => ({
        result: 'accepted',
        reasonCodes: [],
        blocking: false,
        validationId: 'guard_plan',
      }),
      validateStep: async () => ({
        result: 'accepted',
        reasonCodes: [],
        blocking: false,
        validationId: 'guard_step',
      }),
    };
    const service = new SessionService(
      repo,
      { publish: async () => undefined, publishBatch: async () => undefined },
      {
        enqueue: async (event) => ({
          ...event,
          publishedAt: null,
          attempts: 0,
          lastError: null,
          claimOwner: null,
          claimUntil: null,
          nextAttemptAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        enqueueBatch: async () => undefined,
        listPending: async () => [],
        claimPending: async () => [],
        releaseClaims: async () => 0,
        markPublished: async () => undefined,
        markPublishedClaimed: async () => undefined,
        markFailed: async () => undefined,
        markFailedClaimed: async () => undefined,
        markDeadLettered: async () => undefined,
      },
      { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}) } as never,
      pino({ level: 'silent' }),
      {
        lessonPlanAgentUrl: 'http://agents.test/v1/lesson-plans/generate',
        pedagogyGuardianClient: guardian,
      }
    );
    const ctx: IExecutionContext = {
      userId: 'user_test' as UserId,
      correlationId: 'correlation_test' as never,
    };

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              runId: 'run_queued_1',
              jobId: 'job_queued_1',
              status: 'queued',
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              job: {
                status: 'completed',
                result: {
                  topic: 'Queued generated topic',
                  goals: [
                    {
                      title: 'Understand Bayesian updating',
                      type: GoalType.REASONING,
                      targetNodeIds: ['concept_123456789012345678901'],
                    },
                  ],
                  steps: [
                    {
                      objective: 'Explain Bayes theorem',
                      expectedOutcome: 'Learner explains Bayesian updating',
                      conceptRefs: ['concept_123456789012345678901'],
                    },
                  ],
                },
              },
            },
          }),
        })
    );
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback: TimerHandler) => {
      if (typeof callback === 'function') {
        callback();
      }
      return 0 as never;
    });

    const sessionResult = await service.startSession(
      {
        curriculumId: 'curr_123456789012345678901',
        curriculumVersionId: 'cver_123456789012345678901',
        studyMode: StudyMode.KNOWLEDGE_GAINING,
        learningMode: LearningMode.EXPLORATION,
        topic: 'Bayes theorem',
      },
      ctx
    );

    const created = await service.createLessonPlan(
      sessionResult.data.id,
      {
        rigorLevel: 'full',
        topic: 'Fallback topic',
        selectedNodeIds: ['cnode_123456789012345678901'] as never,
      },
      ctx
    );

    expect(created.data.lessonPlan.topic).toBe('Queued generated topic');
    expect(created.data.goals[0]?.description).toBe('Understand Bayesian updating');
    expect(created.data.goals[0]?.conceptRefs).toEqual(['concept_123456789012345678901']);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://agents.test/v1/batch-jobs/job_queued_1',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-user-id': 'user_test',
        }),
      })
    );
  });

  it('replays duplicate lesson plan creates idempotently when an idempotency key is present', async () => {
    const repo = new InMemoryRepository();
    const service = makeService(repo);
    const ctx: IExecutionContext = {
      userId: 'user_test' as UserId,
      correlationId: 'correlation_test' as never,
      idempotencyKey: 'agentjob_replay_1',
    };

    const sessionResult = await service.startSession(
      {
        curriculumId: 'curr_123456789012345678901',
        curriculumVersionId: 'cver_123456789012345678901',
        studyMode: StudyMode.KNOWLEDGE_GAINING,
        learningMode: LearningMode.EXPLORATION,
        topic: 'Bayes theorem',
      },
      ctx
    );

    const first = await service.createLessonPlan(
      sessionResult.data.id,
      {
        rigorLevel: 'minimal',
        topic: 'Bayes theorem',
        selectedNodeIds: ['cnode_123456789012345678901'] as never,
        steps: [
          {
            objective: 'Explain Bayes theorem',
            expectedOutcome: 'Learner can explain Bayesian updating',
            conceptRefs: ['concept_123456789012345678901'],
          },
        ],
      },
      ctx
    );

    const second = await service.createLessonPlan(
      sessionResult.data.id,
      {
        rigorLevel: 'minimal',
        topic: 'Bayes theorem',
        selectedNodeIds: ['cnode_123456789012345678901'] as never,
        steps: [
          {
            objective: 'Explain Bayes theorem',
            expectedOutcome: 'Learner can explain Bayesian updating',
            conceptRefs: ['concept_123456789012345678901'],
          },
        ],
      },
      ctx
    );

    expect(second.data.lessonPlan.id).toBe(first.data.lessonPlan.id);
    expect(second.data.steps.map((step) => step.id)).toEqual(first.data.steps.map((step) => step.id));
  });
});
