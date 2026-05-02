/* eslint-disable @typescript-eslint/require-await */

import { describe, expect, it } from 'vitest';
import pino from 'pino';

import {
  EpistemicMode,
  GoalState,
  LearningInterventionType,
  LearningMode,
  LessonPlanState,
  ReplanScope,
  RigorLevel,
  SessionLifecycleState,
  StepStatus,
  StudyMode,
  TransformationType,
  TriggerType,
  type ConceptId,
  type CorrelationId,
  type GoalId,
  type LessonPlanId,
  type SessionId,
  type StepId,
  type TriggerId,
  type UserId,
} from '@noema/types';

import { StrategyService } from '../../../src/domain/strategy/index.js';
import type {
  ICreateLessonPlanRecord,
  ICreateStepRecord,
  ISessionRepository,
} from '../../../src/domain/session-service/session.repository.js';
import type {
  IOutboxEventInput,
  IOutboxRepository,
} from '../../../src/domain/session-service/outbox.repository.js';
import type { IPedagogyGuardianPort } from '../../../src/domain/session-service/pedagogy-guardian.port.js';
import {
  type ICreateGoalInput,
  type ILessonPlan,
  type ILessonPlanGoal,
  type ISession,
  type ISessionFilters,
  type IStep,
  type IStepQueueItem,
} from '../../../src/types/index.js';

const ids = {
  userId: 'user_ABCDEFGHIJKLMNOPQRSTU' as UserId,
  sessionId: 'session_ABCDEFGHIJKLMNOPQ' as SessionId,
  lessonPlanId: 'lesson_ABCDEFGHIJKLMNOP' as LessonPlanId,
  goalId: 'goal_ABCDEFGHIJKLMNOPQRS' as GoalId,
  stepId: 'step_ABCDEFGHIJKLMNOPQRS' as StepId,
  conceptId: 'concept_ABCDEFGHIJKLMNOP' as ConceptId,
  correlationId: 'correlation_ABCDEFGHIJ' as CorrelationId,
  triggerId: 'trigger_ABCDEFGHIJKLMNOP' as TriggerId,
};

class StrategyRepo implements ISessionRepository {
  session = makeSession();
  lessonPlan = makeLessonPlan();
  goals: ILessonPlanGoal[] = [];
  steps: IStep[] = [makeStep()];
  inserted: IStep[] = [];
  superseded: { stepId: StepId; supersededByStepId: StepId }[] = [];

  async findSessionById(id: SessionId): Promise<ISession | null> {
    return id === this.session.id ? this.session : null;
  }

  async getSessionById(id: SessionId): Promise<ISession> {
    const session = await this.findSessionById(id);
    if (!session) throw new Error('missing session');
    return session;
  }

  async findSessionsByUser(
    userId: UserId,
    _filters?: ISessionFilters,
    _limit?: number,
    _offset?: number
  ): Promise<{ sessions: ISession[]; total: number }> {
    const sessions = this.session.userId === userId ? [this.session] : [];
    return { sessions, total: sessions.length };
  }

  async createSession(session: Omit<ISession, 'createdAt' | 'updatedAt'>): Promise<ISession> {
    this.session = { ...session, createdAt: now(), updatedAt: now() };
    return this.session;
  }

  async updateSession(): Promise<ISession> {
    return this.session;
  }

  async findLessonPlanById(id: LessonPlanId): Promise<ILessonPlan | null> {
    return id === this.lessonPlan.id ? this.lessonPlan : null;
  }

  async findLessonPlanBySessionId(sessionId: SessionId): Promise<ILessonPlan | null> {
    return sessionId === this.session.id ? this.lessonPlan : null;
  }

  async findGoalsByLessonPlanId(): Promise<ILessonPlanGoal[]> {
    return this.goals;
  }

  async createLessonPlanWithSteps(
    plan: ICreateLessonPlanRecord
  ): Promise<{ lessonPlan: ILessonPlan; steps: IStep[] }> {
    this.lessonPlan = { ...plan, createdAt: now(), updatedAt: now() };
    this.steps = plan.steps.map(toStep);
    return { lessonPlan: this.lessonPlan, steps: this.steps };
  }

  async activateLessonPlan(): Promise<ILessonPlan> {
    return this.lessonPlan;
  }

  async countActiveGoals(): Promise<number> {
    return this.goals.filter((goal) => goal.state === GoalState.ACTIVE).length;
  }

  async createGoal(
    lessonPlanId: LessonPlanId,
    goalId: GoalId,
    input: ICreateGoalInput
  ): Promise<ILessonPlanGoal> {
    const goal: ILessonPlanGoal = {
      id: goalId,
      lessonPlanId,
      description: input.description,
      type: input.type,
      parentGoalId: input.parentGoalId ?? null,
      state: input.state ?? GoalState.PENDING,
      source: input.source ?? 'system_proposed',
      conceptRefs: input.conceptRefs ?? [],
      createdAt: now(),
      updatedAt: now(),
    };
    this.goals.push(goal);
    return goal;
  }

