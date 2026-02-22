/**
 * Session Domain Event Zod Schemas
 *
 * Provides runtime validation for all session domain events.
 * Each event has a payload schema and a full envelope schema
 * created via createEventSchema().
 *
 * @module @noema/events/session
 */

import {
  AttemptIdSchema,
  AttemptOutcomeSchema,
  CardIdSchema,
  CardTypeSchema,
  CategoryIdSchema,
  CognitiveLoadLevelSchema,
  DeckQueryLogIdSchema,
  FatigueLevelSchema,
  ForceLevelSchema,
  HintDepthSchema,
  LearningModeSchema,
  LoadoutArchetypeSchema,
  LoadoutIdSchema,
  MotivationSignalSchema,
  RatingSchema,
  RemediationCardTypeSchema,
  SchedulingAlgorithmSchema,
  SessionIdSchema,
  SessionTerminationReasonSchema,
  TeachingApproachSchema,
  UserIdSchema,
} from '@noema/validation';
import { z } from 'zod';
import { createEventSchema } from '../schemas.js';

// ============================================================================
// Shared Sub-Schemas
// ============================================================================

/** Zod schema for session statistics snapshot. */
export const SessionStatsSnapshotSchema = z.object({
  totalAttempts: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  incorrectCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  averageResponseTimeMs: z.number().nonnegative(),
  averageConfidence: z.number().min(0).max(1).nullable(),
  averageCalibrationDelta: z.number().nullable(),
  retentionRate: z.number().min(0).max(1),
  streakCurrent: z.number().int().nonnegative(),
  streakBest: z.number().int().nonnegative(),
  totalHintsUsed: z.number().int().nonnegative(),
  uniqueCardsReviewed: z.number().int().nonnegative(),
  newCardsIntroduced: z.number().int().nonnegative(),
  lapsedCards: z.number().int().nonnegative(),
  ratingDistribution: z.record(RatingSchema, z.number().int().nonnegative()),
});

/** Zod schema for attempt context snapshot. */
export const AttemptContextSnapshotSchema = z.object({
  learningMode: LearningModeSchema,
  teachingApproach: TeachingApproachSchema,
  loadoutArchetype: LoadoutArchetypeSchema.optional(),
  forceLevel: ForceLevelSchema.optional(),
  cognitiveLoad: CognitiveLoadLevelSchema.optional(),
  fatigueLevel: FatigueLevelSchema.optional(),
  motivationSignal: MotivationSignalSchema.optional(),
  activeInterventionIds: z.array(z.string()),
});

/** Zod schema for prior scheduling state. */
export const PriorSchedulingStateSchema = z.object({
  algorithm: SchedulingAlgorithmSchema,
  stability: z.number().nonnegative().optional(),
  difficulty: z.number().min(0).max(10).optional(),
  elapsedDays: z.number().nonnegative(),
  retrievability: z.number().min(0).max(1).optional(),
  intervalDays: z.number().nonnegative().optional(),
  lapseCount: z.number().int().nonnegative().optional(),
  reviewCount: z.number().int().nonnegative().optional(),
  leitnerBox: z.number().int().min(0).max(10).optional(),
  sm2EaseFactor: z.number().min(1.3).optional(),
});

// ============================================================================
// Session Lifecycle Payload Schemas
// ============================================================================

export const SessionStartedPayloadSchema = z.object({
  userId: UserIdSchema,
  deckQueryId: DeckQueryLogIdSchema,
  learningMode: LearningModeSchema,
  teachingApproach: TeachingApproachSchema,
  schedulingAlgorithm: SchedulingAlgorithmSchema,
  loadoutId: LoadoutIdSchema.optional(),
  loadoutArchetype: LoadoutArchetypeSchema.optional(),
  config: z.object({
    maxCards: z.number().int().positive().optional(),
    maxDurationMinutes: z.number().int().positive().optional(),
    sessionTimeoutHours: z.number().positive(),
    categoryIds: z.array(CategoryIdSchema).optional(),
    cardTypes: z.array(z.union([CardTypeSchema, RemediationCardTypeSchema])).optional(),
  }),
  initialQueueSize: z.number().int().nonnegative(),
});

export const SessionPausedPayloadSchema = z.object({
  userId: UserIdSchema,
  reason: z.string().optional(),
  pauseCount: z.number().int().positive(),
  activeDurationMs: z.number().nonnegative(),
  attemptsCompleted: z.number().int().nonnegative(),
});

export const SessionResumedPayloadSchema = z.object({
  userId: UserIdSchema,
  pausedDurationMs: z.number().nonnegative(),
  totalPauseCount: z.number().int().nonnegative(),
});

export const SessionCompletedPayloadSchema = z.object({
  userId: UserIdSchema,
  terminationReason: SessionTerminationReasonSchema,
  stats: SessionStatsSnapshotSchema,
  totalDurationMs: z.number().nonnegative(),
  activeDurationMs: z.number().nonnegative(),
});

export const SessionAbandonedPayloadSchema = z.object({
  userId: UserIdSchema,
  reason: z.string().optional(),
  stats: SessionStatsSnapshotSchema,
  activeDurationMs: z.number().nonnegative(),
  cardsRemaining: z.number().int().nonnegative(),
});

export const SessionExpiredPayloadSchema = z.object({
  userId: UserIdSchema,
  timeoutHours: z.number().positive(),
  stats: SessionStatsSnapshotSchema,
  lastActivityAt: z.string().datetime(),
});

// ============================================================================
// Queue Payload Schemas
// ============================================================================

export const SessionQueueInjectedPayloadSchema = z.object({
  userId: UserIdSchema,
  cardId: CardIdSchema,
  position: z.number().int().nonnegative(),
  reason: z.string(),
  injectedBy: z.string(),
});

