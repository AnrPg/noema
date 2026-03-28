/**
 * Session Domain Event Type Definitions
 *
 * Events emitted by the Session Service covering:
 * - Session lifecycle (start, pause, resume, complete, abandon, expire)
 * - Dynamic queue management (inject, remove cards)
 * - Strategy & teaching approach changes
 * - Attempt recording (the most critical event in Noema)
 * - Hint requests
 *
 * @module @noema/events/session
 */

import type {
  AttemptId,
  AttemptOutcome,
  CardId,
  CardType,
  CategoryId,
  CognitiveLoadLevel,
  DeckQueryLogId,
  FatigueLevel,
  ForceLevel,
  HintDepth,
  LearningMode,
  LoadoutArchetype,
  LoadoutId,
  MotivationSignal,
  Rating,
  RemediationCardType,
  SchedulingAlgorithm,
  SessionId,
  SessionTerminationReason,
  StudyMode,
  TeachingApproach,
  UserId,
} from '@noema/types';
import type { ITypedEvent } from '../types.js';

// ============================================================================
// Session Event Types
// ============================================================================

/**
 * All event types emitted by the Session Service.
 */
export const SessionEventType = {
  // Session lifecycle
  SESSION_STARTED: 'session.started',
  SESSION_PAUSED: 'session.paused',
  SESSION_RESUMED: 'session.resumed',
  SESSION_COMPLETED: 'session.completed',
  SESSION_ABANDONED: 'session.abandoned',
  SESSION_EXPIRED: 'session.expired',

  // Dynamic queue management
  SESSION_QUEUE_INJECTED: 'session.queue.injected',
  SESSION_QUEUE_REMOVED: 'session.queue.removed',

  // Strategy & teaching
  SESSION_STRATEGY_UPDATED: 'session.strategy.updated',
  SESSION_TEACHING_CHANGED: 'session.teaching.changed',

  // Attempts
  ATTEMPT_RECORDED: 'attempt.recorded',
  ATTEMPT_HINT_REQUESTED: 'attempt.hint.requested',

  // Adaptive checkpoints
  SESSION_CHECKPOINT_EVALUATED: 'session.checkpoint.evaluated',

  // Scheduler orchestration handshake
  SESSION_COHORT_PROPOSED: 'session.cohort.proposed',
  SESSION_COHORT_ACCEPTED: 'session.cohort.accepted',
  SESSION_COHORT_REVISED: 'session.cohort.revised',
  SESSION_COHORT_COMMITTED: 'session.cohort.committed',

  // Offline intent tokens
  SESSION_INTENT_TOKEN_ISSUED: 'session.intent_token.issued',
} as const;

export type SessionEventType = (typeof SessionEventType)[keyof typeof SessionEventType];

// ============================================================================
// Shared Sub-Types
// ============================================================================

/** Snapshot of session statistics at the time of event emission. */
export interface ISessionStatsSnapshot {
  totalAttempts: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  averageResponseTimeMs: number;
  averageConfidence: number | null;
  averageCalibrationDelta: number | null;
  retentionRate: number;
  streakCurrent: number;
  streakBest: number;
  totalHintsUsed: number;
  uniqueCardsReviewed: number;
  newCardsIntroduced: number;
  lapsedCards: number;
  /** Breakdown by rating */
  ratingDistribution: Record<Rating, number>;
}

/** Snapshot of context at the time of an attempt. */
export interface IAttemptContextSnapshot {
  learningMode: LearningMode;
  studyMode?: StudyMode;
  teachingApproach: TeachingApproach;
  loadoutArchetype?: LoadoutArchetype;
  forceLevel?: ForceLevel;
  cognitiveLoad?: CognitiveLoadLevel;
  fatigueLevel?: FatigueLevel;
  motivationSignal?: MotivationSignal;
  activeInterventionIds: string[];
}

/** Prior scheduling state for a card at the time of review. */
export interface IPriorSchedulingState {
  algorithm: SchedulingAlgorithm;
  stability?: number;
  difficulty?: number;
  elapsedDays: number;
  retrievability?: number;
  intervalDays?: number;
  lapseCount?: number;
  reviewCount?: number;
  /** Leitner-specific */
  leitnerBox?: number;
  /** SM-2-specific */
  sm2EaseFactor?: number;
}

// ============================================================================
// Session Lifecycle Payloads
// ============================================================================

