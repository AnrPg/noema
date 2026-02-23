/**
 * Scheduler Domain Event Type Definitions
 *
 * Events emitted by the Scheduler Service covering:
 * - Schedule lifecycle (create, update, agent override)
 * - Due notifications (single card, batch)
 * - State transitions (lapse, graduate, mature)
 * - Retention prediction
 * - Algorithm configuration changes
 *
 * @module @noema/events/scheduler
 */

import type {
  AttemptId,
  CardId,
  CardLearningState,
  DeckQueryLogId,
  Rating,
  ScheduleId,
  SchedulingAlgorithm,
  UserId,
} from '@noema/types';
import type { ITypedEvent } from '../types.js';

// ============================================================================
// Scheduler Event Types
// ============================================================================

/**
 * All event types emitted by the Scheduler Service.
 */
export const SchedulerEventType = {
  // Schedule lifecycle
  SCHEDULE_CREATED: 'schedule.created',
  SCHEDULE_UPDATED: 'schedule.updated',
  SCHEDULE_OVERRIDDEN: 'schedule.overridden',

  // Due notifications
  SCHEDULE_DUE: 'schedule.due',
  SCHEDULE_DUE_BATCH: 'schedule.due.batch',

  // State transitions
  SCHEDULE_LAPSED: 'schedule.lapsed',
  SCHEDULE_GRADUATED: 'schedule.graduated',
  SCHEDULE_MATURED: 'schedule.matured',

  // Analytics & prediction
  SCHEDULE_RETENTION_PREDICTED: 'schedule.retention.predicted',

  // Configuration
  SCHEDULE_CONFIG_UPDATED: 'schedule.config.updated',
  SCHEDULE_WEIGHTS_PERSONALIZED: 'schedule.weights.personalized',

  // Session-scheduler handshake
  SCHEDULE_HANDSHAKE_PROPOSED: 'schedule.handshake.proposed',
  SCHEDULE_HANDSHAKE_ACCEPTED: 'schedule.handshake.accepted',
  SCHEDULE_HANDSHAKE_REVISED: 'schedule.handshake.revised',
  SCHEDULE_HANDSHAKE_COMMITTED: 'schedule.handshake.committed',
} as const;

export type SchedulerEventType = (typeof SchedulerEventType)[keyof typeof SchedulerEventType];

// ============================================================================
// Schedule Lifecycle Payloads
// ============================================================================

export interface IScheduleCreatedPayload {
  scheduleId: ScheduleId;
  cardId: CardId;
  userId: UserId;
  deckQueryId?: DeckQueryLogId;
  algorithm: SchedulingAlgorithm;
  initialState: CardLearningState;
  dueAt: string;
  initialRating: Rating;
}

export interface IScheduleUpdatedPayload {
  scheduleId: ScheduleId;
  cardId: CardId;
  userId: UserId;
  attemptId: AttemptId;
  algorithm: SchedulingAlgorithm;
  rating: Rating;
  ratingValue: number;

  // State transition
  previousState: CardLearningState;
  newState: CardLearningState;

  // Algorithm output
  previousIntervalDays?: number;
  newIntervalDays: number;
  previousStability?: number;
  newStability?: number;
  previousDifficulty?: number;
  newDifficulty?: number;
  retrievability?: number;
  elapsedDays: number;

  // Schedule
  previousDueAt: string;
  newDueAt: string;

  // Agent override
  wasAgentOverridden: boolean;
  agentFinalIntervalDays?: number;
  overrideReason?: string;
}

export interface IScheduleOverriddenPayload {
  scheduleId: ScheduleId;
  cardId: CardId;
  userId: UserId;
  algorithm: SchedulingAlgorithm;
  originalIntervalDays: number;
  finalIntervalDays: number;
  adjustmentFactor: number;
  overrideReason: string;
  agentId: string;
  contextSignals: Record<string, unknown>;
}

// ============================================================================
// Due Notification Payloads
// ============================================================================

export interface IScheduleDuePayload {
  scheduleId: ScheduleId;
  cardId: CardId;
  userId: UserId;
  algorithm: SchedulingAlgorithm;
  retrievability: number;
  overdueDays: number;
  cardLearningState: CardLearningState;
}

export interface IScheduleDueBatchPayload {
  userId: UserId;
  cards: {
    scheduleId: ScheduleId;
    cardId: CardId;
    dueAt: string;
    retrievability: number;
    algorithm: SchedulingAlgorithm;
  }[];
  dueWithinHours: number;
  totalCount: number;
}

// ============================================================================
// State Transition Payloads
// ============================================================================

export interface IScheduleLapsedPayload {
  scheduleId: ScheduleId;
  cardId: CardId;
  userId: UserId;
  algorithm: SchedulingAlgorithm;
  lapseCount: number;
  previousStability?: number;
  newStability?: number;
  previousState: CardLearningState;
}

export interface IScheduleGraduatedPayload {
  scheduleId: ScheduleId;
  cardId: CardId;
  userId: UserId;
  algorithm: SchedulingAlgorithm;
  firstReviewIntervalDays: number;
  stability?: number;
  difficulty?: number;
}

export interface IScheduleMaturedPayload {
  scheduleId: ScheduleId;
  cardId: CardId;
  userId: UserId;
  algorithm: SchedulingAlgorithm;
  intervalDays: number;
  stability?: number;
  totalReviews: number;
  maturityThresholdDays: number;
}

