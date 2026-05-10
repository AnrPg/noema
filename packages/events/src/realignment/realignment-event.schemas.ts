/**
 * Closed-loop learning event schemas.
 *
 * The Step, metacognition, scheduler, KG, and strategy contracts are owned by
 * @noema/learning-kernel. This package re-exports those canonical schemas for
 * Redis publisher/consumer code that still imports @noema/events.
 */

import {
  ConceptStateChangedPayloadSchema,
  LessonPlanEventPayloadSchema,
  MetacognitionEvaluationRecordedPayloadSchema,
  MetacognitionTriggerFiredPayloadSchema,
  SchedulerConceptStateUpdatedPayloadSchema,
  StepAnsweredEventPayloadSchema,
  StepEventPayloadSchema,
  StrategyReplanPayloadSchema,
} from '@noema/learning-kernel';
import {
  ConceptIdSchema,
  UserIdSchema,
} from '@noema/validation';
import { z } from 'zod';
import { createEventSchema } from '../schemas.js';

export {
  ConceptStateChangedPayloadSchema,
  LessonPlanEventPayloadSchema,
  MetacognitionEvaluationRecordedPayloadSchema,
  MetacognitionTriggerFiredPayloadSchema,
  SchedulerConceptStateUpdatedPayloadSchema,
  StepAnsweredEventPayloadSchema,
  StepEventPayloadSchema,
  StrategyReplanPayloadSchema,
};

export const ReasoningAverageUpdatedPayloadSchema = z.object({
  userId: UserIdSchema,
  conceptId: ConceptIdSchema,
  studyMode: z.enum(['language_learning', 'knowledge_gaining']),
  newAverage: z.number().min(0).max(1),
  windowSize: z.number().int().positive(),
});

export const PedagogyValidationRejectedPayloadSchema = z.object({
  validationId: z.string().min(1),
  targetType: z.enum(['lesson_plan', 'step', 'activity', 'replan', 'generated_variant']),
  targetId: z.string().min(1),
  reasonCodes: z.array(z.string().min(1)),
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
  StepAnsweredEventPayloadSchema
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
  'ConceptReasoningRollup',
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