export interface ISessionStartedPayload {
  userId: UserId;
  deckQueryId: DeckQueryLogId;
  learningMode: LearningMode;
  studyMode?: StudyMode;
  teachingApproach: TeachingApproach;
  schedulingAlgorithm: SchedulingAlgorithm;
  loadoutId?: LoadoutId;
  loadoutArchetype?: LoadoutArchetype;
  config: {
    maxCards?: number;
    maxDurationMinutes?: number;
    sessionTimeoutHours: number;
    categoryIds?: CategoryId[];
    cardTypes?: (CardType | RemediationCardType)[];
  };
  initialQueueSize: number;
}

export interface ISessionPausedPayload {
  userId: UserId;
  reason?: string;
  pauseCount: number;
  activeDurationMs: number;
  attemptsCompleted: number;
}

export interface ISessionResumedPayload {
  userId: UserId;
  pausedDurationMs: number;
  totalPauseCount: number;
}

export interface ISessionCompletedPayload {
  userId: UserId;
  terminationReason: SessionTerminationReason;
  stats: ISessionStatsSnapshot;
  totalDurationMs: number;
  activeDurationMs: number;
}

export interface ISessionAbandonedPayload {
  userId: UserId;
  reason?: string;
  stats: ISessionStatsSnapshot;
  activeDurationMs: number;
  cardsRemaining: number;
}

export interface ISessionExpiredPayload {
  userId: UserId;
  timeoutHours: number;
  stats: ISessionStatsSnapshot;
  lastActivityAt: string;
}

// ============================================================================
// Dynamic Queue Payloads
// ============================================================================

export interface ISessionQueueInjectedPayload {
  userId: UserId;
  cardId: CardId;
  position: number;
  reason: string;
  injectedBy: string;
}

export interface ISessionQueueRemovedPayload {
  userId: UserId;
  cardId: CardId;
  reason: string;
  removedBy: string;
}

// ============================================================================
// Strategy & Teaching Payloads
// ============================================================================

export interface ISessionStrategyUpdatedPayload {
  userId: UserId;
  previousLoadoutId?: LoadoutId;
  newLoadoutId: LoadoutId;
  newLoadoutArchetype: LoadoutArchetype;
  newForceLevel: ForceLevel;
  trigger: string;
}

export interface ISessionTeachingChangedPayload {
  userId: UserId;
  previousApproach: TeachingApproach;
  newApproach: TeachingApproach;
  trigger: string;
}

// ============================================================================
// Attempt Payloads
// ============================================================================

/**
 * The most critical event in Noema's event system.
 * Published after every card review attempt. Consumed by:
 * - Scheduler Service (schedule recomputation)
 * - Metacognition Service (cognitive modeling)
 * - Gamification Service (achievement tracking)
 * - Analytics Service (learning analytics)
 * - Learning Agent (adaptation decisions)
 */
export interface IAttemptRecordedPayload {
  attemptId: AttemptId;
  sessionId: SessionId;
  cardId: CardId;
  userId: UserId;
  sequenceNumber: number;
  studyMode?: StudyMode;

  // Response
  outcome: AttemptOutcome;
  rating: Rating;
  ratingValue: number;

  // Timing
  responseTimeMs: number;
  dwellTimeMs: number;
  timeToFirstInteractionMs?: number;

  // Metacognitive signals
  confidenceBefore?: number;
  confidenceAfter?: number;
  calibrationDelta?: number;
  wasRevisedBeforeCommit: boolean;
  revisionCount: number;
  hintRequestCount: number;
  hintDepthReached: HintDepth;

  // Context snapshot
  contextSnapshot: IAttemptContextSnapshot;

  // Prior scheduling state (for scheduler to compute next state)
  priorSchedulingState?: IPriorSchedulingState;

  // Cross-service references
  traceId?: string;
  diagnosisId?: string;
}

export interface IAttemptHintRequestedPayload {
  attemptId: AttemptId;
  sessionId: SessionId;
  cardId: CardId;
  userId: UserId;
  hintDepth: HintDepth;
  hintRequestNumber: number;
  responseTimeMsAtRequest: number;
}

// ============================================================================
// Adaptive Checkpoint Payloads
// ============================================================================

