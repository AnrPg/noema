/**
 * @noema/session-service - Prisma repository for the Step-first session aggregate.
 */

import type {
  ActivityId,
  ConceptId,
  CurriculumId,
  CurriculumNodeId,
  CurriculumVersionId,
  EpistemicMode,
  EvaluationId,
  GoalId,
  GoalSource,
  GoalState,
  GoalType,
  LearningMode,
  LessonPlanId,
  LessonPlanState,
  RigorLevel,
  SessionId,
  SessionLifecycleState,
  StepId,
  StepStatus,
  StudyMode,
  TransformationType,
  UserId,
} from '@noema/types';
import type { Logger } from 'pino';
import { Prisma, type PrismaClient } from '../../../generated/prisma/index.js';

import {
  SessionNotFoundError,
  VersionConflictError,
} from '../../domain/session-service/errors/index.js';
import type {
  ICreateLessonPlanRecord,
  ICreateStepRecord,
  ISessionRepository,
} from '../../domain/session-service/session.repository.js';
import type {
  ActivityContentSourceType,
  IActivity,
  ICreateGoalInput,
  ILessonPlan,
  ILessonPlanGoal,
  ISession,
  ISessionConfig,
  ISessionFilters,
  ISessionStats,
  IStep,
  IStepQueueItem,
  StepQueueStatus,
} from '../../types/index.js';

type Db = PrismaClient | Prisma.TransactionClient;

function toPrismaEnum<T extends string>(value: string): T {
  return value.toUpperCase() as T;
}

function fromPrismaEnum<T extends string>(value: string): T {
  return value.toLowerCase() as T;
}

function dateToIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSessionDomain(row: any): ISession {
  return {
    id: row.id as SessionId,
    userId: row.userId as UserId,
    curriculumId: row.curriculumId as CurriculumId,
    curriculumVersionId: (row.curriculumVersionId ?? null) as CurriculumVersionId | null,
    studyMode: fromPrismaEnum<StudyMode>(row.studyMode),
    learningMode: fromPrismaEnum<LearningMode>(row.learningMode),
    lifecycleState: fromPrismaEnum<SessionLifecycleState>(row.lifecycleState),
    config: (row.config ?? {}) as ISessionConfig,
    stats: (row.stats ?? {}) as ISessionStats,
    pauseCount: row.pauseCount,
    totalPausedMs: row.totalPausedMs,
    startedAt: row.startedAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    completedAt: dateToIso(row.completedAt),
    terminationReason: row.terminationReason,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toLessonPlanDomain(row: any): ILessonPlan {
  return {
    id: row.id as LessonPlanId,
    sessionId: row.sessionId as SessionId,
    userId: row.userId as UserId,
    curriculumId: row.curriculumId as CurriculumId,
    curriculumVersionId: row.curriculumVersionId as CurriculumVersionId,
    selectedNodeIds: (row.selectedNodeIds ?? []) as CurriculumNodeId[],
    studyMode: fromPrismaEnum<StudyMode>(row.studyMode),
    learningMode: fromPrismaEnum<LearningMode>(row.learningMode),
    rigorLevel: fromPrismaEnum<RigorLevel>(row.rigorLevel),
    topic: row.topic,
    prerequisites: (row.prerequisites ?? []) as ConceptId[],
    sourceDecks: (row.sourceDecks ?? []) as string[],
    sourceCategories: (row.sourceCategories ?? []) as string[],
    assessmentStrategy: row.assessmentStrategy ?? null,
    adaptationRules: row.adaptationRules ?? null,
    guardianValidationId: row.guardianValidationId ?? null,
    state: fromPrismaEnum<LessonPlanState>(row.state),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toGoalDomain(row: any): ILessonPlanGoal {
  return {
    id: row.id as GoalId,
    lessonPlanId: row.lessonPlanId as LessonPlanId,
    description: row.description,
    type: fromPrismaEnum<GoalType>(row.type),
    parentGoalId: (row.parentGoalId ?? null) as GoalId | null,
    state: fromPrismaEnum<GoalState>(row.state),
    source: fromPrismaEnum<GoalSource>(row.source),
    conceptRefs: (row.conceptRefs ?? []) as ConceptId[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toActivityDomain(row: any): IActivity {
  return {
    id: row.id as ActivityId,
    stepId: row.stepId as StepId,
    position: row.position,
    contentSourceType: fromPrismaEnum<ActivityContentSourceType>(row.contentSourceType),
    cardId: row.cardId ?? null,
    templateId: row.templateId ?? null,
    generatedVariantId: row.generatedVariantId ?? null,
    prompt: row.prompt,
    renderPayload: (row.renderPayload ?? {}) as Record<string, unknown>,
    expectedResponseType: row.expectedResponseType,
    responseSchema: (row.responseSchema ?? {}) as Record<string, unknown>,
    variantSeed: row.variantSeed,
    generationFallbackReason: row.generationFallbackReason ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStepDomain(row: any): IStep {
  const activities = Array.isArray(row.activities)
    ? row.activities.map(toActivityDomain)
    : undefined;

  return {
    id: row.id as StepId,
    lessonPlanId: row.lessonPlanId as LessonPlanId,
    sessionId: row.sessionId as SessionId,
    userId: row.userId as UserId,
    studyMode: fromPrismaEnum<StudyMode>(row.studyMode),
    position: row.position,
    objective: row.objective,
    servesGoalIds: (row.servesGoalIds ?? []) as GoalId[],
    eligibleModes: (row.eligibleModes ?? []) as EpistemicMode[],
    selectedMode: row.selectedMode as EpistemicMode,
    transformationType: fromPrismaEnum<TransformationType>(row.transformationType),
    expectedOutcome: row.expectedOutcome,
    evaluationType: row.evaluationType,
    difficulty: row.difficulty,
    isRepair: row.isRepair,
    conceptRefs: (row.conceptRefs ?? []) as ConceptId[],
    variantSeed: row.variantSeed,
    status: fromPrismaEnum<StepStatus>(row.status),
    evaluationId: (row.evaluationId ?? null) as EvaluationId | null,
    guardianValidationId: row.guardianValidationId ?? null,
    presentedAt: dateToIso(row.presentedAt),
    answeredAt: dateToIso(row.answeredAt),
    evaluatedAt: dateToIso(row.evaluatedAt),
    supersededByStepId: (row.supersededByStepId ?? null) as StepId | null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(activities !== undefined ? { activities } : {}),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toQueueItemDomain(row: any): IStepQueueItem {
  const step = row.step ? toStepDomain(row.step) : undefined;

  return {
    id: row.id,
    sessionId: row.sessionId as SessionId,
    stepId: row.stepId as StepId,
    position: row.position,
    status: fromPrismaEnum<StepQueueStatus>(row.status),
    injectedBy: row.injectedBy ?? null,
    reason: row.reason ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(step !== undefined ? { step } : {}),
  };
}

export class PrismaSessionRepository implements ISessionRepository {
  constructor(
    private readonly prisma: PrismaClient,
    _logger: Logger
  ) {}

  private db(tx?: Prisma.TransactionClient): Db {
    return tx ?? this.prisma;
  }

  async findSessionById(id: SessionId): Promise<ISession | null> {
    const row = await this.prisma.session.findUnique({ where: { id } });
    return row ? toSessionDomain(row) : null;
  }

  async getSessionById(id: SessionId): Promise<ISession> {
    const session = await this.findSessionById(id);
    if (!session) {
      throw new SessionNotFoundError(id);
    }
    return session;
  }

  async findSessionsByUser(
    userId: UserId,
    filters?: ISessionFilters,
    limit = 20,
    offset = 0
  ): Promise<{ sessions: ISession[]; total: number }> {
    const where: Prisma.SessionWhereInput = { userId };
    if (filters?.lifecycleState) {
      where.lifecycleState = toPrismaEnum(filters.lifecycleState) as never;
    }
    if (filters?.learningMode) {
      where.learningMode = toPrismaEnum(filters.learningMode) as never;
    }
    if (filters?.studyMode) {
      where.studyMode = toPrismaEnum(filters.studyMode) as never;
    }
    if (filters?.createdAfter || filters?.createdBefore) {
      where.createdAt = {
        ...(filters.createdAfter ? { gte: new Date(filters.createdAfter) } : {}),
        ...(filters.createdBefore ? { lte: new Date(filters.createdBefore) } : {}),
      };
    }
    if (filters?.completedAfter || filters?.completedBefore) {
      where.completedAt = {
        ...(filters.completedAfter ? { gte: new Date(filters.completedAfter) } : {}),
        ...(filters.completedBefore ? { lte: new Date(filters.completedBefore) } : {}),
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.session.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.session.count({ where }),
    ]);

    return { sessions: rows.map(toSessionDomain), total };
  }

  async createSession(
    session: Omit<ISession, 'createdAt' | 'updatedAt'>,
    tx?: Prisma.TransactionClient
  ): Promise<ISession> {
    const row = await this.db(tx).session.create({
      data: {
        id: session.id,
        userId: session.userId,
        curriculumId: session.curriculumId,
        curriculumVersionId: session.curriculumVersionId,
        studyMode: toPrismaEnum(session.studyMode),
        learningMode: toPrismaEnum(session.learningMode),
        lifecycleState: toPrismaEnum(session.lifecycleState),
        config: session.config as Prisma.InputJsonValue,
        stats: session.stats as unknown as Prisma.InputJsonValue,
        pauseCount: session.pauseCount,
        totalPausedMs: session.totalPausedMs,
        startedAt: new Date(session.startedAt),
        lastActivityAt: new Date(session.lastActivityAt),
        completedAt: session.completedAt ? new Date(session.completedAt) : null,
        terminationReason: session.terminationReason,
        version: session.version,
      },
    });
    return toSessionDomain(row);
  }

  async updateSession(
    id: SessionId,
    data: Partial<
      Pick<
        ISession,
        | 'lifecycleState'
        | 'stats'
        | 'pauseCount'
        | 'totalPausedMs'
        | 'lastActivityAt'
        | 'completedAt'
        | 'terminationReason'
      >
    >,
    expectedVersion: number,
    tx?: Prisma.TransactionClient
  ): Promise<ISession> {
    const update: Prisma.SessionUpdateInput = { version: { increment: 1 } };
    if (data.lifecycleState !== undefined)
      update.lifecycleState = toPrismaEnum(data.lifecycleState) as never;
    if (data.stats !== undefined) update.stats = data.stats as unknown as Prisma.InputJsonValue;
    if (data.pauseCount !== undefined) update.pauseCount = data.pauseCount;
    if (data.totalPausedMs !== undefined) update.totalPausedMs = data.totalPausedMs;
    if (data.lastActivityAt !== undefined) update.lastActivityAt = new Date(data.lastActivityAt);
    if (data.completedAt !== undefined)
      update.completedAt = data.completedAt ? new Date(data.completedAt) : null;
    if (data.terminationReason !== undefined) update.terminationReason = data.terminationReason;

    try {
      const row = await this.db(tx).session.update({
        where: { id, version: expectedVersion },
        data: update,
      });
      return toSessionDomain(row);
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: string }).code === 'P2025'
      ) {
        throw new VersionConflictError(expectedVersion, expectedVersion + 1);
      }
      throw error;
    }
  }

  async findLessonPlanById(id: LessonPlanId): Promise<ILessonPlan | null> {
    const row = await this.prisma.lessonPlan.findUnique({ where: { id } });
    return row ? toLessonPlanDomain(row) : null;
  }

  async findLessonPlanBySessionId(sessionId: SessionId): Promise<ILessonPlan | null> {
    const row = await this.prisma.lessonPlan.findUnique({ where: { sessionId } });
    return row ? toLessonPlanDomain(row) : null;
  }

  async findGoalsByLessonPlanId(lessonPlanId: LessonPlanId): Promise<ILessonPlanGoal[]> {
    const rows = await this.prisma.lessonPlanGoal.findMany({
      where: { lessonPlanId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toGoalDomain);
  }

  async createLessonPlanWithSteps(
    plan: ICreateLessonPlanRecord,
    tx?: Prisma.TransactionClient
  ): Promise<{ lessonPlan: ILessonPlan; steps: IStep[] }> {
    const db = this.db(tx);
    const row = await db.lessonPlan.create({
      data: {
        id: plan.id,
        sessionId: plan.sessionId,
        userId: plan.userId,
        curriculumId: plan.curriculumId,
        curriculumVersionId: plan.curriculumVersionId,
        selectedNodeIds: plan.selectedNodeIds,
        studyMode: toPrismaEnum(plan.studyMode),
        learningMode: toPrismaEnum(plan.learningMode),
        rigorLevel: toPrismaEnum(plan.rigorLevel),
        topic: plan.topic,
        prerequisites: plan.prerequisites as Prisma.InputJsonValue,
        sourceDecks: plan.sourceDecks as Prisma.InputJsonValue,
        sourceCategories: plan.sourceCategories as Prisma.InputJsonValue,
        assessmentStrategy: plan.assessmentStrategy,
        adaptationRules: plan.adaptationRules,
        guardianValidationId: plan.guardianValidationId,
        state: toPrismaEnum(plan.state),
        version: plan.version,
      },
    });

    const steps: IStep[] = [];
    for (const step of plan.steps) {
      const created = await db.step.create({
        data: {
          id: step.id,
          lessonPlanId: plan.id,
          sessionId: step.sessionId,
          userId: step.userId,
          studyMode: toPrismaEnum(step.studyMode),
          position: step.position,
          objective: step.objective,
          servesGoalIds: step.servesGoalIds,
          eligibleModes: step.eligibleModes,
          selectedMode: step.selectedMode,
          transformationType: toPrismaEnum(step.transformationType),
          expectedOutcome: step.expectedOutcome,
          evaluationType: step.evaluationType,
          difficulty: step.difficulty,
          isRepair: step.isRepair,
          conceptRefs: step.conceptRefs,
          variantSeed: step.variantSeed,
          status: toPrismaEnum(step.status),
          evaluationId: step.evaluationId,
          guardianValidationId: step.guardianValidationId,
          presentedAt: step.presentedAt ? new Date(step.presentedAt) : null,
          answeredAt: step.answeredAt ? new Date(step.answeredAt) : null,
          evaluatedAt: step.evaluatedAt ? new Date(step.evaluatedAt) : null,
          supersededByStepId: step.supersededByStepId,
          version: step.version,
          activities: {
            create: step.activities.map((activity) => ({
              id: activity.id,
              position: activity.position,
              contentSourceType: toPrismaEnum(activity.contentSourceType),
              cardId: activity.cardId,
              templateId: activity.templateId,
              generatedVariantId: activity.generatedVariantId,
              prompt: activity.prompt,
              renderPayload: activity.renderPayload as Prisma.InputJsonValue,
              expectedResponseType: activity.expectedResponseType,
              responseSchema: activity.responseSchema as Prisma.InputJsonValue,
              variantSeed: activity.variantSeed,
              generationFallbackReason: activity.generationFallbackReason,
            })),
          },
          queueItem: {
            create: {
              id: crypto.randomUUID(),
              sessionId: step.sessionId,
              position: step.position,
              status: toPrismaEnum(step.queueStatus ?? 'pending'),
            },
          },
        },
        include: { activities: true },
      });
      steps.push(toStepDomain(created));
    }

    return { lessonPlan: toLessonPlanDomain(row), steps };
  }

  async activateLessonPlan(id: LessonPlanId, tx?: Prisma.TransactionClient): Promise<ILessonPlan> {
    const row = await this.db(tx).lessonPlan.update({
      where: { id },
      data: { state: 'ACTIVE' },
    });
    return toLessonPlanDomain(row);
  }

  async countActiveGoals(lessonPlanId: LessonPlanId): Promise<number> {
    return this.prisma.lessonPlanGoal.count({
      where: { lessonPlanId, state: 'ACTIVE' },
    });
  }

  async createGoal(
    lessonPlanId: LessonPlanId,
    goalId: GoalId,
    input: ICreateGoalInput,
    tx?: Prisma.TransactionClient
  ): Promise<ILessonPlanGoal> {
    const row = await this.db(tx).lessonPlanGoal.create({
      data: {
        id: goalId,
        lessonPlanId,
        description: input.description,
        type: toPrismaEnum(input.type),
        parentGoalId: input.parentGoalId ?? null,
        state: toPrismaEnum(input.state ?? 'pending'),
        source: toPrismaEnum(input.source ?? 'system_proposed'),
        conceptRefs: input.conceptRefs ?? [],
      },
    });
    return toGoalDomain(row);
  }

  async findStepById(id: StepId): Promise<IStep | null> {
    const row = await this.prisma.step.findUnique({
      where: { id },
      include: { activities: { orderBy: { position: 'asc' } } },
    });
    return row ? toStepDomain(row) : null;
  }

  async getStepById(id: StepId): Promise<IStep> {
    const step = await this.findStepById(id);
    if (!step) {
      throw new SessionNotFoundError(id);
    }
    return step;
  }

  async findStepsBySessionId(sessionId: SessionId): Promise<IStep[]> {
    const rows = await this.prisma.step.findMany({
      where: { sessionId },
      orderBy: { position: 'asc' },
      include: { activities: { orderBy: { position: 'asc' } } },
    });
    return rows.map(toStepDomain);
  }

  async createSteps(steps: ICreateStepRecord[], tx?: Prisma.TransactionClient): Promise<IStep[]> {
    const db = this.db(tx);
    const created: IStep[] = [];
    for (const step of steps) {
      const row = await db.step.create({
        data: {
          id: step.id,
          lessonPlanId: step.lessonPlanId,
          sessionId: step.sessionId,
          userId: step.userId,
          studyMode: toPrismaEnum(step.studyMode),
          position: step.position,
          objective: step.objective,
          servesGoalIds: step.servesGoalIds,
          eligibleModes: step.eligibleModes,
          selectedMode: step.selectedMode,
          transformationType: toPrismaEnum(step.transformationType),
          expectedOutcome: step.expectedOutcome,
          evaluationType: step.evaluationType,
          difficulty: step.difficulty,
          isRepair: step.isRepair,
          conceptRefs: step.conceptRefs,
          variantSeed: step.variantSeed,
          status: toPrismaEnum(step.status),
          evaluationId: step.evaluationId,
          guardianValidationId: step.guardianValidationId,
          presentedAt: step.presentedAt ? new Date(step.presentedAt) : null,
          answeredAt: step.answeredAt ? new Date(step.answeredAt) : null,
          evaluatedAt: step.evaluatedAt ? new Date(step.evaluatedAt) : null,
          supersededByStepId: step.supersededByStepId,
          version: step.version,
          activities: {
            create: step.activities.map((activity) => ({
              id: activity.id,
              position: activity.position,
              contentSourceType: toPrismaEnum(activity.contentSourceType),
              cardId: activity.cardId,
              templateId: activity.templateId,
              generatedVariantId: activity.generatedVariantId,
              prompt: activity.prompt,
              renderPayload: activity.renderPayload as Prisma.InputJsonValue,
              expectedResponseType: activity.expectedResponseType,
              responseSchema: activity.responseSchema as Prisma.InputJsonValue,
              variantSeed: activity.variantSeed,
              generationFallbackReason: activity.generationFallbackReason,
            })),
          },
          queueItem: {
            create: {
              id: crypto.randomUUID(),
              sessionId: step.sessionId,
              position: step.position,
              status: toPrismaEnum(step.queueStatus ?? 'injected'),
              injectedBy: 'strategy',
              reason: step.isRepair ? 'trigger_repair' : 'trigger_replan',
            },
          },
        },
        include: { activities: { orderBy: { position: 'asc' } } },
      });
      created.push(toStepDomain(row));
    }
    return created;
  }

  async markStepsSuperseded(
    replacements: { stepId: StepId; supersededByStepId: StepId }[],
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const db = this.db(tx);
    for (const replacement of replacements) {
      await db.step.update({
        where: { id: replacement.stepId },
        data: {
          status: 'SUPERSEDED',
          supersededByStepId: replacement.supersededByStepId,
          version: { increment: 1 },
        },
      });
      await db.stepQueueItem.updateMany({
        where: { stepId: replacement.stepId },
        data: { status: 'SKIPPED', reason: 'superseded_by_strategy' },
      });
    }
  }

  async findNextQueueItem(sessionId: SessionId): Promise<IStepQueueItem | null> {
    const row = await this.prisma.stepQueueItem.findFirst({
      where: { sessionId, status: { in: ['PENDING', 'INJECTED'] } },
      orderBy: { position: 'asc' },
      include: { step: { include: { activities: { orderBy: { position: 'asc' } } } } },
    });
    return row ? toQueueItemDomain(row) : null;
  }

  async markStepPresented(stepId: StepId, tx?: Prisma.TransactionClient): Promise<IStep> {
    const db = this.db(tx);
    const now = new Date();
    const row = await db.step.update({
      where: { id: stepId },
      data: {
        status: 'PRESENTED',
        presentedAt: now,
        version: { increment: 1 },
      },
      include: { activities: { orderBy: { position: 'asc' } } },
    });
    await db.stepQueueItem.update({
      where: { stepId },
      data: { status: 'PRESENTED' },
    });
    return toStepDomain(row);
  }

  async markStepAnsweredAndEvaluated(
    stepId: StepId,
    evaluationId: string,
    tx?: Prisma.TransactionClient
  ): Promise<IStep> {
    const db = this.db(tx);
    const now = new Date();
    const row = await db.step.update({
      where: { id: stepId },
      data: {
        status: 'EVALUATED',
        evaluationId,
        answeredAt: now,
        evaluatedAt: now,
        version: { increment: 1 },
      },
      include: { activities: { orderBy: { position: 'asc' } } },
    });
    await db.stepQueueItem.update({
      where: { stepId },
      data: { status: 'COMPLETED' },
    });
    return toStepDomain(row);
  }

  async markStepSkipped(
    stepId: StepId,
    reason: string | null,
    tx?: Prisma.TransactionClient
  ): Promise<IStep> {
    const db = this.db(tx);
    const row = await db.step.update({
      where: { id: stepId },
      data: {
        status: 'SKIPPED',
        version: { increment: 1 },
      },
      include: { activities: { orderBy: { position: 'asc' } } },
    });
    await db.stepQueueItem.update({
      where: { stepId },
      data: { status: 'SKIPPED', reason },
    });
    return toStepDomain(row);
  }
}