  async findStepById(id: StepId): Promise<IStep | null> {
    return this.steps.find((step) => step.id === id) ?? null;
  }

  async getStepById(id: StepId): Promise<IStep> {
    const step = await this.findStepById(id);
    if (!step) throw new Error('missing step');
    return step;
  }

  async findStepsBySessionId(): Promise<IStep[]> {
    return this.steps;
  }

  async createSteps(steps: ICreateStepRecord[]): Promise<IStep[]> {
    const created = steps.map(toStep);
    this.inserted.push(...created);
    this.steps.push(...created);
    return created;
  }

  async markStepsSuperseded(
    replacements: { stepId: StepId; supersededByStepId: StepId }[]
  ): Promise<void> {
    this.superseded.push(...replacements);
    this.steps = this.steps.map((step) => {
      const replacement = replacements.find((entry) => entry.stepId === step.id);
      return replacement === undefined
        ? step
        : {
            ...step,
            status: StepStatus.SUPERSEDED,
            supersededByStepId: replacement.supersededByStepId,
          };
    });
  }

  async findNextQueueItem(): Promise<IStepQueueItem | null> {
    return null;
  }

  async markStepPresented(): Promise<IStep> {
    return this.steps[0]!;
  }

  async markStepAnsweredAndEvaluated(): Promise<IStep> {
    return this.steps[0]!;
  }

  async markStepSkipped(): Promise<IStep> {
    return this.steps[0]!;
  }
}

function makeStrategy(repo: StrategyRepo): StrategyService {
  const outbox: IOutboxRepository = {
    enqueue: async (event) => toOutboxRecord(event),
    enqueueBatch: async () => undefined,
    listPending: async () => [],
    claimPending: async () => [],
    releaseClaims: async () => 0,
    markPublished: async () => undefined,
    markPublishedClaimed: async () => undefined,
    markFailed: async () => undefined,
    markFailedClaimed: async () => undefined,
    markDeadLettered: async () => undefined,
  };
  const guardian: IPedagogyGuardianPort = {
    validateLessonPlan: async () => accepted(),
    validateStep: async () => accepted(),
    validateReplan: async () => accepted(),
  };
  return new StrategyService(
    repo,
    outbox,
    { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}) } as never,
    guardian,
    pino({ level: 'silent' })
  );
}

describe('StrategyService', () => {
  it('inserts a repair Step with a different transformation for failure triggers', async () => {
    const repo = new StrategyRepo();
    const strategy = makeStrategy(repo);

    const result = await strategy.handleTrigger(
      {
        triggerId: ids.triggerId,
        userId: ids.userId,
        type: TriggerType.FAILURE,
        severity: 0.6,
        conceptRefs: [ids.conceptId],
        stepId: ids.stepId,
        sessionId: ids.sessionId,
        recommendedIntervention: LearningInterventionType.INSERT_REPAIR_STEP,
      },
      { userId: ids.userId, correlationId: ids.correlationId }
    );

    expect(result.scope).toBe(ReplanScope.LOCAL);
    expect(repo.inserted).toHaveLength(1);
    expect(repo.inserted[0]?.isRepair).toBe(true);
    expect(repo.inserted[0]?.transformationType).not.toBe(repo.steps[0]?.transformationType);
  });

  it('inserts a structural prerequisite branch for prerequisite_gap triggers', async () => {
    const repo = new StrategyRepo();
    const strategy = makeStrategy(repo);

    const result = await strategy.handleTrigger(
      {
        triggerId: ids.triggerId,
        userId: ids.userId,
        type: TriggerType.PREREQUISITE_GAP,
        severity: 0.7,
        conceptRefs: [ids.conceptId],
        stepId: ids.stepId,
        sessionId: ids.sessionId,
        recommendedIntervention: LearningInterventionType.BRANCH_TO_PREREQUISITE,
      },
      { userId: ids.userId, correlationId: ids.correlationId }
    );

    expect(result.scope).toBe(ReplanScope.STRUCTURAL);
    expect(repo.inserted).toHaveLength(2);
    expect(repo.inserted.every((step) => step.conceptRefs.includes(ids.conceptId))).toBe(true);
  });

  it('supersedes pending future Steps replaced by a structural replan', async () => {
    const repo = new StrategyRepo();
    const pendingStep = {
      ...makeStep(),
      id: 'step_pending_ABCDEFGHIJK' as StepId,
      position: 1,
      status: StepStatus.PLANNED,
      evaluationId: null,
      presentedAt: null,
      answeredAt: null,
      evaluatedAt: null,
    };
    repo.steps = [makeStep(), pendingStep];
    const strategy = makeStrategy(repo);

    const result = await strategy.handleTrigger(
      {
        triggerId: ids.triggerId,
        userId: ids.userId,
        type: TriggerType.PREREQUISITE_GAP,
        severity: 0.7,
        conceptRefs: [ids.conceptId],
        stepId: ids.stepId,
        sessionId: ids.sessionId,
        recommendedIntervention: LearningInterventionType.BRANCH_TO_PREREQUISITE,
      },
      { userId: ids.userId, correlationId: ids.correlationId }
    );

    expect(result.supersededStepIds).toEqual([pendingStep.id]);
    expect(repo.superseded[0]?.supersededByStepId).toBe(result.insertedStepIds[0]);
    expect(repo.steps.find((step) => step.id === pendingStep.id)?.status).toBe(
      StepStatus.SUPERSEDED
    );
  });

  it('chooses full scope only when the plan is fundamentally invalidated', () => {
    const repo = new StrategyRepo();
    const strategy = makeStrategy(repo);

    expect(
      strategy.chooseScope(
        { type: TriggerType.FAILURE, severity: 0.99, conceptRefs: [ids.conceptId] },
        repo.lessonPlan,
        repo.steps
      )
    ).toBe(ReplanScope.STRUCTURAL);

    expect(
      strategy.chooseScope(
        {
          type: TriggerType.FAILURE,
          severity: 1,
          conceptRefs: [
            ids.conceptId,
            'concept_BBCDEFGHIJKLMNOPQ' as ConceptId,
            'concept_CBCDEFGHIJKLMNOPQ' as ConceptId,
            'concept_DBCDEFGHIJKLMNOPQ' as ConceptId,
            'concept_EBCDEFGHIJKLMNOPQ' as ConceptId,
          ],
        },
        { ...repo.lessonPlan, rigorLevel: RigorLevel.FULL },
        repo.steps
      )
    ).toBe(ReplanScope.FULL);
  });
});

