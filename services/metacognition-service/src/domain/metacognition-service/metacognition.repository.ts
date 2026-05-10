import type { ConceptId, EvaluationId, StudyMode, UserId } from '@noema/types';
import type { IEvaluation, IReasoningAverage, ITrigger } from './types.js';

export interface IMetacognitionRepository {
  findEvaluationByStepId(stepId: string): Promise<IEvaluation | null>;
  createEvaluationWithTriggers(
    evaluation: IEvaluation,
    triggers: ITrigger[]
  ): Promise<{ evaluation: IEvaluation; triggers: ITrigger[] }>;
  updateReasoningAverage(params: {
    userId: UserId;
    conceptId: ConceptId;
    studyMode: StudyMode;
    evaluationId: EvaluationId;
    windowSize: number;
  }): Promise<IReasoningAverage>;
  getReasoningAverage(
    userId: UserId,
    conceptId: ConceptId,
    studyMode: StudyMode
  ): Promise<IReasoningAverage | null>;
  findRecentEvaluations(query: {
    userId: UserId;
    conceptIds?: ConceptId[];
    studyMode?: StudyMode;
    since?: string;
    limit: number;
  }): Promise<IEvaluation[]>;
}
