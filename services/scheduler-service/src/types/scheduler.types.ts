import type {
  ConceptId,
  CorrelationId,
  EvaluationId,
  SessionId,
  StepId,
  StudyMode,
  UserId,
} from '@noema/types';

export type SchedulingAlgorithm = 'fsrs' | 'hlr' | 'sm2' | 'leitner';
export type SchedulerQueue = 'new_learning' | 'reinforcement' | 'repair';
export type SchedulerRating = 'again' | 'hard' | 'good' | 'easy';
export type TransformationType =
  | 'recall'
  | 'explanation'
  | 'comparison'
  | 'application'
  | 'perturbation'
  | 'error_detection';

export interface IExecutionContext {
  userId: UserId;
  correlationId: CorrelationId;
}

export interface IConceptScheduleState {
  userId: UserId;
  conceptId: ConceptId;
  studyMode: StudyMode;
  algorithm: SchedulingAlgorithm;
  queue: SchedulerQueue;
  dueAt: string;
  stability: number | null;
  difficulty: number | null;
  halfLife: number | null;
  intervalDays: number;
  reviewCount: number;
  lapseCount: number;
  consecutiveCorrect: number;
  lastEvaluationId: string | null;
  lastStepId: StepId | null;
  suspendedUntil: string | null;
  suspendedReason: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface IConceptSchedulePatch {
  algorithm: SchedulingAlgorithm;
  queue: SchedulerQueue;
  dueAt: string;
  stability: number | null;
  difficulty: number | null;
  halfLife: number | null;
  intervalDays: number;
  reviewCount: number;
  lapseCount: number;
  consecutiveCorrect: number;
  lastEvaluationId: string;
  lastStepId: StepId;
  version: number;
}

export interface IConceptEvaluationLog {
  id: string;
  userId: UserId;
  conceptId: ConceptId;
  studyMode: StudyMode;
  evaluationId: EvaluationId;
  stepId: StepId;
  algorithm: SchedulingAlgorithm;
  schedulerRating: SchedulerRating;
  combinedScore: number;
  priorState: Record<string, unknown>;
  newState: Record<string, unknown>;
  reviewedAt: string;
}

export interface IConceptTransformationHistory {
  userId: UserId;
  conceptId: ConceptId;
  studyMode: StudyMode;
  transformation: TransformationType;
  usedAt: string;
  evaluationId: EvaluationId;
}

export interface IEvaluationRecordedInput {
  evaluationId: EvaluationId;
  stepId: StepId;
  sessionId: SessionId;
  userId: UserId;
  conceptRefs: ConceptId[];
  reasoningQuality: number;
  confidenceSignal: number;
  combinedScore: number;
  correct: boolean;
  studyMode?: StudyMode;
  transformation?: TransformationType;
  recordedAt?: string;
}

export interface IConceptScheduleResult {
  state: IConceptScheduleState;
  previousQueue: SchedulerQueue;
  log: IConceptEvaluationLog;
  replayed: boolean;
}

export interface IConceptScheduleTransitionInput {
  priorState: IConceptScheduleState;
  patch: IConceptSchedulePatch;
  log: IConceptEvaluationLog;
  transformationHistory?: IConceptTransformationHistory;
}

export interface IConceptScheduleTransitionResult {
  state: IConceptScheduleState;
  log: IConceptEvaluationLog;
  replayed: boolean;
}

export interface IDueConceptQuery {
  userId: UserId;
  studyMode?: StudyMode;
  queue?: SchedulerQueue;
  asOf: string;
  limit: number;
}

export interface ITransformationHistoryQuery {
  userId: UserId;
  conceptId: ConceptId;
  studyMode?: StudyMode;
  limit: number;
}
