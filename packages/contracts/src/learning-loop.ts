/**
 * Contracts for the Step-first realignment learning loop.
 */

import type {
  ActivityId,
  CardId,
  ConceptId,
  EpistemicMode,
  EvaluationId,
  GeneratedVariantId,
  GoalId,
  GoalSource,
  GoalState,
  GoalType,
  LearningInterventionType,
  LearningMode,
  LessonPlanId,
  ReplanScope,
  RigorLevel,
  SessionId,
  StepId,
  StepSelfRating,
  StepStatus,
  StudyMode,
  TransformationType,
  TriggerId,
  TriggerStatus,
  TriggerType,
  UserId,
} from '@noema/types';

export interface IConceptRefDto {
  conceptId: ConceptId;
  label?: string;
  source?: string;
}

export interface ILessonPlanDto {
  id: LessonPlanId;
  sessionId: SessionId;
  userId: UserId;
  studyMode: StudyMode;
  learningMode: LearningMode;
  rigorLevel: RigorLevel;
  topic: string;
  prerequisites: IConceptRefDto[];
  sourceDecks: string[];
  sourceCategories: string[];
  assessmentStrategy?: string;
  adaptationRules?: string;
  guardianValidationId?: string;
  state: 'draft' | 'validated' | 'active' | 'completed' | 'abandoned';
  goals: ILessonPlanGoalDto[];
  steps: IStepDto[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ILessonPlanGoalDto {
  id: GoalId;
  lessonPlanId: LessonPlanId;
  description: string;
  type: GoalType;
  parentGoalId?: GoalId;
  state: GoalState;
  source: GoalSource;
  conceptRefs: ConceptId[];
  createdAt: string;
  updatedAt: string;
}

export type ActivityContentSourceDto =
  | { type: 'card'; cardId: CardId }
  | { type: 'generated'; variantId: GeneratedVariantId; templateId?: string };

export interface IActivityDto {
  id: ActivityId;
  stepId: StepId;
  contentSource: ActivityContentSourceDto;
  prompt: string;
  expectedResponseType: string;
  renderPayload?: unknown;
  variantSeed: string;
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
  evaluationId?: EvaluationId;
  guardianValidationId?: string;
  presentedAt?: string;
  answeredAt?: string;
  evaluatedAt?: string;
  supersededByStepId?: StepId;
  activities: IActivityDto[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ISevenFrameTraceFrameDto {
  score: number;
  notes: string;
}

export interface ISevenFrameTraceDto {
  frames: {
    f0: ISevenFrameTraceFrameDto;
    f1: ISevenFrameTraceFrameDto;
    f2: ISevenFrameTraceFrameDto;
    f3: ISevenFrameTraceFrameDto;
    f4: ISevenFrameTraceFrameDto;
    f5: ISevenFrameTraceFrameDto;
    f6: ISevenFrameTraceFrameDto;
  };
}

export interface IEvaluationDto {
  id: EvaluationId;
  stepId: StepId;
  sessionId: SessionId;
  userId: UserId;
  conceptRefs: ConceptId[];
  correct: boolean;
  selfRating: StepSelfRating;
  reasoningQuality: number;
  confidenceSignal: number;
  combinedScore: number;
  trace: ISevenFrameTraceDto;
  errorType?: string;
  misconceptionRef?: string;
  triggersFired: TriggerId[];
  recommendedAction: string;
  createdAt: string;
}

export interface ITriggerDto {
  id: TriggerId;
  userId: UserId;
  type: TriggerType;
  severity: number;
  detectedFrom: string[];
  context: {
    conceptRefs: ConceptId[];
    stepId: StepId;
    sessionId: SessionId;
  };
  recommendedIntervention: LearningInterventionType;
  status: TriggerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IReplanDto {
  sessionId: SessionId;
  lessonPlanId: LessonPlanId;
  triggerIds: TriggerId[];
  scope: ReplanScope;
  interventionType: LearningInterventionType;
  supersededStepIds: StepId[];
  insertedSteps: IStepDto[];
  guardianValidationId?: string;
  committedAt?: string;
}
