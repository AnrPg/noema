/**
 * @noema/session-service - Service-Internal Types
 *
 * Domain types used within the session service.
 * These map to the Prisma models but are service-internal (not in @noema/types).
 */

import type {
  AttemptId,
  AttemptOutcome,
  CardId,
  CardQueueStatus,
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
  SchedulingAlgorithm,
  SessionId,
  SessionTerminationReason,
  StudyMode,
  TeachingApproach,
  UserId,
} from '@noema/types';

export interface ISchedulerLaneMix {
  retention: number;
  calibration: number;
}

export type AdaptiveCheckpointSignal =
  | 'confidence_drift'
  | 'latency_spike'
  | 'error_cascade'
  | 'streak_break'
  | 'manual';

export interface ICognitivePolicySnapshot {
  pacingPolicy: {
    targetSecondsPerCard: number;
    hardCapSecondsPerCard: number;
    slowdownOnError: boolean;
  };
  hintPolicy: {
    maxHintsPerCard: number;
    progressiveHintsOnly: boolean;
    allowAnswerReveal: boolean;
  };
  commitPolicy: {
    requireConfidenceBeforeCommit: boolean;
    requireVerificationGate: boolean;
  };
  reflectionPolicy: {
    postAttemptReflection: boolean;
    postSessionReflection: boolean;
  };
}

export interface ISessionBlueprint {
  blueprintVersion: 'v1';
  generatedAt: string;
  generatedBy: 'agent';
  deckQueryId: string;
  initialCardIds: string[];
  laneMix: ISchedulerLaneMix;
  checkpointSignals: AdaptiveCheckpointSignal[];
  policySnapshot: ICognitivePolicySnapshot;
  assumptions: string[];
}

