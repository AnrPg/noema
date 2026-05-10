import type {
  ConceptId,
  CurriculumNodeId,
  EpistemicMode,
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
  selectedNodeIds: CurriculumNodeId[];
  correct: boolean;
  selfRating: StepSelfRating;
  trace: ISevenFrameTraceDto;
  errorType?: string;
  misconceptionRef?: string;
  responseTimeMs?: number;
  hintRequestCount?: number;
  revisionCount?: number;
  recentFailures?: number;
  prerequisiteGapConceptIds?: ConceptId[];
  studyMode: StudyMode;
  epistemicMode: EpistemicMode;
  transformation?: TransformationType;
}

export interface ITrigger {
  id: TriggerId;
  evaluationId?: EvaluationId;
  userId: UserId;
  type: TriggerType;
  severity: number;
  detectedFromFrames: string[];
  conceptRefs: ConceptId[];
  selectedNodeIds: CurriculumNodeId[];
  studyMode: StudyMode;
  stepId?: StepId;
  sessionId?: SessionId;
  misconceptionRef: string;
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
  selectedNodeIds: CurriculumNodeId[];
  correct: boolean;
  correctnessScore: number;
  selfRating: StepSelfRating;
  reasoningQuality: number;
  confidenceSignal: number;
  combinedScore: number;
  schedulerRating: SchedulerRating;
  trace: ISevenFrameTraceDto;
  errorType?: string;
  misconceptionRef?: string;
  triggersFired: TriggerId[];
  recommendedAction?: string;
  responseTimeMs: number;
  hintRequestCount: number;
  revisionCount: number;
  studyMode: StudyMode;
  epistemicMode: EpistemicMode;
  transformation?: TransformationType;
  createdAt: string;
}

export interface IReasoningAverage {
  userId: UserId;
  conceptId: ConceptId;
  studyMode: StudyMode;
  averageReasoning: number;
  sampleCount: number;
  windowSize: number;
  lastEvaluationAt: string;
  recentEvaluationIds: EvaluationId[];
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
