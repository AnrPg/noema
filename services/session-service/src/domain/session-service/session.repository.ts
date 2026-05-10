/**
 * @noema/session-service - Step-loop repository interface.
 */

import type { GoalId, LessonPlanId, SessionId, StepId, UserId } from '@noema/types';
import type { Prisma } from '../../../generated/prisma/index.js';

import type {
  IActivity,
  ICreateGoalInput,
  ILessonPlan,
  ILessonPlanGoal,
  IPlannedActivityInput,
  IPlannedStepInput,
  ISession,
  ISessionFilters,
  IStep,
  IStepAnswerArtifact,
  ILearnerFeedbackAction,
  IAgentSurfaceExposure,
  IStepQueueItem,
  SessionTerminationReason,
  StepQueueStatus,
} from '../../types/index.js';

export interface ICreateLessonPlanRecord extends Omit<ILessonPlan, 'createdAt' | 'updatedAt'> {
  goals: ICreateGoalRecord[];
  steps: ICreateStepRecord[];
}

export interface ICreateGoalRecord extends Omit<ILessonPlanGoal, 'createdAt' | 'updatedAt'> {}

export interface ICreateStepRecord extends Omit<IStep, 'createdAt' | 'updatedAt' | 'activities'> {
  activities: Omit<IActivity, 'createdAt' | 'updatedAt'>[];
  queueStatus?: StepQueueStatus;
}

export interface IMarkStepAnsweredResult {
  step: IStep;
  transitioned: boolean;
}

export interface IUpsertStepAnswerArtifactInput {
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
}

export interface IRecordLearnerFeedbackActionInput {
  id: string;
  userId: UserId;
  sessionId?: SessionId;
  stepId?: StepId;
  surface: ILearnerFeedbackAction['surface'];
  actionType: ILearnerFeedbackAction['actionType'];
  noteText?: string;
  reasonText?: string;
  conceptIds: ILearnerFeedbackAction['conceptIds'];
  metadata?: Record<string, unknown>;
}

export interface IFindLearnerFeedbackActionsQuery {
  userId: UserId;
  surface?: ILearnerFeedbackAction['surface'];
  since?: string;
  limit: number;
}

export interface IRecordAgentSurfaceExposureInput {
  id: string;
  userId: UserId;
  sessionId: SessionId;
  stepId?: StepId;
  surface: IAgentSurfaceExposure['surface'];
  metadata?: Record<string, unknown>;
}

export interface IFindAgentSurfaceExposuresQuery {
  userId: UserId;
  sessionId?: SessionId;
  surfaces?: IAgentSurfaceExposure['surface'][];
  since?: string;
  limit: number;
}

export interface ISessionRepository {
  findSessionById(id: SessionId): Promise<ISession | null>;
  getSessionById(id: SessionId): Promise<ISession>;
  findSessionsByUser(
    userId: UserId,
    filters?: ISessionFilters,
    limit?: number,
    offset?: number
  ): Promise<{ sessions: ISession[]; total: number }>;
  createSession(
    session: Omit<ISession, 'createdAt' | 'updatedAt'>,
    tx?: Prisma.TransactionClient
  ): Promise<ISession>;
  updateSession(
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
  ): Promise<ISession>;

  findLessonPlanById(id: LessonPlanId): Promise<ILessonPlan | null>;
  findLessonPlanBySessionId(sessionId: SessionId): Promise<ILessonPlan | null>;
  findGoalsByLessonPlanId(lessonPlanId: LessonPlanId): Promise<ILessonPlanGoal[]>;
  createLessonPlanWithSteps(
    plan: ICreateLessonPlanRecord,
    tx?: Prisma.TransactionClient
  ): Promise<{ lessonPlan: ILessonPlan; goals: ILessonPlanGoal[]; steps: IStep[] }>;
  activateLessonPlan(id: LessonPlanId, tx?: Prisma.TransactionClient): Promise<ILessonPlan>;

  countActiveGoals(lessonPlanId: LessonPlanId): Promise<number>;
  createGoal(
    lessonPlanId: LessonPlanId,
    goalId: GoalId,
    input: ICreateGoalInput,
    tx?: Prisma.TransactionClient
  ): Promise<ILessonPlanGoal>;

  findStepById(id: StepId): Promise<IStep | null>;
  getStepById(id: StepId): Promise<IStep>;
  findStepsBySessionId(sessionId: SessionId): Promise<IStep[]>;
  createSteps(steps: ICreateStepRecord[], tx?: Prisma.TransactionClient): Promise<IStep[]>;
  markStepsSuperseded(
    replacements: { stepId: StepId; supersededByStepId: StepId }[],
    tx?: Prisma.TransactionClient
  ): Promise<void>;
  findCurrentOrNextQueueItem(sessionId: SessionId): Promise<IStepQueueItem | null>;
  findNextQueueItem(sessionId: SessionId): Promise<IStepQueueItem | null>;
  markStepPresented(stepId: StepId, tx?: Prisma.TransactionClient): Promise<IStep>;
  markStepAnswered(stepId: StepId, tx?: Prisma.TransactionClient): Promise<IMarkStepAnsweredResult>;
  upsertStepAnswerArtifact(
    input: IUpsertStepAnswerArtifactInput,
    tx?: Prisma.TransactionClient
  ): Promise<IStepAnswerArtifact>;
  findStepAnswerArtifactByStepId(stepId: StepId): Promise<IStepAnswerArtifact | null>;
  recordLearnerFeedbackAction(
    input: IRecordLearnerFeedbackActionInput
  ): Promise<ILearnerFeedbackAction>;
  findLearnerFeedbackActions(
    query: IFindLearnerFeedbackActionsQuery
  ): Promise<ILearnerFeedbackAction[]>;
  recordAgentSurfaceExposure(
    input: IRecordAgentSurfaceExposureInput
  ): Promise<IAgentSurfaceExposure>;
  findAgentSurfaceExposures(
    query: IFindAgentSurfaceExposuresQuery
  ): Promise<IAgentSurfaceExposure[]>;
  markStepEvaluatedIfPending(
    stepId: StepId,
    evaluationId: string,
    tx?: Prisma.TransactionClient
  ): Promise<IStep | null>;
  markStepSkipped(
    stepId: StepId,
    reason: string | null,
    tx?: Prisma.TransactionClient
  ): Promise<IStep>;
}

export const SESSION_REPOSITORY = Symbol.for('ISessionRepository');

export type { IPlannedActivityInput, IPlannedStepInput, SessionTerminationReason };