export interface IAdaptiveCheckpointDirective {
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

/**
 * Cohort handshake state machine:
 *
 *   PROPOSED  ──► ACCEPTED ──► COMMITTED  (terminal)
 *       ▲             │
 *       └── REVISED ◄─┘
 *
 * CANCELLED is reserved for future use (e.g. user- or system-initiated
 * cancellation before commit). It exists in the Prisma enum to avoid a
 * migration when the feature is implemented but has no transition path today.
 */
export const SessionCohortHandshakeStatus = {
  PROPOSED: 'proposed',
  ACCEPTED: 'accepted',
  REVISED: 'revised',
  COMMITTED: 'committed',
  /** @reserved — no transition path implemented yet. */
  CANCELLED: 'cancelled',
} as const;

export type SessionCohortHandshakeStatus =
  (typeof SessionCohortHandshakeStatus)[keyof typeof SessionCohortHandshakeStatus];

export interface ISessionCohortLinkage {
  proposalId: string;
  decisionId: string;
}

export interface ISessionCohortHandshake {
  id: string;
  sessionId: SessionId;
  proposalId: string;
  decisionId: string;
  revision: number;
  status: SessionCohortHandshakeStatus;
  candidateCardIds: CardId[];
  acceptedCardIds: CardId[] | null;
  rejectedCardIds: CardId[] | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface IProposeCohortInput {
  linkage: ISessionCohortLinkage;
  revision: number;
  candidateCardIds: CardId[];
  metadata?: Record<string, unknown>;
}

export interface IAcceptCohortInput {
  linkage: ISessionCohortLinkage;
  expectedRevision: number;
  acceptedCardIds: CardId[];
  rejectedCardIds: CardId[];
  metadata?: Record<string, unknown>;
}

export interface IReviseCohortInput {
  linkage: ISessionCohortLinkage;
  expectedRevision: number;
  newRevision: number;
  candidateCardIds: CardId[];
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface ICommitCohortInput {
  linkage: ISessionCohortLinkage;
  expectedRevision: number;
  committedCardIds: CardId[];
  rejectedCardIds: CardId[];
  policyVersion?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Session State Enum (service-internal FSM state)
// ============================================================================

export const SessionState = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
  EXPIRED: 'expired',
} as const;

export type SessionState = (typeof SessionState)[keyof typeof SessionState];

// ============================================================================
// Session Config (immutable after creation)
// ============================================================================

export interface ISessionConfig {
  maxCards?: number;
  maxDurationMinutes?: number;
  sessionTimeoutHours: number;
  categoryIds?: string[];
  cardTypes?: string[];
}

// ============================================================================
// Session Statistics (mutable — updated on each attempt)
// ============================================================================

export interface ISessionStats {
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
  ratingDistribution: Record<string, number>;
}

export function createEmptyStats(): ISessionStats {
  return {
    totalAttempts: 0,
    correctCount: 0,
    incorrectCount: 0,
    skippedCount: 0,
    averageResponseTimeMs: 0,
    averageConfidence: null,
    averageCalibrationDelta: null,
    retentionRate: 0,
    streakCurrent: 0,
    streakBest: 0,
    totalHintsUsed: 0,
    uniqueCardsReviewed: 0,
    newCardsIntroduced: 0,
    lapsedCards: 0,
    ratingDistribution: { again: 0, hard: 0, good: 0, easy: 0 },
  };
}

// ============================================================================
// Session Entity
// ============================================================================

export interface ISession {
  id: SessionId;
  userId: UserId;
  deckQueryId: DeckQueryLogId;
  state: SessionState;
  learningMode: LearningMode;
  studyMode: StudyMode;
  teachingApproach: TeachingApproach;
  schedulingAlgorithm: SchedulingAlgorithm;
  loadoutId: LoadoutId | null;
  loadoutArchetype: LoadoutArchetype | null;
  forceLevel: ForceLevel | null;
  config: ISessionConfig;
  stats: ISessionStats;
  initialQueueSize: number;
  pauseCount: number;
  totalPausedDurationMs: number;
  lastPausedAt: string | null;
  startedAt: string;
  lastActivityAt: string;
  completedAt: string | null;
  terminationReason: SessionTerminationReason | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Attempt Context Snapshot
// ============================================================================

export interface IAttemptContext {
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

// ============================================================================
// Prior Scheduling State
// ============================================================================

export interface IPriorScheduling {
  algorithm: SchedulingAlgorithm;
  stability?: number;
  difficulty?: number;
  elapsedDays: number;
  retrievability?: number;
  intervalDays?: number;
  lapseCount?: number;
  reviewCount?: number;
  leitnerBox?: number;
  sm2EaseFactor?: number;
}

// ============================================================================
// Attempt Entity
// ============================================================================

export interface IAttempt {
  id: AttemptId;
  sessionId: SessionId;
  cardId: CardId;
  userId: UserId;
  sequenceNumber: number;
  outcome: AttemptOutcome;
  rating: Rating;
  ratingValue: number;
  responseTimeMs: number;
  dwellTimeMs: number;
  timeToFirstInteractionMs: number | null;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  calibrationDelta: number | null;
  wasRevisedBeforeCommit: boolean;
  revisionCount: number;
  hintRequestCount: number;
  hintDepthReached: HintDepth;
  contextSnapshot: IAttemptContext;
  priorSchedulingState: IPriorScheduling | null;
  traceId: string | null;
  diagnosisId: string | null;
  createdAt: string;
}

// ============================================================================
// Session Queue Item
// ============================================================================

export interface ISessionQueueItem {
  id: string;
  sessionId: SessionId;
  cardId: CardId;
  position: number;
  status: CardQueueStatus;
  injectedBy: string | null;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Input Types (for create/update operations)
// ============================================================================

export interface IStartSessionInput {
  deckQueryId: DeckQueryLogId;
  learningMode: LearningMode;
  studyMode?: StudyMode;
  teachingApproach?: TeachingApproach;
  schedulingAlgorithm?: SchedulingAlgorithm;
  loadoutId?: LoadoutId;
  loadoutArchetype?: LoadoutArchetype;
  config: ISessionConfig;
  initialCardIds: CardId[];
  blueprint?: ISessionBlueprint;
  offlineIntentToken?: string;
}

export interface IValidateSessionBlueprintInput {
  blueprint: ISessionBlueprint;
}

export interface IValidateSessionBlueprintResult {
  valid: boolean;
  errors: string[];
  normalizedCheckpointSignals: AdaptiveCheckpointSignal[];
}

export interface IEvaluateAdaptiveCheckpointInput {
  trigger: AdaptiveCheckpointSignal;
  lastAttemptResponseTimeMs?: number;
  rollingAverageResponseTimeMs?: number;
  recentIncorrectStreak?: number;
  confidenceDrift?: number;
}

export interface IEvaluateAdaptiveCheckpointResult {
  shouldAdapt: boolean;
  directives: IAdaptiveCheckpointDirective[];
  reason: string;
}

export interface IRecordAttemptInput {
  cardId: CardId;
  outcome: AttemptOutcome;
  rating: Rating;
  ratingValue: number;
  responseTimeMs: number;
  dwellTimeMs: number;
  timeToFirstInteractionMs?: number;
  confidenceBefore?: number;
  confidenceAfter?: number;
  wasRevisedBeforeCommit: boolean;
  revisionCount?: number;
  hintRequestCount?: number;
  hintDepthReached: HintDepth;
  contextSnapshot: IAttemptContext;
  priorSchedulingState?: IPriorScheduling;
}

export interface IRequestHintInput {
  hintDepth: HintDepth;
  hintRequestNumber: number;
  responseTimeMsAtRequest: number;
}

export interface IInjectQueueInput {
  cardId: CardId;
  position: number;
  reason: string;
  injectedBy?: string;
}

export interface IRemoveQueueInput {
  cardId: CardId;
  reason: string;
  removedBy?: string;
}

export interface IUpdateStrategyInput {
  newLoadoutId: LoadoutId;
  newLoadoutArchetype: LoadoutArchetype;
  newForceLevel: ForceLevel;
  trigger: string;
}

export interface IChangeTeachingInput {
  newApproach: TeachingApproach;
  trigger: string;
}

// ============================================================================
// Session Filters (for list queries)
// ============================================================================

export type SessionSortBy =
  | 'createdAt'
  | 'completedAt'
  | 'totalAttempts'
  | 'durationMs'
  | 'retentionRate';

export type SortOrder = 'asc' | 'desc';

export interface ISessionFilters {
  state?: SessionState;
  learningMode?: LearningMode;
  studyMode?: StudyMode;
  /** Only sessions created on or after this ISO timestamp */
  createdAfter?: string;
  /** Only sessions created on or before this ISO timestamp */
  createdBefore?: string;
  /** Only COMPLETED sessions completed on or after this ISO timestamp */
  completedAfter?: string;
  /** Only COMPLETED sessions completed on or before this ISO timestamp */
  completedBefore?: string;
  /** Filter to sessions for a specific deck */
  deckId?: string;
  /** Minimum total attempts (from stats) */
  minAttempts?: number;
  /** Sort field */
  sortBy?: SessionSortBy;
  /** Sort direction */
  sortOrder?: SortOrder;
}
