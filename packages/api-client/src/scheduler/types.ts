import type { IApiResponse } from '@noema/contracts';
import type {
  ConceptId,
  EvaluationId,
  SchedulerQueue,
  StepId,
  StudyMode,
  TransformationType,
  UserId,
} from '@noema/types';

export type SchedulingAlgorithm = 'fsrs' | 'hlr' | 'sm2' | 'leitner';
export type SchedulerRating = 'again' | 'hard' | 'good' | 'easy';

export interface IConceptScheduleStateDto {
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
  lastEvaluationId: EvaluationId | null;
  lastStepId: StepId | null;
  suspendedUntil: string | null;
  suspendedReason: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface IDueConceptsQuery {
  studyMode?: StudyMode;
  queue?: SchedulerQueue;
  asOf?: string;
  limit?: number;
}

export interface IConceptScheduleQuery {
  studyMode: StudyMode;
}

export interface ITransformationHistoryQuery {
  studyMode?: StudyMode;
  limit?: number;
}

export interface IConceptTransformationHistoryDto {
  userId: UserId;
  conceptId: ConceptId;
  studyMode: StudyMode;
  transformation: TransformationType;
  usedAt: string;
  evaluationId: EvaluationId;
}

export interface IDueConceptsDto {
  concepts: IConceptScheduleStateDto[];
}

export interface ITransformationHistoryDto {
  history: IConceptTransformationHistoryDto[];
}

export type DueConceptsQuery = IDueConceptsQuery;
export type ConceptScheduleQuery = IConceptScheduleQuery;
export type TransformationHistoryQuery = ITransformationHistoryQuery;
export type ConceptScheduleStateDto = IConceptScheduleStateDto;
export type ConceptTransformationHistoryDto = IConceptTransformationHistoryDto;
export type DueConceptsResponse = IApiResponse<IDueConceptsDto>;
export type ConceptScheduleResponse = IApiResponse<IConceptScheduleStateDto>;
export type TransformationHistoryResponse = IApiResponse<ITransformationHistoryDto>;
