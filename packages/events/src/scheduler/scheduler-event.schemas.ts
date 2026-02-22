/**
 * Scheduler Domain Event Zod Schemas
 *
 * Provides runtime validation for all scheduler domain events.
 * Each event has a payload schema and a full envelope schema
 * created via createEventSchema().
 *
 * @module @noema/events/scheduler
 */

import {
  AttemptIdSchema,
  CardIdSchema,
  CardLearningStateSchema,
  DeckQueryLogIdSchema,
  RatingSchema,
  ScheduleIdSchema,
  SchedulingAlgorithmSchema,
  UserIdSchema,
} from '@noema/validation';
import { z } from 'zod';
import { createEventSchema } from '../schemas.js';

// ============================================================================
// Schedule Lifecycle Payload Schemas
// ============================================================================

export const ScheduleCreatedPayloadSchema = z.object({
  scheduleId: ScheduleIdSchema,
  cardId: CardIdSchema,
  userId: UserIdSchema,
  deckQueryId: DeckQueryLogIdSchema.optional(),
  algorithm: SchedulingAlgorithmSchema,
  initialState: CardLearningStateSchema,
  dueAt: z.string().datetime(),
  initialRating: RatingSchema,
});

export const ScheduleUpdatedPayloadSchema = z.object({
  scheduleId: ScheduleIdSchema,
  cardId: CardIdSchema,
  userId: UserIdSchema,
  attemptId: AttemptIdSchema,
  algorithm: SchedulingAlgorithmSchema,
  rating: RatingSchema,
  ratingValue: z.number().int().min(1).max(4),

  // State transition
  previousState: CardLearningStateSchema,
  newState: CardLearningStateSchema,

  // Algorithm output
  previousIntervalDays: z.number().nonnegative().optional(),
  newIntervalDays: z.number().nonnegative(),
  previousStability: z.number().nonnegative().optional(),
  newStability: z.number().nonnegative().optional(),
  previousDifficulty: z.number().min(0).max(10).optional(),
  newDifficulty: z.number().min(0).max(10).optional(),
  retrievability: z.number().min(0).max(1).optional(),
  elapsedDays: z.number().nonnegative(),

  // Schedule
  previousDueAt: z.string().datetime(),
  newDueAt: z.string().datetime(),

  // Agent override
  wasAgentOverridden: z.boolean(),
  agentFinalIntervalDays: z.number().nonnegative().optional(),
  overrideReason: z.string().optional(),
});

export const ScheduleOverriddenPayloadSchema = z.object({
  scheduleId: ScheduleIdSchema,
  cardId: CardIdSchema,
  userId: UserIdSchema,
  algorithm: SchedulingAlgorithmSchema,
  originalIntervalDays: z.number().nonnegative(),
  finalIntervalDays: z.number().nonnegative(),
  adjustmentFactor: z.number(),
  overrideReason: z.string(),
  agentId: z.string(),
  contextSignals: z.record(z.unknown()),
});

// ============================================================================
// Due Notification Payload Schemas
// ============================================================================

export const ScheduleDuePayloadSchema = z.object({
  scheduleId: ScheduleIdSchema,
  cardId: CardIdSchema,
  userId: UserIdSchema,
  algorithm: SchedulingAlgorithmSchema,
  retrievability: z.number().min(0).max(1),
  overdueDays: z.number(),
  cardLearningState: CardLearningStateSchema,
});

export const ScheduleDueBatchPayloadSchema = z.object({
  userId: UserIdSchema,
  cards: z.array(
    z.object({
      scheduleId: ScheduleIdSchema,
      cardId: CardIdSchema,
      dueAt: z.string().datetime(),
      retrievability: z.number().min(0).max(1),
      algorithm: SchedulingAlgorithmSchema,
    })
  ),
  dueWithinHours: z.number().positive(),
  totalCount: z.number().int().nonnegative(),
});

// ============================================================================
// State Transition Payload Schemas
// ============================================================================

export const ScheduleLapsedPayloadSchema = z.object({
  scheduleId: ScheduleIdSchema,
  cardId: CardIdSchema,
  userId: UserIdSchema,
  algorithm: SchedulingAlgorithmSchema,
  lapseCount: z.number().int().positive(),
  previousStability: z.number().nonnegative().optional(),
  newStability: z.number().nonnegative().optional(),
  previousState: CardLearningStateSchema,
});

export const ScheduleGraduatedPayloadSchema = z.object({
  scheduleId: ScheduleIdSchema,
  cardId: CardIdSchema,
  userId: UserIdSchema,
  algorithm: SchedulingAlgorithmSchema,
  firstReviewIntervalDays: z.number().positive(),
  stability: z.number().nonnegative().optional(),
  difficulty: z.number().min(0).max(10).optional(),
});

