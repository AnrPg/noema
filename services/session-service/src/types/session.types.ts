/**
 * @noema/session-service - Step-first service-internal types.
 */

import type { ISevenFrameTraceDto } from '@noema/contracts';
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
  StepSelfRating,
  StepStatus,
  StudyMode,
  TransformationType,
  UserId,
} from '@noema/types';

export const ActivityContentSourceType = {
  CARD: 'card',
  TEMPLATE: 'template',
  GENERATED: 'generated',
} as const;

export type ActivityContentSourceType =
  (typeof ActivityContentSourceType)[keyof typeof ActivityContentSourceType];

export const StepQueueStatus = {
  PENDING: 'pending',
  PRESENTED: 'presented',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
  INJECTED: 'injected',
} as const;

export type StepQueueStatus = (typeof StepQueueStatus)[keyof typeof StepQueueStatus];

export type SessionTerminationReason = 'completed' | 'abandoned' | 'expired' | 'system' | string;

export interface ISessionConfig {
  curriculumId?: CurriculumId | undefined;
  curriculumVersionId?: CurriculumVersionId | undefined;
  topic?: string | undefined;
  sourceDecks?: string[] | undefined;
  sourceCategories?: string[] | undefined;
  maxSteps?: number | undefined;
  maxDurationMinutes?: number | undefined;
  sessionTimeoutHours?: number | undefined;
  [key: string]: unknown;
}

export interface ISessionStats {
  stepsPlanned: number;
  stepsPresented: number;
  stepsEvaluated: number;
  stepsSkipped: number;
}

export function createEmptyStats(): ISessionStats {
  return {
    stepsPlanned: 0,
    stepsPresented: 0,
    stepsEvaluated: 0,
    stepsSkipped: 0,
  };
}

