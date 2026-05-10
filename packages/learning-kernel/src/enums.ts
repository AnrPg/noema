import {
  CardOriginMode,
  CardReviewState,
  ConceptState,
  CurriculumEdgeType,
  CurriculumNodeRuntimeState,
  CurriculumOriginMode,
  CurriculumRevisionReason,
  CurriculumState,
  CurriculumVersionState,
  EpistemicMode,
  GoalSource,
  GoalState,
  GoalType,
  LearningInterventionType,
  LearningMode,
  ReplanScope,
  RevisionChangeKind,
  RevisionChangeState,
  RigorLevel,
  SchedulerQueue,
  StepSelfRating,
  StepStatus,
  StudyMode,
  TransformationType,
  TriggerType,
} from '@noema/types';
import { z } from 'zod';

function values<T extends Record<string, string>>(value: T): [T[keyof T], ...T[keyof T][]] {
  return Object.values(value) as [T[keyof T], ...T[keyof T][]];
}

export const StudyModeSchema = z.enum(values(StudyMode));
export const LearningModeSchema = z.enum(values(LearningMode));
export const RigorLevelSchema = z.enum(values(RigorLevel));
export const GoalTypeSchema = z.enum(values(GoalType));
export const GoalStateSchema = z.enum(values(GoalState));
export const GoalSourceSchema = z.enum(values(GoalSource));
export const StepStatusSchema = z.enum(values(StepStatus));
export const StepSelfRatingSchema = z.enum(values(StepSelfRating));
export const EpistemicModeSchema = z.enum(values(EpistemicMode));
export const TransformationTypeSchema = z.enum(values(TransformationType));
export const TriggerTypeSchema = z.enum(values(TriggerType));
export const LearningInterventionTypeSchema = z.enum(values(LearningInterventionType));
export const ReplanScopeSchema = z.enum(values(ReplanScope));
export const SchedulerQueueSchema = z.enum(values(SchedulerQueue));
export const ConceptStateSchema = z.enum(values(ConceptState));
export const CurriculumStateSchema = z.enum(values(CurriculumState));
export const CurriculumVersionStateSchema = z.enum(values(CurriculumVersionState));
export const CurriculumNodeRuntimeStateSchema = z.enum(values(CurriculumNodeRuntimeState));
export const CurriculumEdgeTypeSchema = z.enum(values(CurriculumEdgeType));
export const CurriculumOriginModeSchema = z.enum(values(CurriculumOriginMode));
export const CurriculumRevisionReasonSchema = z.enum(values(CurriculumRevisionReason));
export const RevisionChangeKindSchema = z.enum(values(RevisionChangeKind));
export const RevisionChangeStateSchema = z.enum(values(RevisionChangeState));
export const CardOriginModeSchema = z.enum(values(CardOriginMode));
export const CardReviewStateSchema = z.enum(values(CardReviewState));