export const SessionQueueRemovedPayloadSchema = z.object({
  userId: UserIdSchema,
  cardId: CardIdSchema,
  reason: z.string(),
  removedBy: z.string(),
});

// ============================================================================
// Strategy & Teaching Payload Schemas
// ============================================================================

export const SessionStrategyUpdatedPayloadSchema = z.object({
  userId: UserIdSchema,
  previousLoadoutId: LoadoutIdSchema.optional(),
  newLoadoutId: LoadoutIdSchema,
  newLoadoutArchetype: LoadoutArchetypeSchema,
  newForceLevel: ForceLevelSchema,
  trigger: z.string(),
});

export const SessionTeachingChangedPayloadSchema = z.object({
  userId: UserIdSchema,
  previousApproach: TeachingApproachSchema,
  newApproach: TeachingApproachSchema,
  trigger: z.string(),
});

// ============================================================================
// Attempt Payload Schemas
// ============================================================================

export const AttemptRecordedPayloadSchema = z.object({
  attemptId: AttemptIdSchema,
  sessionId: SessionIdSchema,
  cardId: CardIdSchema,
  userId: UserIdSchema,
  sequenceNumber: z.number().int().positive(),

  // Response
  outcome: AttemptOutcomeSchema,
  rating: RatingSchema,
  ratingValue: z.number().int().min(1).max(4),

  // Timing
  responseTimeMs: z.number().nonnegative(),
  dwellTimeMs: z.number().nonnegative(),
  timeToFirstInteractionMs: z.number().nonnegative().optional(),

  // Metacognitive signals
  confidenceBefore: z.number().min(0).max(1).optional(),
  confidenceAfter: z.number().min(0).max(1).optional(),
  calibrationDelta: z.number().min(-1).max(1).optional(),
  wasRevisedBeforeCommit: z.boolean(),
  revisionCount: z.number().int().nonnegative(),
  hintRequestCount: z.number().int().nonnegative(),
  hintDepthReached: HintDepthSchema,

  // Context snapshot
  contextSnapshot: AttemptContextSnapshotSchema,

  // Prior scheduling state
  priorSchedulingState: PriorSchedulingStateSchema.optional(),

  // Cross-service references
  traceId: z.string().optional(),
  diagnosisId: z.string().optional(),
});

export const AttemptHintRequestedPayloadSchema = z.object({
  attemptId: AttemptIdSchema,
  sessionId: SessionIdSchema,
  cardId: CardIdSchema,
  userId: UserIdSchema,
  hintDepth: HintDepthSchema,
  hintRequestNumber: z.number().int().positive(),
  responseTimeMsAtRequest: z.number().nonnegative(),
});

// ============================================================================
// Full Event Schemas (Envelope + Payload)
// ============================================================================

export const SessionStartedEventSchema = createEventSchema(
  'session.started',
  'Session',
  SessionStartedPayloadSchema
);

export const SessionPausedEventSchema = createEventSchema(
  'session.paused',
  'Session',
  SessionPausedPayloadSchema
);

export const SessionResumedEventSchema = createEventSchema(
  'session.resumed',
  'Session',
  SessionResumedPayloadSchema
);

export const SessionCompletedEventSchema = createEventSchema(
  'session.completed',
  'Session',
  SessionCompletedPayloadSchema
);

export const SessionAbandonedEventSchema = createEventSchema(
  'session.abandoned',
  'Session',
  SessionAbandonedPayloadSchema
);

export const SessionExpiredEventSchema = createEventSchema(
  'session.expired',
  'Session',
  SessionExpiredPayloadSchema
);

export const SessionQueueInjectedEventSchema = createEventSchema(
  'session.queue.injected',
  'Session',
  SessionQueueInjectedPayloadSchema
);

export const SessionQueueRemovedEventSchema = createEventSchema(
  'session.queue.removed',
  'Session',
  SessionQueueRemovedPayloadSchema
);

export const SessionStrategyUpdatedEventSchema = createEventSchema(
  'session.strategy.updated',
  'Session',
  SessionStrategyUpdatedPayloadSchema
);

export const SessionTeachingChangedEventSchema = createEventSchema(
  'session.teaching.changed',
  'Session',
  SessionTeachingChangedPayloadSchema
);

export const AttemptRecordedEventSchema = createEventSchema(
  'attempt.recorded',
  'Attempt',
  AttemptRecordedPayloadSchema
);

export const AttemptHintRequestedEventSchema = createEventSchema(
  'attempt.hint.requested',
  'Attempt',
  AttemptHintRequestedPayloadSchema
);

// ============================================================================
// Type Inference from Schemas
// ============================================================================

export type SessionStartedEventInput = z.input<typeof SessionStartedEventSchema>;
export type SessionPausedEventInput = z.input<typeof SessionPausedEventSchema>;
export type SessionResumedEventInput = z.input<typeof SessionResumedEventSchema>;
export type SessionCompletedEventInput = z.input<typeof SessionCompletedEventSchema>;
export type SessionAbandonedEventInput = z.input<typeof SessionAbandonedEventSchema>;
export type SessionExpiredEventInput = z.input<typeof SessionExpiredEventSchema>;
export type SessionQueueInjectedEventInput = z.input<typeof SessionQueueInjectedEventSchema>;
export type SessionQueueRemovedEventInput = z.input<typeof SessionQueueRemovedEventSchema>;
export type SessionStrategyUpdatedEventInput = z.input<typeof SessionStrategyUpdatedEventSchema>;
export type SessionTeachingChangedEventInput = z.input<typeof SessionTeachingChangedEventSchema>;
export type AttemptRecordedEventInput = z.input<typeof AttemptRecordedEventSchema>;
export type AttemptHintRequestedEventInput = z.input<typeof AttemptHintRequestedEventSchema>;