export interface ISessionCheckpointEvaluatedDirective {
  action:
    | 'rebalance_queue'
    | 'slowdown'
    | 'increase_support'
    | 'reduce_calibration_lane'
    | 'switch_teaching_approach'
    | 'continue';
  reason: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface ISessionCheckpointEvaluatedPayload {
  trigger: 'confidence_drift' | 'latency_spike' | 'error_cascade' | 'streak_break' | 'manual';
  shouldAdapt: boolean;
  directives: ISessionCheckpointEvaluatedDirective[];
}

// ============================================================================
// Scheduler Handshake Payloads
// ============================================================================

export interface ISessionCohortLinkage {
  proposalId: string;
  decisionId: string;
  sessionId: SessionId;
  sessionRevision: number;
  correlationId: string;
}

export interface ISessionCohortProposedPayload {
  userId: UserId;
  linkage: ISessionCohortLinkage;
  candidateCardIds: CardId[];
  constraints?: Record<string, unknown>;
}

export interface ISessionCohortAcceptedPayload {
  userId: UserId;
  linkage: ISessionCohortLinkage;
  acceptedCardIds: CardId[];
  excludedCardIds: CardId[];
}

export interface ISessionCohortRevisedPayload {
  userId: UserId;
  linkage: ISessionCohortLinkage;
  revisionFrom: number;
  revisionTo: number;
  candidateCardIds: CardId[];
  reason: string;
}

export interface ISessionCohortCommittedPayload {
  userId: UserId;
  linkage: ISessionCohortLinkage;
  committedCardIds: CardId[];
  rejectedCardIds: CardId[];
  policyVersion?: string;
}

// ============================================================================
// Offline Intent Token Payloads
// ============================================================================

export interface ISessionIntentTokenIssuedPayload {
  expiresAt: string;
  nonce: string;
}

// ============================================================================
// Typed Event Aliases
// ============================================================================

// Session lifecycle
export type SessionStartedEvent = ITypedEvent<'session.started', 'Session', ISessionStartedPayload>;
export type SessionPausedEvent = ITypedEvent<'session.paused', 'Session', ISessionPausedPayload>;
export type SessionResumedEvent = ITypedEvent<'session.resumed', 'Session', ISessionResumedPayload>;
export type SessionCompletedEvent = ITypedEvent<
  'session.completed',
  'Session',
  ISessionCompletedPayload
>;
export type SessionAbandonedEvent = ITypedEvent<
  'session.abandoned',
  'Session',
  ISessionAbandonedPayload
>;
export type SessionExpiredEvent = ITypedEvent<'session.expired', 'Session', ISessionExpiredPayload>;

// Queue management
export type SessionQueueInjectedEvent = ITypedEvent<
  'session.queue.injected',
  'Session',
  ISessionQueueInjectedPayload
>;
export type SessionQueueRemovedEvent = ITypedEvent<
  'session.queue.removed',
  'Session',
  ISessionQueueRemovedPayload
>;

// Strategy & teaching
export type SessionStrategyUpdatedEvent = ITypedEvent<
  'session.strategy.updated',
  'Session',
  ISessionStrategyUpdatedPayload
>;
export type SessionTeachingChangedEvent = ITypedEvent<
  'session.teaching.changed',
  'Session',
  ISessionTeachingChangedPayload
>;

// Attempts
export type AttemptRecordedEvent = ITypedEvent<
  'attempt.recorded',
  'Attempt',
  IAttemptRecordedPayload
>;
export type AttemptHintRequestedEvent = ITypedEvent<
  'attempt.hint.requested',
  'Attempt',
  IAttemptHintRequestedPayload
>;

export type SessionCheckpointEvaluatedEvent = ITypedEvent<
  'session.checkpoint.evaluated',
  'Session',
  ISessionCheckpointEvaluatedPayload
>;

export type SessionIntentTokenIssuedEvent = ITypedEvent<
  'session.intent_token.issued',
  'Session',
  ISessionIntentTokenIssuedPayload
>;

export type SessionCohortProposedEvent = ITypedEvent<
  'session.cohort.proposed',
  'Session',
  ISessionCohortProposedPayload
>;

export type SessionCohortAcceptedEvent = ITypedEvent<
  'session.cohort.accepted',
  'Session',
  ISessionCohortAcceptedPayload
>;

export type SessionCohortRevisedEvent = ITypedEvent<
  'session.cohort.revised',
  'Session',
  ISessionCohortRevisedPayload
>;

export type SessionCohortCommittedEvent = ITypedEvent<
  'session.cohort.committed',
  'Session',
  ISessionCohortCommittedPayload
>;

/** Union of all session domain events */
export type SessionDomainEvent =
  | SessionStartedEvent
  | SessionPausedEvent
  | SessionResumedEvent
  | SessionCompletedEvent
  | SessionAbandonedEvent
  | SessionExpiredEvent
  | SessionQueueInjectedEvent
  | SessionQueueRemovedEvent
  | SessionStrategyUpdatedEvent
  | SessionTeachingChangedEvent
  | AttemptRecordedEvent
  | AttemptHintRequestedEvent
  | SessionCheckpointEvaluatedEvent
  | SessionIntentTokenIssuedEvent
  | SessionCohortProposedEvent
  | SessionCohortAcceptedEvent
  | SessionCohortRevisedEvent
  | SessionCohortCommittedEvent;
