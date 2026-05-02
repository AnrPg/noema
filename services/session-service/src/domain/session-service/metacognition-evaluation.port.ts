import type { ISevenFrameTraceDto } from '@noema/contracts';
import type {
  ConceptId,
  EvaluationId,
  LessonPlanId,
  SessionId,
  StepId,
  StepSelfRating,
  StudyMode,
  TransformationType,
  UserId,
} from '@noema/types';

export interface IRecordStepEvaluationInput {
  evaluationId: EvaluationId;
  stepId: StepId;
  lessonPlanId: LessonPlanId;
  sessionId: SessionId;
  userId: UserId;
  conceptRefs: ConceptId[];
  correct: boolean;
  selfRating: StepSelfRating;
  trace: ISevenFrameTraceDto;
  responseTimeMs?: number;
  studyMode: StudyMode;
  transformation: TransformationType;
}

export interface IRecordStepEvaluationResult {
  evaluationId: EvaluationId;
}

export interface IMetacognitionEvaluationPort {
  recordStepEvaluation(input: IRecordStepEvaluationInput): Promise<IRecordStepEvaluationResult>;
}