function makeSession(): ISession {
  return {
    id: ids.sessionId,
    userId: ids.userId,
    studyMode: StudyMode.KNOWLEDGE_GAINING,
    learningMode: LearningMode.EXPLORATION,
    lifecycleState: SessionLifecycleState.EVALUATION,
    config: {},
    stats: {
      stepsPlanned: 1,
      stepsPresented: 1,
      stepsEvaluated: 1,
      skippedSteps: 0,
    },
    pauseCount: 0,
    totalPausedMs: 0,
    startedAt: now(),
    lastActivityAt: now(),
    completedAt: null,
    terminationReason: null,
    version: 1,
    createdAt: now(),
    updatedAt: now(),
  };
}

function makeLessonPlan(): ILessonPlan {
  return {
    id: ids.lessonPlanId,
    sessionId: ids.sessionId,
    userId: ids.userId,
    studyMode: StudyMode.KNOWLEDGE_GAINING,
    learningMode: LearningMode.EXPLORATION,
    rigorLevel: RigorLevel.MINIMAL,
    topic: 'Bayes theorem',
    prerequisites: [],
    sourceDecks: [],
    sourceCategories: [],
    assessmentStrategy: null,
    adaptationRules: null,
    guardianValidationId: 'guard_plan',
    state: LessonPlanState.ACTIVE,
    version: 1,
    createdAt: now(),
    updatedAt: now(),
  };
}

function makeStep(): IStep {
  return {
    id: ids.stepId,
    lessonPlanId: ids.lessonPlanId,
    sessionId: ids.sessionId,
    userId: ids.userId,
    studyMode: StudyMode.KNOWLEDGE_GAINING,
    position: 0,
    objective: 'Explain Bayes theorem',
    servesGoalIds: [],
    eligibleModes: [EpistemicMode.GENERATIVE_RETRIEVAL],
    selectedMode: EpistemicMode.GENERATIVE_RETRIEVAL,
    transformationType: TransformationType.RECALL,
    expectedOutcome: 'Learner explains Bayesian updating',
    evaluationType: 'self_explanation',
    difficulty: 0.5,
    isRepair: false,
    conceptRefs: [ids.conceptId],
    variantSeed: 'seed-1',
    status: StepStatus.EVALUATED,
    evaluationId: 'eval_ABCDEFGHIJKLMNOPQRS' as never,
    guardianValidationId: 'guard_step',
    presentedAt: now(),
    answeredAt: now(),
    evaluatedAt: now(),
    supersededByStepId: null,
    version: 1,
    createdAt: now(),
    updatedAt: now(),
    activities: [],
  };
}

function toStep(input: ICreateStepRecord): IStep {
  return { ...input, createdAt: now(), updatedAt: now(), activities: [] };
}

function accepted() {
  return {
    result: 'accepted' as const,
    reasonCodes: [],
    blocking: false,
    validationId: 'guard_ok',
  };
}

function toOutboxRecord(event: IOutboxEventInput) {
  return {
    ...event,
    publishedAt: null,
    attempts: 0,
    lastError: null,
    claimOwner: null,
    claimUntil: null,
    nextAttemptAt: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

function now(): string {
  return '2026-05-02T00:00:00.000Z';
}
