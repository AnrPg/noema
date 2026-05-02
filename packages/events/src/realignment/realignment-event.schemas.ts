/**
 * Zod schemas for Step-first realignment domain events.
 */

import {
  ConceptIdSchema,
  ConceptStateSchema,
  EvaluationIdSchema,
  LearningInterventionTypeSchema,
  LessonPlanIdSchema,
  ReplanScopeSchema,
  SchedulerQueueSchema,
  SessionIdSchema,
  StepIdSchema,
  StudyModeSchema,
  TransformationTypeSchema,
  TriggerIdSchema,
  TriggerTypeSchema,
  UserIdSchema,
} from '@noema/validation';
import { z } from 'zod';
import { createEventSchema } from '../schemas.js';

export const LessonPlanEventPayloadSchema = z.object({
  lessonPlanId: LessonPlanIdSchema,
  sessionId: SessionIdSchema,
  userId: UserIdSchema,
});

export const StepEventPayloadSchema = z.object({
  stepId: StepIdSchema,
  lessonPlanId: LessonPlanIdSchema,
  sessionId: SessionIdSchema,
  userId: UserIdSchema,
});

export const MetacognitionEvaluationRecordedPayloadSchema = z.object({
  evaluationId: EvaluationIdSchema,
  stepId: StepIdSchema,
  sessionId: SessionIdSchema,
  userId: UserIdSchema,
  conceptRefs: z.array(ConceptIdSchema),
  reasoningQuality: z.number().min(0).max(1),
  confidenceSignal: z.number().min(0).max(1),
  combinedScore: z.number().min(0).max(1),
  correct: z.boolean(),
  studyMode: StudyModeSchema.optional(),
  transformation: TransformationTypeSchema.optional(),
});

export const MetacognitionTriggerFiredPayloadSchema = z.object({
  triggerId: TriggerIdSchema,
  userId: UserIdSchema,
  type: TriggerTypeSchema,
  severity: z.number().min(0).max(1),
  conceptRefs: z.array(ConceptIdSchema),
  stepId: StepIdSchema,
  sessionId: SessionIdSchema,
  recommendedIntervention: LearningInterventionTypeSchema,
});

export const ReasoningAverageUpdatedPayloadSchema = z.object({
  userId: UserIdSchema,
  conceptId: ConceptIdSchema,
  studyMode: StudyModeSchema,
  newAverage: z.number().min(0).max(1),
  windowSize: z.number().int().positive(),
});

export const StrategyReplanPayloadSchema = z.object({
  lessonPlanId: LessonPlanIdSchema,
  sessionId: SessionIdSchema,
  userId: UserIdSchema,
  triggerIds: z.array(TriggerIdSchema),
  scope: ReplanScopeSchema,
  interventionType: LearningInterventionTypeSchema,
  supersededStepIds: z.array(StepIdSchema),
  insertedStepIds: z.array(StepIdSchema),
});

export const PedagogyValidationRejectedPayloadSchema = z.object({
  validationId: z.string().min(1),
  targetType: z.enum(['lesson_plan', 'step', 'activity', 'replan', 'generated_variant']),
  targetId: z.string().min(1),
  reasonCodes: z.array(z.string().min(1)),
});

export const ConceptStateChangedPayloadSchema = z.object({
  userId: UserIdSchema,
  conceptId: ConceptIdSchema,
  studyMode: StudyModeSchema,
  previousState: ConceptStateSchema,
  newState: ConceptStateSchema,
  changedAt: z.string().datetime(),
});

export const SchedulerConceptStateUpdatedPayloadSchema = z.object({
  userId: UserIdSchema,
  conceptId: ConceptIdSchema,
  studyMode: StudyModeSchema,
  previousQueue: SchedulerQueueSchema,
  queue: SchedulerQueueSchema,
  dueAt: z.string().datetime(),
  evaluationId: EvaluationIdSchema,
  stepId: StepIdSchema,
  reviewCount: z.number().int().nonnegative(),
  intervalDays: z.number().nonnegative(),
  stability: z.number().positive().optional(),
  halfLife: z.number().positive().optional(),
});

export const GamificationBadgePayloadSchema = z.object({
  userId: UserIdSchema,
  badgeId: z.string().min(1),
  reason: z.string().min(1),
  conceptId: ConceptIdSchema.optional(),
});

export const LessonPlanCreatedEventSchema = createEventSchema(
  'lesson_plan.created',
  'LessonPlan',
  LessonPlanEventPayloadSchema
);
export const LessonPlanValidatedEventSchema = createEventSchema(
  'lesson_plan.validated',
  'LessonPlan',
  LessonPlanEventPayloadSchema
);
export const LessonPlanActivatedEventSchema = createEventSchema(
  'lesson_plan.activated',
  'LessonPlan',
  LessonPlanEventPayloadSchema
);
export const LessonPlanCompletedEventSchema = createEventSchema(
  'lesson_plan.completed',
  'LessonPlan',
  LessonPlanEventPayloadSchema
);
export const StepPlannedEventSchema = createEventSchema(
  'step.planned',
  'Step',
  StepEventPayloadSchema
);
export const StepPresentedEventSchema = createEventSchema(
  'step.presented',
  'Step',
  StepEventPayloadSchema
);
export const StepAnsweredEventSchema = createEventSchema(
  'step.answered',
  'Step',
  StepEventPayloadSchema
);
export const StepEvaluatedEventSchema = createEventSchema(
  'step.evaluated',
  'Step',
  StepEventPayloadSchema
);
export const MetacognitionEvaluationRecordedEventSchema = createEventSchema(
  'metacognition.evaluation.recorded',
  'Evaluation',
  MetacognitionEvaluationRecordedPayloadSchema
);
export const MetacognitionTriggerFiredEventSchema = createEventSchema(
  'metacognition.trigger.fired',
  'Trigger',
  MetacognitionTriggerFiredPayloadSchema
);
export const ReasoningAverageUpdatedEventSchema = createEventSchema(
  'metacognition.reasoning_average.updated',
  'ConceptReasoningAverage',
  ReasoningAverageUpdatedPayloadSchema
);
export const StrategyReplanProposedEventSchema = createEventSchema(
  'strategy.replan.proposed',
  'Replan',
  StrategyReplanPayloadSchema
);
export const StrategyReplanCommittedEventSchema = createEventSchema(
  'strategy.replan.committed',
  'Replan',
  StrategyReplanPayloadSchema
);
export const PedagogyValidationRejectedEventSchema = createEventSchema(
  'pedagogy.validation.rejected',
  'GuardianValidation',
  PedagogyValidationRejectedPayloadSchema
);
export const KnowledgeGraphConceptStateChangedEventSchema = createEventSchema(
  'knowledge_graph.concept_state.changed',
  'ConceptStateProjection',
  ConceptStateChangedPayloadSchema
);
export const SchedulerConceptStateUpdatedEventSchema = createEventSchema(
  'scheduler.concept_state.updated',
  'ConceptScheduleState',
  SchedulerConceptStateUpdatedPayloadSchema
);
export const GamificationBadgeGrantedEventSchema = createEventSchema(
  'gamification.badge.granted',
  'GamificationBadge',
  GamificationBadgePayloadSchema
);
export const GamificationBadgeRevokedEventSchema = createEventSchema(
  'gamification.badge.revoked',
  'GamificationBadge',
  GamificationBadgePayloadSchema
);
