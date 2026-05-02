import type { ConceptId, StudyMode, UserId } from '@noema/types';
import type {
  IConceptEvaluationLog,
  IConceptSchedulePatch,
  IConceptScheduleState,
  IConceptScheduleTransitionInput,
  IConceptScheduleTransitionResult,
  IConceptTransformationHistory,
  IDueConceptQuery,
  ITransformationHistoryQuery,
} from '../../types/scheduler.types.js';

export interface IConceptScheduleRepository {
  findState(
    userId: UserId,
    conceptId: ConceptId,
    studyMode: StudyMode
  ): Promise<IConceptScheduleState | null>;

  upsertState(
    state: IConceptScheduleState,
    patch: IConceptSchedulePatch
  ): Promise<IConceptScheduleState>;

  createEvaluationLog(log: IConceptEvaluationLog): Promise<void>;

  createTransformationHistory(entry: IConceptTransformationHistory): Promise<void>;

  recordEvaluationTransition(
    input: IConceptScheduleTransitionInput
  ): Promise<IConceptScheduleTransitionResult>;

  findDueConcepts(query: IDueConceptQuery): Promise<IConceptScheduleState[]>;

  findTransformationHistory(
    query: ITransformationHistoryQuery
  ): Promise<IConceptTransformationHistory[]>;
}