// ============================================================================
// Analytics & Prediction Payloads
// ============================================================================

export interface IScheduleRetentionPredictedPayload {
  scheduleId: ScheduleId;
  cardId: CardId;
  userId: UserId;
  algorithm: SchedulingAlgorithm;
  retrievability: number;
  daysUntilOptimal: number;
  daysOverdue: number;
  stability?: number;
}

// ============================================================================
// Configuration Payloads
// ============================================================================

export interface IScheduleConfigUpdatedPayload {
  userId: UserId;
  deckQueryId?: DeckQueryLogId;
  algorithm: SchedulingAlgorithm;
  previousConfig: Record<string, unknown>;
  newConfig: Record<string, unknown>;
  previousRequestRetention?: number;
  newRequestRetention?: number;
}

export interface IScheduleWeightsPersonalizedPayload {
  userId: UserId;
  deckQueryId?: DeckQueryLogId;
  algorithm: SchedulingAlgorithm;
  previousWeights: number[];
  newWeights: number[];
  reviewCountAtOptimization: number;
  improvementMetric?: number;
}

// ============================================================================
// Handshake Payloads
// ============================================================================

export interface IScheduleHandshakePayload {
  userId: UserId;
  proposalId: string;
  decisionId: string;
  sessionId: string;
  sessionRevision: number;
  correlationId: string;
  sourceEventType: string;
}

export interface IScheduleHandshakeProposedPayload extends IScheduleHandshakePayload {
  candidateCardIds: CardId[];
}

export interface IScheduleHandshakeAcceptedPayload extends IScheduleHandshakePayload {
  acceptedCardIds: CardId[];
  excludedCardIds: CardId[];
}

export interface IScheduleHandshakeRevisedPayload extends IScheduleHandshakePayload {
  revisionFrom: number;
  revisionTo: number;
  candidateCardIds: CardId[];
  reason?: string;
}

export interface IScheduleHandshakeCommittedPayload extends IScheduleHandshakePayload {
  committedCardIds: CardId[];
  rejectedCardIds: CardId[];
}

// ============================================================================
// Typed Event Aliases
// ============================================================================

// Schedule lifecycle
export type ScheduleCreatedEvent = ITypedEvent<
  'schedule.created',
  'Schedule',
  IScheduleCreatedPayload
>;
export type ScheduleUpdatedEvent = ITypedEvent<
  'schedule.updated',
  'Schedule',
  IScheduleUpdatedPayload
>;
export type ScheduleOverriddenEvent = ITypedEvent<
  'schedule.overridden',
  'Schedule',
  IScheduleOverriddenPayload
>;

// Due notifications
export type ScheduleDueEvent = ITypedEvent<'schedule.due', 'Schedule', IScheduleDuePayload>;
export type ScheduleDueBatchEvent = ITypedEvent<
  'schedule.due.batch',
  'Schedule',
  IScheduleDueBatchPayload
>;

// State transitions
export type ScheduleLapsedEvent = ITypedEvent<
  'schedule.lapsed',
  'Schedule',
  IScheduleLapsedPayload
>;
export type ScheduleGraduatedEvent = ITypedEvent<
  'schedule.graduated',
  'Schedule',
  IScheduleGraduatedPayload
>;
export type ScheduleMaturedEvent = ITypedEvent<
  'schedule.matured',
  'Schedule',
  IScheduleMaturedPayload
>;

// Analytics & prediction
export type ScheduleRetentionPredictedEvent = ITypedEvent<
  'schedule.retention.predicted',
  'Schedule',
  IScheduleRetentionPredictedPayload
>;

// Configuration
export type ScheduleConfigUpdatedEvent = ITypedEvent<
  'schedule.config.updated',
  'Schedule',
  IScheduleConfigUpdatedPayload
>;
export type ScheduleWeightsPersonalizedEvent = ITypedEvent<
  'schedule.weights.personalized',
  'Schedule',
  IScheduleWeightsPersonalizedPayload
>;

export type ScheduleHandshakeProposedEvent = ITypedEvent<
  'schedule.handshake.proposed',
  'Schedule',
  IScheduleHandshakeProposedPayload
>;

export type ScheduleHandshakeAcceptedEvent = ITypedEvent<
  'schedule.handshake.accepted',
  'Schedule',
  IScheduleHandshakeAcceptedPayload
>;

export type ScheduleHandshakeRevisedEvent = ITypedEvent<
  'schedule.handshake.revised',
  'Schedule',
  IScheduleHandshakeRevisedPayload
>;

export type ScheduleHandshakeCommittedEvent = ITypedEvent<
  'schedule.handshake.committed',
  'Schedule',
  IScheduleHandshakeCommittedPayload
>;

/** Union of all scheduler domain events */
export type SchedulerDomainEvent =
  | ScheduleCreatedEvent
  | ScheduleUpdatedEvent
  | ScheduleOverriddenEvent
  | ScheduleDueEvent
  | ScheduleDueBatchEvent
  | ScheduleLapsedEvent
  | ScheduleGraduatedEvent
  | ScheduleMaturedEvent
  | ScheduleRetentionPredictedEvent
  | ScheduleConfigUpdatedEvent
  | ScheduleWeightsPersonalizedEvent
  | ScheduleHandshakeProposedEvent
  | ScheduleHandshakeAcceptedEvent
  | ScheduleHandshakeRevisedEvent
  | ScheduleHandshakeCommittedEvent;
