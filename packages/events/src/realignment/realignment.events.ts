/**
 * Step-first learning loop domain events.
 */

import type {
  ConceptId,
  ConceptState,
  EvaluationId,
  LearningInterventionType,
  LessonPlanId,
  ReplanScope,
  SchedulerQueue,
  SessionId,
  StepId,
  StudyMode,
  TransformationType,
  TriggerId,
  TriggerType,
  UserId,
} from '@noema/types';
import type { ITypedEvent } from '../types.js';

export const LessonPlanEventType = {
  LESSON_PLAN_CREATED: 'lesson_plan.created',
  LESSON_PLAN_VALIDATED: 'lesson_plan.validated',
  LESSON_PLAN_ACTIVATED: 'lesson_plan.activated',
  LESSON_PLAN_COMPLETED: 'lesson_plan.completed',
} as const;

export type LessonPlanEventType = (typeof LessonPlanEventType)[keyof typeof LessonPlanEventType];

export const StepEventType = {
  STEP_PLANNED: 'step.planned',
  STEP_PRESENTED: 'step.presented',
  STEP_ANSWERED: 'step.answered',
  STEP_EVALUATED: 'step.evaluated',
} as const;

export type StepEventType = (typeof StepEventType)[keyof typeof StepEventType];

export const MetacognitionEventType = {
  METACOGNITION_EVALUATION_RECORDED: 'metacognition.evaluation.recorded',
  METACOGNITION_TRIGGER_FIRED: 'metacognition.trigger.fired',
  REASONING_AVERAGE_UPDATED: 'metacognition.reasoning_average.updated',
} as const;

export type MetacognitionEventType =
  (typeof MetacognitionEventType)[keyof typeof MetacognitionEventType];

export const StrategyEventType = {
  STRATEGY_REPLAN_PROPOSED: 'strategy.replan.proposed',
  STRATEGY_REPLAN_COMMITTED: 'strategy.replan.committed',
} as const;

export type StrategyEventType = (typeof StrategyEventType)[keyof typeof StrategyEventType];

export const PedagogyEventType = {
  PEDAGOGY_VALIDATION_REJECTED: 'pedagogy.validation.rejected',
} as const;

export type PedagogyEventType = (typeof PedagogyEventType)[keyof typeof PedagogyEventType];

export const KnowledgeGraphLearningEventType = {
  KNOWLEDGE_GRAPH_CONCEPT_STATE_CHANGED: 'knowledge_graph.concept_state.changed',
} as const;

export type KnowledgeGraphLearningEventType =
  (typeof KnowledgeGraphLearningEventType)[keyof typeof KnowledgeGraphLearningEventType];

export const SchedulerLearningEventType = {
  SCHEDULER_CONCEPT_STATE_UPDATED: 'scheduler.concept_state.updated',
} as const;

export type SchedulerLearningEventType =
  (typeof SchedulerLearningEventType)[keyof typeof SchedulerLearningEventType];

export const GamificationEventType = {
  GAMIFICATION_BADGE_GRANTED: 'gamification.badge.granted',
  GAMIFICATION_BADGE_REVOKED: 'gamification.badge.revoked',
} as const;

export type GamificationEventType =
  (typeof GamificationEventType)[keyof typeof GamificationEventType];

export type LearningLoopEventType =
  | LessonPlanEventType
  | StepEventType
  | MetacognitionEventType
  | StrategyEventType
  | PedagogyEventType
  | SchedulerLearningEventType
  | KnowledgeGraphLearningEventType
  | GamificationEventType;

export interface ILessonPlanEventPayload {
  lessonPlanId: LessonPlanId;
  sessionId: SessionId;
  userId: UserId;
}

export interface IStepEventPayload {
  stepId: StepId;
  lessonPlanId: LessonPlanId;
  sessionId: SessionId;
  userId: UserId;
}

export interface IMetacognitionEvaluationRecordedPayload {
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
}

export interface IMetacognitionTriggerFiredPayload {
  triggerId: TriggerId;
  userId: UserId;
  type: TriggerType;
  severity: number;
  conceptRefs: ConceptId[];
  stepId: StepId;
  sessionId: SessionId;
  recommendedIntervention: LearningInterventionType;
}

export interface IReasoningAverageUpdatedPayload {
  userId: UserId;
  conceptId: ConceptId;
  studyMode: StudyMode;
  newAverage: number;
  windowSize: number;
}

export interface IStrategyReplanPayload {
  lessonPlanId: LessonPlanId;
  sessionId: SessionId;
  userId: UserId;
  triggerIds: TriggerId[];
  scope: ReplanScope;
  interventionType: LearningInterventionType;
  supersededStepIds: StepId[];
  insertedStepIds: StepId[];
}

