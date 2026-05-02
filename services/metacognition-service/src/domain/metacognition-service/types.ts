import type {
  ConceptId,
  EvaluationId,
  LearningInterventionType,
  LessonPlanId,
  SchedulerRating,
  SessionId,
  StepId,
  StepSelfRating,
  StudyMode,
  TransformationType,
  TriggerId,
  TriggerStatus,
  TriggerType,
  UserId,
} from '@noema/types';
import type { ISevenFrameTraceDto } from '@noema/contracts';

export interface IRecordEvaluationInput {
  evaluationId?: EvaluationId;
  stepId: StepId;
  lessonPlanId: LessonPlanId;
  sessionId: SessionId;
  userId: UserId;
  conceptRefs: ConceptId[];
  correct: boolean;
  selfRating: StepSelfRating;
  trace: ISevenFrameTraceDto;
  errorType?: string;
  misconceptionRef?: string;
  responseTimeMs?: number;
  recentFailures?: number;
  prerequisiteGapConceptIds?: ConceptId[];
  studyMode?: StudyMode;
  transformation?: TransformationType;
}

export interface ITrigger {
  id: TriggerId;
  evaluationId: EvaluationId;
  userId: UserId;
  type: TriggerType;
  severity: number;
  detectedFrom: string[];
  conceptRefs: ConceptId[];
  stepId: StepId;
  sessionId: SessionId;
  recommendedIntervention: LearningInterventionType;
  status: TriggerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IEvaluation {
  id: EvaluationId;
  stepId: StepId;
  lessonPlanId: LessonPlanId;
  sessionId: SessionId;
  userId: UserId;
  conceptRefs: ConceptId[];
  correct: boolean;
  selfRating: StepSelfRating;
  reasoningQuality: number;
  confidenceSignal: number;
  combinedScore: number;
  schedulerRating: SchedulerRating;
  trace: ISevenFrameTraceDto;
  errorType?: string;
  misconceptionRef?: string;
  triggersFired: TriggerId[];
  recommendedAction: string;
  responseTimeMs?: number;
  studyMode: StudyMode;
  transformation?: TransformationType;
  createdAt: string;
}

export interface IReasoningAverage {
  userId: UserId;
  conceptId: ConceptId;
  studyMode: StudyMode;
  average: number;
  sampleCount: number;
  windowSize: number;
  latestEvaluation?: EvaluationId;
  updatedAt: string;
}

export interface IRecordEvaluationResult {
  evaluation: IEvaluation;
  triggers: ITrigger[];
  reasoningAverages: IReasoningAverage[];
}

export interface ITriggerRuleInput {
  evaluationId: EvaluationId;
  userId: UserId;
  stepId: StepId;
  sessionId: SessionId;
  conceptRefs: ConceptId[];
  correct: boolean;
  selfRating: StepSelfRating;
  reasoningQuality: number;
  confidenceSignal: number;
  combinedScore: number;
  errorType?: string;
  misconceptionRef?: string;
  responseTimeMs?: number;
  recentFailures: number;
  prerequisiteGapConceptIds: ConceptId[];
}

export interface ITriggerCandidate {
  type: TriggerType;
  severity: number;
  detectedFrom: string[];
  conceptRefs: ConceptId[];
  recommendedIntervention: LearningInterventionType;
}