export interface ISession {
  id: SessionId;
  userId: UserId;
  curriculumId: CurriculumId;
  curriculumVersionId: CurriculumVersionId | null;
  studyMode: StudyMode;
  learningMode: LearningMode;
  lifecycleState: SessionLifecycleState;
  config: ISessionConfig;
  stats: ISessionStats;
  pauseCount: number;
  totalPausedMs: number;
  startedAt: string;
  lastActivityAt: string;
  completedAt: string | null;
  terminationReason: SessionTerminationReason | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ILessonPlan {
  id: LessonPlanId;
  sessionId: SessionId;
  userId: UserId;
  curriculumId: CurriculumId;
  curriculumVersionId: CurriculumVersionId;
  selectedNodeIds: CurriculumNodeId[];
  studyMode: StudyMode;
  learningMode: LearningMode;
  rigorLevel: RigorLevel;
  topic: string;
  prerequisites: ConceptId[];
  sourceDecks: string[];
  sourceCategories: string[];
  assessmentStrategy: string | null;
  adaptationRules: string | null;
  guardianValidationId: string | null;
  state: LessonPlanState;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ILessonPlanGoal {
  id: GoalId;
  lessonPlanId: LessonPlanId;
  description: string;
  type: GoalType;
  parentGoalId: GoalId | null;
  state: GoalState;
  source: GoalSource;
  conceptRefs: ConceptId[];
  createdAt: string;
  updatedAt: string;
}

export interface IStep {
  id: StepId;
  lessonPlanId: LessonPlanId;
  sessionId: SessionId;
  userId: UserId;
  studyMode: StudyMode;
  position: number;
  objective: string;
  servesGoalIds: GoalId[];
  eligibleModes: EpistemicMode[];
  selectedMode: EpistemicMode;
  transformationType: TransformationType;
  expectedOutcome: string;
  evaluationType: string;
  difficulty: number;
  isRepair: boolean;
  conceptRefs: ConceptId[];
  variantSeed: string;
  status: StepStatus;
  evaluationId: EvaluationId | null;
  guardianValidationId: string | null;
  presentedAt: string | null;
  answeredAt: string | null;
  evaluatedAt: string | null;
  supersededByStepId: StepId | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  activities?: IActivity[];
}

export interface IStepQueueItem {
  id: string;
  sessionId: SessionId;
  stepId: StepId;
  position: number;
  status: StepQueueStatus;
  injectedBy: string | null;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  step?: IStep;
}

export interface IActivity {
  id: ActivityId;
  stepId: StepId;
  position: number;
  contentSourceType: ActivityContentSourceType;
  cardId: string | null;
  templateId: string | null;
  generatedVariantId: string | null;
  prompt: string;
  renderPayload: Record<string, unknown>;
  expectedResponseType: string;
  responseSchema: Record<string, unknown>;
  variantSeed: string;
  generationFallbackReason: string | null;
}

export interface IStartSessionInput {
  curriculumId: CurriculumId;
  curriculumVersionId?: CurriculumVersionId;
  studyMode?: StudyMode;
  learningMode?: LearningMode;
  config?: ISessionConfig;
  topic?: string;
  sourceDecks?: string[];
  sourceCategories?: string[];
  offlineIntentToken?: string;
}

export interface ICreateLessonPlanInput {
  curriculumId?: CurriculumId | undefined;
  curriculumVersionId?: CurriculumVersionId | undefined;
  selectedNodeIds?: CurriculumNodeId[] | undefined;
  rigorLevel?: RigorLevel | undefined;
  topic?: string | undefined;
  prerequisites?: ConceptId[] | undefined;
  sourceDecks?: string[] | undefined;
  sourceCategories?: string[] | undefined;
  assessmentStrategy?: string | undefined;
  adaptationRules?: string | undefined;
  steps?: IPlannedStepInput[] | undefined;
}

export interface ICreateGoalInput {
  description: string;
  type: GoalType;
  parentGoalId?: GoalId | undefined;
  state?: GoalState | undefined;
  source?: GoalSource | undefined;
  conceptRefs?: ConceptId[] | undefined;
}

export interface IPlannedActivityInput {
  contentSourceType?: ActivityContentSourceType | undefined;
  cardId?: string | undefined;
  templateId?: string | undefined;
  generatedVariantId?: string | undefined;
  prompt: string;
  renderPayload?: Record<string, unknown> | undefined;
  expectedResponseType?: string | undefined;
  responseSchema?: Record<string, unknown> | undefined;
  variantSeed?: string | undefined;
  generationFallbackReason?: string | undefined;
}

export interface IPlannedStepInput {
  objective: string;
  servesGoalIds?: GoalId[] | undefined;
  eligibleModes?: EpistemicMode[] | undefined;
  selectedMode?: EpistemicMode | undefined;
  transformationType?: TransformationType | undefined;
  expectedOutcome: string;
  evaluationType?: string | undefined;
  difficulty?: number | undefined;
  isRepair?: boolean | undefined;
  conceptRefs?: ConceptId[] | undefined;
  variantSeed?: string | undefined;
  activities?: IPlannedActivityInput[] | undefined;
}

export interface IAnswerStepInput {
  response?: unknown;
  correct: boolean;
  selfRating: StepSelfRating;
  evaluationId?: EvaluationId;
  trace: ISevenFrameTraceDto;
  responseTimeMs?: number;
}

export interface ISkipStepInput {
  reason?: string;
  skippedBy?: string;
}

export interface ISessionFilters {
  lifecycleState?: SessionLifecycleState;
  learningMode?: LearningMode;
  studyMode?: StudyMode;
  createdAfter?: string;
  createdBefore?: string;
  completedAfter?: string;
  completedBefore?: string;
}

export type SessionSortBy = 'createdAt' | 'completedAt' | 'lastActivityAt';
export type SortOrder = 'asc' | 'desc';

export interface IStepLoopSnapshot {
  session: ISession;
  lessonPlan: ILessonPlan;
  nextStep: IStep | null;
}
