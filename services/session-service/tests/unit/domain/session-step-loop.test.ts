import { describe, expect, it } from 'vitest';
import pino from 'pino';

import {
  GoalState,
  GoalType,
  LearningMode,
  SessionLifecycleState,
  StepStatus,
  StepSelfRating,
  StudyMode,
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
  IStepQueueItem,
} from '../../../src/types/index.js';

class InMemoryRepository implements ISessionRepository {
  sessions = new Map<string, ISession>();
  lessonPlans = new Map<string, ILessonPlan>();
  goals = new Map<string, ILessonPlanGoal>();
  steps = new Map<string, IStep>();
  queue = new Map<string, IStepQueueItem>();

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
    this.sessions.set(id, updated);
    return updated;
  }

  async findLessonPlanById(id: LessonPlanId): Promise<ILessonPlan | null> {
    return this.lessonPlans.get(id) ?? null;
  }

  async findLessonPlanBySessionId(sessionId: SessionId): Promise<ILessonPlan | null> {
    return [...this.lessonPlans.values()].find((plan) => plan.sessionId === sessionId) ?? null;
  }

  async createLessonPlanWithSteps(
    plan: ICreateLessonPlanRecord
  ): Promise<{ lessonPlan: ILessonPlan; steps: IStep[] }> {
    const now = new Date().toISOString();
    const lessonPlan = { ...plan, createdAt: now, updatedAt: now };
    this.lessonPlans.set(lessonPlan.id, lessonPlan);
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
    return { lessonPlan, steps };
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

  async findNextQueueItem(sessionId: SessionId): Promise<IStepQueueItem | null> {
    return (
      [...this.queue.values()]
        .filter(
          (item) => item.sessionId === sessionId && ['pending', 'injected'].includes(item.status)
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

  async markStepAnsweredAndEvaluated(stepId: StepId, evaluationId: string): Promise<IStep> {
    const step = await this.getStepById(stepId);
    const now = new Date().toISOString();
    const updated = {
      ...step,
      status: StepStatus.EVALUATED,
      evaluationId: evaluationId as never,
      answeredAt: now,
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
}

function makeService(repo: InMemoryRepository, guardian?: IPedagogyGuardianPort): SessionService {
  const outboxEvents: IOutboxEventInput[] = [];
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
      metacognitionClient: {
        recordStepEvaluation: async (input) => ({ evaluationId: input.evaluationId }),
      },
      ...(guardian !== undefined ? { pedagogyGuardianClient: guardian } : {}),
    }
  );
}

describe('session Step loop', () => {
  it('creates a minimal plan, presents a Step, answers it, and reaches EVALUATED', async () => {
    const repo = new InMemoryRepository();
    const service = makeService(repo);
    const ctx: IExecutionContext = {
      userId: 'user_test' as UserId,
      correlationId: 'correlation_test' as never,
    };

    const sessionResult = await service.startSession(
      {
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
        steps: [
          {
            objective: 'Explain Bayes theorem',
            expectedOutcome: 'Learner can explain Bayesian updating',
            conceptRefs: ['concept_bayes'],
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
        conceptRefs: ['concept_bayes'],
      },
      ctx
    );

    expect(goalResult.data.state).toBe(GoalState.ACTIVE);

    const nextStep = await service.getNextStep(sessionResult.data.id, ctx);
    expect(nextStep.data?.objective).toContain('Bayes theorem');

    const presented = await service.presentStep(nextStep.data!.id, ctx);
    expect(presented.data.status).toBe(StepStatus.PRESENTED);

    const answered = await service.answerStep(
      nextStep.data!.id,
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

    expect(answered.data.status).toBe(StepStatus.EVALUATED);
    expect(answered.data.evaluationId).toMatch(/^eval_/);
    expect((await repo.getSessionById(sessionResult.data.id)).lifecycleState).toBe(
      SessionLifecycleState.EVALUATION
    );
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
              conceptRefs: [],
            },
          ],
        },
        ctx
      )
    ).rejects.toThrow('Pedagogy Guardian rejected Step queueing');

    expect(await repo.findLessonPlanBySessionId(sessionResult.data.id)).toBeNull();
  });
});