export const ScheduleMaturedPayloadSchema = z.object({
  scheduleId: ScheduleIdSchema,
  cardId: CardIdSchema,
  userId: UserIdSchema,
  algorithm: SchedulingAlgorithmSchema,
  intervalDays: z.number().positive(),
  stability: z.number().nonnegative().optional(),
  totalReviews: z.number().int().positive(),
  maturityThresholdDays: z.number().positive(),
});

// ============================================================================
// Analytics & Prediction Payload Schemas
// ============================================================================

export const ScheduleRetentionPredictedPayloadSchema = z.object({
  scheduleId: ScheduleIdSchema,
  cardId: CardIdSchema,
  userId: UserIdSchema,
  algorithm: SchedulingAlgorithmSchema,
  retrievability: z.number().min(0).max(1),
  daysUntilOptimal: z.number(),
  daysOverdue: z.number(),
  stability: z.number().nonnegative().optional(),
});

// ============================================================================
// Configuration Payload Schemas
// ============================================================================

export const ScheduleConfigUpdatedPayloadSchema = z.object({
  userId: UserIdSchema,
  deckQueryId: DeckQueryLogIdSchema.optional(),
  algorithm: SchedulingAlgorithmSchema,
  previousConfig: z.record(z.unknown()),
  newConfig: z.record(z.unknown()),
  previousRequestRetention: z.number().min(0).max(1).optional(),
  newRequestRetention: z.number().min(0).max(1).optional(),
});

export const ScheduleWeightsPersonalizedPayloadSchema = z.object({
  userId: UserIdSchema,
  deckQueryId: DeckQueryLogIdSchema.optional(),
  algorithm: SchedulingAlgorithmSchema,
  previousWeights: z.array(z.number()),
  newWeights: z.array(z.number()),
  reviewCountAtOptimization: z.number().int().positive(),
  improvementMetric: z.number().optional(),
});

// ============================================================================
// Full Event Schemas (Envelope + Payload)
// ============================================================================

export const ScheduleCreatedEventSchema = createEventSchema(
  'schedule.created',
  'Schedule',
  ScheduleCreatedPayloadSchema
);

export const ScheduleUpdatedEventSchema = createEventSchema(
  'schedule.updated',
  'Schedule',
  ScheduleUpdatedPayloadSchema
);

export const ScheduleOverriddenEventSchema = createEventSchema(
  'schedule.overridden',
  'Schedule',
  ScheduleOverriddenPayloadSchema
);

export const ScheduleDueEventSchema = createEventSchema(
  'schedule.due',
  'Schedule',
  ScheduleDuePayloadSchema
);

export const ScheduleDueBatchEventSchema = createEventSchema(
  'schedule.due.batch',
  'Schedule',
  ScheduleDueBatchPayloadSchema
);

export const ScheduleLapsedEventSchema = createEventSchema(
  'schedule.lapsed',
  'Schedule',
  ScheduleLapsedPayloadSchema
);

export const ScheduleGraduatedEventSchema = createEventSchema(
  'schedule.graduated',
  'Schedule',
  ScheduleGraduatedPayloadSchema
);

export const ScheduleMaturedEventSchema = createEventSchema(
  'schedule.matured',
  'Schedule',
  ScheduleMaturedPayloadSchema
);

export const ScheduleRetentionPredictedEventSchema = createEventSchema(
  'schedule.retention.predicted',
  'Schedule',
  ScheduleRetentionPredictedPayloadSchema
);

export const ScheduleConfigUpdatedEventSchema = createEventSchema(
  'schedule.config.updated',
  'Schedule',
  ScheduleConfigUpdatedPayloadSchema
);

export const ScheduleWeightsPersonalizedEventSchema = createEventSchema(
  'schedule.weights.personalized',
  'Schedule',
  ScheduleWeightsPersonalizedPayloadSchema
);

// ============================================================================
// Type Inference from Schemas
// ============================================================================

export type ScheduleCreatedEventInput = z.input<typeof ScheduleCreatedEventSchema>;
export type ScheduleUpdatedEventInput = z.input<typeof ScheduleUpdatedEventSchema>;
export type ScheduleOverriddenEventInput = z.input<typeof ScheduleOverriddenEventSchema>;
export type ScheduleDueEventInput = z.input<typeof ScheduleDueEventSchema>;
export type ScheduleDueBatchEventInput = z.input<typeof ScheduleDueBatchEventSchema>;
export type ScheduleLapsedEventInput = z.input<typeof ScheduleLapsedEventSchema>;
export type ScheduleGraduatedEventInput = z.input<typeof ScheduleGraduatedEventSchema>;
export type ScheduleMaturedEventInput = z.input<typeof ScheduleMaturedEventSchema>;
export type ScheduleRetentionPredictedEventInput = z.input<
  typeof ScheduleRetentionPredictedEventSchema
>;
export type ScheduleConfigUpdatedEventInput = z.input<typeof ScheduleConfigUpdatedEventSchema>;
export type ScheduleWeightsPersonalizedEventInput = z.input<
  typeof ScheduleWeightsPersonalizedEventSchema
>;
