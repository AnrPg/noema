import type { IApiResponse, ISevenFrameTraceDto } from '@noema/contracts';
import type {
  ConceptId,
  CurriculumId,
  CurriculumNodeId,
  CurriculumVersionId,
  EpistemicMode,
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
  SessionTerminationReason,
  StepId,
  StepSelfRating,
  StepStatus,
  StudyMode,
  TransformationType,
  UserId,
} from '@noema/types';

export type StepQueueStatus = 'pending' | 'presented' | 'completed' | 'skipped' | 'injected';
export type ActivityContentSourceType = 'card' | 'template' | 'generated';

export interface ISessionConfigDto {
  curriculumId?: CurriculumId;
  curriculumVersionId?: CurriculumVersionId;
  topic?: string;
  sourceDecks?: string[];
  sourceCategories?: string[];
  maxSteps?: number;
  maxDurationMinutes?: number;
  sessionTimeoutHours?: number;
  [key: string]: unknown;
}

export interface ISessionStatsDto {
  stepsPlanned: number;
  stepsPresented: number;
  stepsEvaluated: number;
  stepsSkipped: number;
}

export interface ISessionDto {
  id: SessionId;
  userId: UserId;
  curriculumId: CurriculumId;
  curriculumVersionId: CurriculumVersionId | null;
  studyMode: StudyMode;
  learningMode: LearningMode;
  lifecycleState: SessionLifecycleState;
  config: ISessionConfigDto;
  stats: ISessionStatsDto;
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

export interface ILessonPlanDto {
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

export interface ILessonPlanGoalDto {
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

export interface IActivityDto {
  id: string;
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

export interface IStepDto {
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
  evaluationId: string | null;
  guardianValidationId: string | null;
  presentedAt: string | null;
  answeredAt: string | null;
  evaluatedAt: string | null;
  supersededByStepId: StepId | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  activities?: IActivityDto[];
}

export interface IStepLoopSnapshotDto {
  session: ISessionDto;
  lessonPlan: ILessonPlanDto;
  nextStep: IStepDto | null;
}

export interface IStartSessionInput {
  curriculumId: CurriculumId;
  curriculumVersionId?: CurriculumVersionId;
  studyMode?: StudyMode;
  learningMode?: LearningMode;
  config?: ISessionConfigDto;
  topic?: string;
  sourceDecks?: string[];
  sourceCategories?: string[];
  offlineIntentToken?: string;
}

export interface ISessionFilters {
  lifecycleState?: SessionLifecycleState;
  learningMode?: LearningMode;
  studyMode?: StudyMode;
  limit?: number;
  offset?: number;
  createdAfter?: string;
  createdBefore?: string;
  completedAfter?: string;
  completedBefore?: string;
}

export interface ICreateLessonPlanInput {
  curriculumId?: CurriculumId;
  curriculumVersionId?: CurriculumVersionId;
  selectedNodeIds?: CurriculumNodeId[];
  rigorLevel?: RigorLevel;
  topic?: string;
  prerequisites?: ConceptId[];
  sourceDecks?: string[];
  sourceCategories?: string[];
  assessmentStrategy?: string;
  adaptationRules?: string;
  steps?: IPlannedStepInput[];
}

export interface IPlannedStepInput {
  objective: string;
  servesGoalIds?: GoalId[];
  eligibleModes?: EpistemicMode[];
  selectedMode?: EpistemicMode;
  transformationType?: TransformationType;
  expectedOutcome: string;
  evaluationType?: string;
  difficulty?: number;
  isRepair?: boolean;
  conceptRefs?: ConceptId[];
  variantSeed?: string;
  activities?: IPlannedActivityInput[];
}

export interface IPlannedActivityInput {
  contentSourceType?: ActivityContentSourceType;
  cardId?: string;
  templateId?: string;
  generatedVariantId?: string;
  prompt: string;
  renderPayload?: Record<string, unknown>;
  expectedResponseType?: string;
  responseSchema?: Record<string, unknown>;
  variantSeed?: string;
  generationFallbackReason?: string;
}

export interface ICreateLessonPlanResultDto {
  lessonPlan: ILessonPlanDto;
  steps: IStepDto[];
}

export interface ICreateGoalInput {
  description: string;
  type: GoalType;
  parentGoalId?: GoalId;
  state?: GoalState;
  source?: GoalSource;
  conceptRefs?: ConceptId[];
}

export interface IAnswerStepInput {
  response?: unknown;
  correct: boolean;
  selfRating: StepSelfRating;
  evaluationId?: string;
  trace: ISevenFrameTraceDto;
  responseTimeMs?: number;
}

export interface ISkipStepInput {
  reason?: string;
  skippedBy?: string;
}

export interface IOfflineIntentTokenInput {
  userId: UserId;
  sessionBlueprint: unknown;
  expiresInSeconds: number;
}

export interface IOfflineIntentTokenDto {
  token: string;
  expiresAt: string;
  nonce: string;
}

export interface IOfflineIntentVerifyInput {
  token: string;
}

export type SessionDto = ISessionDto;
export type LessonPlanDto = ILessonPlanDto;
export type LessonPlanGoalDto = ILessonPlanGoalDto;
export type StepDto = IStepDto;
export type StartSessionInput = IStartSessionInput;
export type SessionFilters = ISessionFilters;
export type CreateLessonPlanInput = ICreateLessonPlanInput;
export type CreateGoalInput = ICreateGoalInput;
export type AnswerStepInput = IAnswerStepInput;
export type SkipStepInput = ISkipStepInput;
export type OfflineIntentTokenInput = IOfflineIntentTokenInput;
export type OfflineIntentVerifyInput = IOfflineIntentVerifyInput;

export type SessionResponse = IApiResponse<ISessionDto>;
export type SessionsListResponse = IApiResponse<ISessionDto[]>;
export type CreateLessonPlanResponse = IApiResponse<ICreateLessonPlanResultDto>;
export type CreateGoalResponse = IApiResponse<ILessonPlanGoalDto>;
export type StepResponse = IApiResponse<IStepDto>;
export type StepLoopSnapshotResponse = IApiResponse<IStepLoopSnapshotDto>;
export type OfflineTokenResponse = IApiResponse<IOfflineIntentTokenDto>;
export type OfflineVerifyResponse = IApiResponse<unknown>;