export interface IPedagogyValidationRejectedPayload {
  validationId: string;
  targetType: 'lesson_plan' | 'step' | 'activity' | 'replan' | 'generated_variant';
  targetId: string;
  reasonCodes: string[];
}

export interface IConceptStateChangedPayload {
  userId: UserId;
  conceptId: ConceptId;
  studyMode: StudyMode;
  previousState: ConceptState;
  newState: ConceptState;
  changedAt: string;
}

export interface ISchedulerConceptStateUpdatedPayload {
  userId: UserId;
  conceptId: ConceptId;
  studyMode: StudyMode;
  previousQueue: SchedulerQueue;
  queue: SchedulerQueue;
  dueAt: string;
  evaluationId: EvaluationId;
  stepId: StepId;
  reviewCount: number;
  intervalDays: number;
  stability?: number;
  halfLife?: number;
}

export interface IGamificationBadgePayload {
  userId: UserId;
  badgeId: string;
  reason: string;
  conceptId?: ConceptId;
}

export type LessonPlanCreatedEvent = ITypedEvent<
  'lesson_plan.created',
  'LessonPlan',
  ILessonPlanEventPayload
>;
export type LessonPlanValidatedEvent = ITypedEvent<
  'lesson_plan.validated',
  'LessonPlan',
  ILessonPlanEventPayload
>;
export type LessonPlanActivatedEvent = ITypedEvent<
  'lesson_plan.activated',
  'LessonPlan',
  ILessonPlanEventPayload
>;
export type LessonPlanCompletedEvent = ITypedEvent<
  'lesson_plan.completed',
  'LessonPlan',
  ILessonPlanEventPayload
>;
export type StepPlannedEvent = ITypedEvent<'step.planned', 'Step', IStepEventPayload>;
export type StepPresentedEvent = ITypedEvent<'step.presented', 'Step', IStepEventPayload>;
export type StepAnsweredEvent = ITypedEvent<'step.answered', 'Step', IStepEventPayload>;
export type StepEvaluatedEvent = ITypedEvent<'step.evaluated', 'Step', IStepEventPayload>;
export type MetacognitionEvaluationRecordedEvent = ITypedEvent<
  'metacognition.evaluation.recorded',
  'Evaluation',
  IMetacognitionEvaluationRecordedPayload
>;
export type MetacognitionTriggerFiredEvent = ITypedEvent<
  'metacognition.trigger.fired',
  'Trigger',
  IMetacognitionTriggerFiredPayload
>;
export type ReasoningAverageUpdatedEvent = ITypedEvent<
  'metacognition.reasoning_average.updated',
  'ConceptReasoningAverage',
  IReasoningAverageUpdatedPayload
>;
export type StrategyReplanProposedEvent = ITypedEvent<
  'strategy.replan.proposed',
  'Replan',
  IStrategyReplanPayload
>;
export type StrategyReplanCommittedEvent = ITypedEvent<
  'strategy.replan.committed',
  'Replan',
  IStrategyReplanPayload
>;
export type PedagogyValidationRejectedEvent = ITypedEvent<
  'pedagogy.validation.rejected',
  'GuardianValidation',
  IPedagogyValidationRejectedPayload
>;
export type KnowledgeGraphConceptStateChangedEvent = ITypedEvent<
  'knowledge_graph.concept_state.changed',
  'ConceptStateProjection',
  IConceptStateChangedPayload
>;
export type SchedulerConceptStateUpdatedEvent = ITypedEvent<
  'scheduler.concept_state.updated',
  'ConceptScheduleState',
  ISchedulerConceptStateUpdatedPayload
>;
export type GamificationBadgeGrantedEvent = ITypedEvent<
  'gamification.badge.granted',
  'GamificationBadge',
  IGamificationBadgePayload
>;
export type GamificationBadgeRevokedEvent = ITypedEvent<
  'gamification.badge.revoked',
  'GamificationBadge',
  IGamificationBadgePayload
>;

export type LearningLoopDomainEvent =
  | LessonPlanCreatedEvent
  | LessonPlanValidatedEvent
  | LessonPlanActivatedEvent
  | LessonPlanCompletedEvent
  | StepPlannedEvent
  | StepPresentedEvent
  | StepAnsweredEvent
  | StepEvaluatedEvent
  | MetacognitionEvaluationRecordedEvent
  | MetacognitionTriggerFiredEvent
  | ReasoningAverageUpdatedEvent
  | StrategyReplanProposedEvent
  | StrategyReplanCommittedEvent
  | PedagogyValidationRejectedEvent
  | SchedulerConceptStateUpdatedEvent
  | KnowledgeGraphConceptStateChangedEvent
  | GamificationBadgeGrantedEvent
  | GamificationBadgeRevokedEvent;
